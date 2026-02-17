# Sortie de signaux — Sajou comme gateway vers logiciels externes
Tiers: core
---

## Contexte

Sajou reçoit des signaux d'agents IA et les chorégraphie visuellement. Mais le rendu ne devrait pas s'arrêter au navigateur. Les mêmes données chorégraphiées devraient pouvoir piloter des logiciels de création visuelle/scénique professionnels.

Sajou devient alors une **gateway de signaux** : agents IA → Sajou → MadMapper / TouchDesigner / Resolume / etc.

## Proposition

Ajouter des sorties (outputs) sur les chorégraphes, symétriques aux entrées signal.

### Protocoles de sortie

**Prioritaires :**
- **OSC** (Open Sound Control) — standard de facto pour TouchDesigner, MadMapper, Resolume, QLab, Ableton, Max/MSP
- **ArtNet / sACN (DMX over IP)** — pilotage direct de fixtures lumière, LEDs, projecteurs
- **MIDI** (via WebMIDI ou bridge) — contrôle de surfaces, synths, DAWs

**Secondaires :**
- **WebSocket** — pour d'autres apps web ou serveurs custom
- **HTTP webhooks** — intégrations simples, IFTTT-style
- **Serial** (via bridge) — Arduino, microcontrôleurs, installations physiques

### Architecture

```
Signal source → Préfiltre → Chorégraphe → Output mapper → Protocole
```

L'**output mapper** traduit les commandes du chorégraphe (move, flash, spawn, etc.) en messages du protocole cible :

```json
{
  "output": {
    "protocol": "osc",
    "host": "192.168.1.50",
    "port": 8000,
    "mappings": [
      { "command": "flash", "address": "/sajou/flash", "args": ["color", "intensity"] },
      { "command": "move", "address": "/sajou/position", "args": ["x", "y"] }
    ]
  }
}
```

### UX dans le scene builder

- Nouvel onglet ou section dans le patch bay : "Outputs"
- Drag & drop d'un wire depuis un chorégraphe vers un bloc output
- Configuration du protocole, host/port, et mapping des paramètres
- Indicateur de connexion (vert/rouge) et monitoring des messages envoyés

### Cas d'usage

- **Théâtre** : signaux d'agent → Sajou → ArtNet → console lumière → scène réelle
- **Installation** : activité IA → Sajou → OSC → TouchDesigner → projection mapping
- **Live performance** : tokens LLM → Sajou → MIDI → Ableton → musique générative
- **Escape game / immersif** : décisions d'agent → Sajou → Serial → Arduino → effets physiques

### Note

C'est le pont entre le monde des agents IA et le monde du spectacle vivant / installation. L'ADN même du projet vu le background de son créateur.
