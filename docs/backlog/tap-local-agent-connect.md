# @sajou/tap — connexion one-click d'agents locaux
Tiers: core | interface
---

## Le problème

Connecter un agent local à sajou demande aujourd'hui de configurer manuellement un
émetteur WebSocket, comprendre le protocole SignalEnvelope, et câbler les événements.
On veut réduire ça à **un clic + un copier-coller**.

## Le modèle inversé

sajou ne peut pas scanner le réseau pour découvrir des agents (sécurité, sandbox browser).
On inverse : sajou **écoute**, l'agent **pousse**.

```
Sajou (scene-builder) ← WebSocket ← @sajou/tap ← agent local
```

## Le parcours UX cible

1. Dans scene-builder, panneau "Signal Sources", bouton "Local Agent"
2. sajou ouvre le port d'écoute (défaut: 9100), affiche la commande à copier
3. L'utilisateur colle `npx @sajou/tap claude` (ou tout autre process) dans son terminal
4. tap se connecte automatiquement, scene-builder détecte la source et commence l'animation
5. Deux gestes : un clic, un copier-coller. Incompressible en mode browser.

## @sajou/tap — le package

Un CLI qui enveloppe n'importe quel process et traduit son activité en signaux sajou.

### Commandes

```bash
# Claude Code — auto-détecte, injecte les hooks
npx @sajou/tap claude

# Wrap générique — parse stdout structuré
npx @sajou/tap -- node my-agent.js
npx @sajou/tap -- python my_crew.py

# Endpoint distant
npx @sajou/tap --endpoint ws://192.168.1.42:9100 -- claude
```

### Ce que tap fait

1. **Détecte** le type de process (Claude Code, Node, Python, générique)
2. **Injecte** les hooks appropriés (ex: `.claude/hooks.json` temporaire pour Claude Code)
3. **Capture** stdout/stderr, parse les événements structurés
4. **Traduit** en `SignalEnvelope` sajou
5. **Pousse** vers le WebSocket du scene-builder (ou tout endpoint sajou)
6. **Nettoie** les hooks temporaires à la fermeture (SIGINT, SIGTERM, exit)

### Adaptateurs par type d'agent

| Agent | Méthode de capture | Signaux produits |
|-------|-------------------|------------------|
| Claude Code | Hooks CLI (PreToolUse, PostToolUse, etc.) | tool_call, tool_result, agent_state_change |
| Claude Agent SDK | Middleware/callback sur le SDK | tool_call, tool_result, token_usage, task_dispatch |
| Stdout structuré (JSON lines) | Parse stdout ligne par ligne | Tout signal dont le type est reconnu |
| Stdout brut | Heuristiques + regex | text_delta, agent_state_change |

### Hooks Claude Code (injectés automatiquement)

```jsonc
{
  "hooks": {
    "PreToolUse": [{ "command": "sajou-emit tool_call $TOOL_NAME" }],
    "PostToolUse": [{ "command": "sajou-emit tool_result $TOOL_NAME" }],
    "SessionStart": [{ "command": "sajou-emit agent_state_change idle acting" }]
  }
}
```

`sajou-emit` est un micro-binaire (ou script) installé par tap, qui envoie un
SignalEnvelope sur le WebSocket déjà ouvert par le process parent tap.

## Côté scene-builder

### Panneau Signal Sources

- Liste les sources connectées en temps réel
- Chaque source affiche : nom, type d'agent, statut (connected/disconnected), dernier signal
- Bouton "Add source" avec options : WebSocket (manuel), API (distant), Local Agent (tap)

### Flow "Local Agent"

1. Clic → ouvre le listener WebSocket si pas déjà actif
2. Affiche la commande `npx @sajou/tap ...` avec bouton copier
3. Indicateur "Waiting for connection..." avec animation
4. Quand tap se connecte : bascule sur la vue live de la source
5. Les signaux arrivent → le choreographer les anime normalement

## Architecture des packages

```
@sajou/tap          → CLI + adaptateurs, dépend de @sajou/schema
@sajou/schema       → définit SignalEnvelope (déjà existant)
scene-builder       → UI du panneau Sources + WebSocket listener
```

tap est un package standalone. Il dépend uniquement de @sajou/schema pour les types
SignalEnvelope. Pas de dépendance vers core ou les thèmes.

## Évolutions futures

- **App desktop** (Electron/Tauri) : accès filesystem, vrai bouton unique sans copier-coller
- **Auto-discovery mDNS** : dans un contexte desktop, sajou pourrait s'annoncer sur le réseau local
- **Multi-agent** : plusieurs tap connectés simultanément, chacun avec un agentId distinct
- **Record & replay** : tap enregistre les signaux bruts pour rejeu offline dans scene-builder
- **Presets communautaires** : adaptateurs pour LangChain, CrewAI, AutoGen, etc.
