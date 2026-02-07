# Sajou — Manifeste

## Ce que c'est

**Sajou est un choreographer visuel pour agents IA.**

Il traduit les événements d'un orchestrateur d'agents (tâches, appels d'outils, coûts, erreurs) en scènes visuelles animées, via un système de chorégraphies thématisables.

Son architecture déclarative est conçue pour être composée par des humains **ou par des IA**.

*Le petit singe qui observe tout depuis les branches.* 🐒

## Le constat

Tous les agents IA du monde partagent la même interface : un chat. OpenClaw, Claude, ChatGPT, Gemini — un champ de texte, des bulles, du streaming de tokens.

Pourtant, les agents deviennent de plus en plus autonomes : multi-étapes, multi-outils, multi-modèles, distribués. Plus ils agissent seuls, plus on a besoin de **voir** ce qu'ils font — pas de le lire ligne par ligne dans un fil de conversation.

Le problème n'est pas l'absence de dashboards. Grafana, Datadog, LangSmith existent. Le problème c'est qu'entre les données brutes et une visualisation vivante, il manque une couche : celle qui décrit **comment** un événement machine devient un mouvement à l'écran. Un langage de mise en scène. Une chorégraphie.

## Le pari

Les données d'un agent IA sont des **signaux** (comme du MIDI, de l'OSC, de l'ArtNet).
Un thème visuel est une **scène** (comme une composition MadMapper ou une timeline After Effects).
Entre les deux, il faut un **choreographer** — le système qui dit : "quand ce signal arrive, joue cette séquence d'actions visuelles".

Personne ne construit cette couche aujourd'hui.

Et parce que cette couche est **déclarative** (du JSON, pas du code arbitraire), elle peut être générée par une IA. Demain, on dit à Claude ou à un agent : "fais-moi un thème Mon Petit Poney pour visualiser mes agents" — et Sajou le joue.

## L'architecture en 3 couches

```
┌─────────────────────────────────────────────┐
│  SIGNAUX (data layer)                       │
│  Ce qui se passe                            │
│  task_dispatch, tool_call, token_usage,     │
│  agent_move, error, completion...           │
│  Format standardisé, backend-agnostique     │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  CHOREOGRAPHER (le cœur de Sajou)           │
│  Ce que ça implique visuellement            │
│  Séquences d'actions déclaratives :         │
│  move, spawn, fly, flash, destroy,          │
│  drawBeam, typeText...                      │
│  Timeline, durées, easings, chaînage,       │
│  interruptions, callbacks                   │
│  Tout est JSON. Tout est composable.        │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  THÈME (render layer)                       │
│  Comment ça se dessine                      │
│  Sprites, modèles 3D, particules, shaders, │
│  sons, typographies, layouts                │
│  Chaque thème = une scène complète          │
│  Chaque thème choisit sa stack de rendu     │
└─────────────────────────────────────────────┘
```

**Un même signal, trois thèmes, trois résultats :**

| Signal | Thème "Citadelle" (WC3) | Thème "Neon" (Cyberpunk) | Thème "Ops" (Minimal) |
|--------|------------------------|--------------------------|----------------------|
| `task_dispatch` | Un peon marche vers la forge, lance un pigeon voyageur qui vole vers l'Oracle | Un nœud pulse en cyan, un beam laser trace la connexion | Une flèche animée relie deux nœuds sur un graphe |
| `tool_call` | Le bâtiment s'illumine, une icône d'ability apparaît dans la grille | Un terminal s'ouvre en glitch, du code défile | Une ligne s'ajoute dans un log horodaté |
| `token_usage` | Les pièces d'or tintent et le compteur descend | Un compteur d'énergie se vide avec un son synthétique | Un chiffre s'incrémente dans un coin |
| `error` | Explosion rouge, unité qui tombe, son de défaite | Écran qui crépite, texte rouge "CRITICAL" | Ligne rouge dans le log |

## Le Choreographer en détail

Le choreographer est le contrat entre les signaux et les thèmes.

### Format déclaratif

Les chorégraphies sont décrites en JSON, pas en code impératif. C'est ce qui permet à une IA de les générer.

```json
{
  "on": "task_dispatch",
  "steps": [
    { "action": "move", "entity": "agent", "to": "signal.to", "duration": 800 },
    { "action": "spawn", "entity": "pigeon", "at": "signal.from" },
    { "action": "fly", "entity": "pigeon", "to": "signal.to", "duration": 1200, "easing": "arc" },
    {
      "action": "onArrive",
      "steps": [
        { "action": "destroy", "entity": "pigeon" },
        { "action": "flash", "target": "signal.to", "color": "gold" }
      ]
    }
  ]
}
```

### Primitives du choreographer

Vocabulaire fini et documenté — le dictionnaire que les IA utilisent pour composer :

| Primitive | Rôle | Paramètres clés |
|-----------|------|-----------------|
| `move` | Déplacer une entité | entity, to, duration, easing |
| `spawn` | Créer une entité visuelle | entity, at, options |
| `destroy` | Retirer une entité | entity |
| `fly` | Déplacement avec trajectoire | entity, to, duration, easing (arc, line, bezier) |
| `flash` | Effet visuel ponctuel | target, color, duration |
| `pulse` | Effet visuel cyclique | target, color, duration, repeat |
| `drawBeam` | Tracer une connexion visuelle | from, to, duration, style |
| `typeText` | Afficher du texte progressivement | text, at, speed |
| `playSound` | Déclencher un son | sound, volume |
| `wait` | Pause dans la séquence | duration |
| `onArrive` | Chaîner après une animation | steps |
| `onInterrupt` | Réagir si annulé/erreur mid-flight | steps |

Le thème fournit les **renderers** pour chaque primitive (comment "move" se dessine dans son contexte visuel). Le choreographer orchestre le timing et le chaînage.

### Format d'entités — question ouverte

Le format de définition des entités dans un thème doit anticiper plusieurs niveaux de complexité :
- Sprites 2D statiques (PNG, SVG)
- Sprites animés (spritesheets, séquences)
- Modèles 3D (glTF, animations skelettales)
- Systèmes de particules
- Shaders / effets procéduraux

Le bon niveau d'abstraction reste à définir. Le format doit être suffisamment expressif pour du rendu riche tout en restant composable par une IA. C'est un des points clés à explorer et challenger en V1.

## Ce que Sajou n'est PAS

- **Pas un orchestrateur d'agents.** Sajou ne décide pas quoi faire. Il montre ce qui se passe.
- **Pas un concurrent d'OpenClaw.** Il peut s'y brancher. Ou sur n'importe quel backend.
- **Pas un dashboard de monitoring classique.** C'est un outil de mise en scène, pas un tableau de métriques.
- **Pas un chatbot.** L'interaction passe par la scène visuelle.
- **Pas un produit enterprise.** C'est un projet personnel d'apprentissage et d'expérimentation. S'il devient bon, il deviendra public.

## Pour qui

**V0 : moi.** Un développeur avec du hardware et des agents qui veut voir ses agents travailler comme on regarde une partie de Starcraft — pas comme on lit des logs.

**V1+ (si ça vaut le coup) :** des devs et créatifs qui veulent une interface de visualisation d'agents qui ne soit pas un Grafana de plus. Des gens qui pensent que l'esthétique d'une interface n'est pas un luxe mais une fonctionnalité.

## Principes de design

1. **Signal → Chorégraphie → Rendu** — Toujours ces 3 couches. Jamais de raccourci signal → rendu direct. La chorégraphie est le produit.

2. **Déclaratif d'abord** — Tout ce qui peut être du JSON doit être du JSON. Les chorégraphies, les thèmes, les layouts, les entités. Le code impératif n'intervient que dans le runtime qui interprète ces déclarations. C'est ce qui rend Sajou composable par des IA.

3. **Le thème est une scène complète** — Pas un skin CSS. Un thème apporte ses entités, ses animations, ses sons, sa disposition spatiale, ses chorégraphies, et choisit sa propre stack de rendu. Changer de thème change tout sauf les données.

4. **Backend-agnostique** — Sajou consomme un flux de signaux standardisé (JSON over WebSocket). Adapter un nouveau backend (OpenClaw, LangChain, custom) = écrire un adaptateur qui traduit ses événements vers le format Sajou.

5. **L'esthétique est le produit** — Un dashboard moche avec les bonnes données, ça existe déjà. Sajou existe parce que l'interface doit donner **envie** de regarder ses agents travailler.

6. **Apprendre en construisant** — Le projet est un lab. Chaque couche est une occasion d'expérimenter (WebSocket, Canvas/WebGL, state machines, animation systems, theming). La perfection n'est pas le but. La compréhension oui.

## Roadmap

### V1 — Le runtime qui marche

L'objectif : un signal entre, une scène animée sort. Un thème complet. Tout fonctionne.

**Couche Signaux**
- [ ] Spécification du protocole de signaux (JSON Schema)
- [ ] Bus de signaux côté frontend (réception WebSocket, normalisation, store réactif)
- [ ] Backend émulateur (service minimal qui émet des signaux de test réalistes)

**Couche Choreographer**
- [ ] Runtime qui interprète les chorégraphies déclaratives (JSON → séquences d'actions)
- [ ] Bibliothèque de primitives (move, spawn, fly, flash, destroy, wait, chain...)
- [ ] Système de séquençage (timeline, durées, easings, interruptions)
- [ ] Gestion des états concurrents (plusieurs chorégraphies en parallèle)

**Couche Thème**
- [ ] Contrat de thème (JSON Schema : entités, layout, chorégraphies, assets)
- [ ] Format d'entités extensible (du sprite 2D au modèle 3D)
- [ ] Renderers pour chaque primitive
- [ ] Thème "Citadelle" (WC3) — premier thème complet, sert de lab pour stabiliser le schema

**Adaptateurs**
- [ ] Adaptateur backend test (signaux simulés)
- [ ] Adaptateur OpenClaw (bridge événements OpenClaw → signaux Sajou)

### V2 — AI-composable

L'objectif : une IA peut générer un thème ou modifier une chorégraphie.

- [ ] JSON Schema complet et documenté pour les thèmes et chorégraphies
- [ ] Validation stricte des thèmes générés
- [ ] Deuxième thème (généré par IA) pour prouver que le schema est suffisamment expressif
- [ ] Documentation orientée LLM (system prompts, exemples, contraintes)
- [ ] API ou CLI : "charge ce thème JSON et joue-le"

## Domaines

- sajou.org
- sajou.app
- sajou.dev

---

*Les signaux sont la musique. Les thèmes sont les danseurs. Sajou est le chorégraphe.*
