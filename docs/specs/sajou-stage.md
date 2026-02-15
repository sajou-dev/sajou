# SAJOU STAGE — Draft exploratoire

> Ce document est un brouillon de réflexion. Rien n'est figé.
> Il pose les bases d'une évolution majeure de l'architecture Sajou.
>
> **Mise à jour 2026-02-15 :** Le moteur de rendu retenu est **Three.js** (et non Godot 4).
> Les sections Godot (GDScript, JavaScriptBridge, WASM export) sont caduques.
> Le concept Stage, le format de scène, les interactions et le pipeline restent valides.
> Voir `docs/decisions/choix-threejs-stage.md`.

---

## Le constat

Sajou a été conçu comme un visualiseur : des signaux entrent, des animations sortent.
L'architecture trois couches (Signal → Choreographer → Render) a été pensée pour ça — un flux unidirectionnel.

Mais la réalité du projet dépasse cette vision initiale sur deux axes :

**1. Le rendu a besoin d'un vrai moteur.**
Passer de sprites plaqués à plat vers des scènes isométriques avec lighting dynamique, particules, multi-niveaux, profondeur — c'est un travail de game engine. Three.js est un renderer, pas un moteur. Reconstruire du Z-sorting iso, du raycasting, des systèmes de particules, du pathfinding par-dessus Three.js c'est réinventer la roue.

**2. Sajou doit devenir bidirectionnel.**
L'interface ne peut pas rester un écran passif. L'utilisateur doit pouvoir interagir avec la scène : cliquer sur un agent, dessiner une zone, drag-and-drop un objet, déclencher une action. Ces interactions génèrent des signaux qui remontent vers les agents IA. Sajou devient une interface de saisie visuelle, pas juste d'affichage.

Ces deux besoins convergent vers la même réponse : un game engine.

---

## L'idée : le Stage

On introduit le concept de **Stage** — le moteur de scène de Sajou.

Le Stage remplace ce qui s'appelait "Theme" dans l'architecture initiale. Ce n'est plus un skin interchangeable, c'est un composant central qui :

- **Rend** la scène (isométrique, éclairée, vivante)
- **Reçoit** les commandes du Choreographer (placer, déplacer, animer)
- **Capture** les interactions utilisateur et les transforme en signaux
- **Gère** un monde avec de la physique légère, de la navigation, des zones

### L'architecture évolue

```
        ┌──────────────────────────────────────────────────┐
        │                                                  │
        ▼                                                  │
    Signals ──────► Choreographer ──────► Stage (Godot)    │
   (data in/out)     (séquences)         (monde vivant)    │
        ▲                                                  │
        │                                                  │
        └────────────── interactions ──────────────────────┘
```

La boucle est fermée. Le flux n'est plus unidirectionnel.

Les trois couches restent, mais leurs rôles évoluent :

| Couche | Avant | Maintenant |
|--------|-------|------------|
| **Signal** | Données entrantes des agents | Bus bidirectionnel — signaux entrants des agents ET sortants de l'utilisateur |
| **Choreographer** | Séquence d'animations | Séquence d'actions — animations, transitions, ET réactions aux inputs |
| **Stage** | Renderer passif (Three.js) | Monde interactif — rendu, physique, input, audio |

### Ce qui ne change pas

- **Déclaratif d'abord.** Le Stage est configuré par JSON. La scène, les zones, les entités, les interactions possibles — tout est déclaré, pas codé.
- **Core framework-agnostic.** `@sajou/core` reste du TypeScript pur. Le Stage est un consommateur du core, pas une dépendance.
- **Backend-agnostic.** Les signaux restent du JSON sur WebSocket. Un agent ne sait pas et ne doit pas savoir que le Stage est Godot.

---

## Le Stage en détail

### Le Board

Le board est l'espace de jeu. Une surface isométrique avec :

- **Des zones** — régions nommées avec des propriétés (hauteur, ambiance, type)
- **Des plateformes** — niveaux de hauteur différents, connectés par des transitions
- **Des slots** — positions où les entités peuvent se poser
- **Des chemins** — routes de navigation entre les slots/zones

```json
{
  "board": {
    "projection": "isometric",
    "angle": 45,
    "zones": [
      {
        "id": "forge",
        "label": "La Forge",
        "elevation": 0,
        "bounds": { "x": 0, "y": 0, "w": 400, "h": 300 },
        "ambiance": {
          "lighting": "warm",
          "particles": "embers",
          "sound_loop": "anvil_ambient"
        },
        "slots": [
          { "id": "anvil", "position": { "x": 200, "y": 150 }, "role": "workstation" },
          { "id": "forge-guard", "position": { "x": 350, "y": 250 }, "role": "standing" }
        ]
      },
      {
        "id": "rampart",
        "label": "Les Remparts",
        "elevation": 2,
        "bounds": { "x": 400, "y": -100, "w": 300, "h": 200 },
        "ambiance": {
          "lighting": "cold",
          "particles": "wind",
          "sound_loop": "wind_howl"
        },
        "connections": [
          { "to": "forge", "type": "stairs", "path": "stairs_east" }
        ]
      }
    ]
  }
}
```

### Les Entités

Les entités sont les personnages, objets, éléments interactifs posés sur le board.

Chaque entité a :
- Un **visuel** (spritesheet pixel art + normal map pour le lighting)
- Un **rig** (humanoid, quadruped, flying, mechanical — le système de poses qu'on a construit)
- Des **animations** mappées sur le rig (idle, walk, work_standing, attack_kick...)
- Des **interactions** — ce que l'utilisateur peut faire avec (cliquer, drag, contextual menu)
- Un **état** — piloté par les signaux des agents

```json
{
  "entity": {
    "id": "blacksmith-01",
    "display_name": "Forge Master",
    "rig": "humanoid",
    "visual": {
      "spritesheet": "assets/blacksmith_sheet.png",
      "normal_map": "assets/blacksmith_normal.png",
      "frame_size": [64, 64],
      "animations": {
        "idle": { "frames": [0, 1, 2, 3], "fps": 4, "loop": true },
        "work_standing": { "frames": [4, 5, 6, 7, 8, 9], "fps": 6, "loop": true },
        "walk": { "frames": [10, 11, 12, 13, 14, 15], "fps": 8, "loop": true }
      }
    },
    "interactions": [
      { "type": "click", "signal": "agent.inspect", "label": "Inspecter" },
      { "type": "context_menu", "options": [
        { "label": "Assigner tâche", "signal": "agent.assign_task" },
        { "label": "Déplacer", "signal": "agent.move", "mode": "drag_to_slot" }
      ]}
    ],
    "slot": "anvil",
    "state": "working"
  }
}
```

### Le Lighting

Le système d'éclairage est déclaré par zone et par source :

```json
{
  "lighting": {
    "global": {
      "type": "directional",
      "angle": 225,
      "elevation": 45,
      "color": "#FFE4B5",
      "intensity": 0.6
    },
    "sources": [
      {
        "id": "forge-fire",
        "type": "point",
        "position": { "x": 180, "y": 140 },
        "color": "#FF6B35",
        "intensity": 1.2,
        "radius": 200,
        "flicker": { "speed": 3, "amount": 0.15 }
      },
      {
        "id": "torch-rampart",
        "type": "point",
        "position": { "x": 500, "y": -50 },
        "color": "#E8A851",
        "intensity": 0.8,
        "radius": 120
      }
    ]
  }
}
```

Les sprites pixel art avec normal maps réagissent à ces lumières.
Le même sprite dans la zone forge est éclairé chaud, sur les remparts il est froid.

### Les Particules

Systèmes de particules déclarés, attachés à des zones ou des entités :

```json
{
  "particles": {
    "embers": {
      "emitter": "zone:forge",
      "sprite": "assets/particles/ember.png",
      "count": 30,
      "lifetime": [1.0, 3.0],
      "velocity": { "x": [-10, 10], "y": [-40, -20] },
      "color_over_life": ["#FF6B35", "#FF4500", "#00000000"],
      "size": [2, 6],
      "glow": true
    },
    "wind": {
      "emitter": "zone:rampart",
      "type": "directional",
      "sprite": "assets/particles/dust.png",
      "count": 15,
      "direction": { "x": -1, "y": 0.2 },
      "speed": [20, 60]
    }
  }
}
```

---

## Les interactions — le canal retour

C'est le changement fondamental. L'utilisateur interagit avec la scène et ça produit des signaux.

### Types d'interaction

| Interaction | Ce qui se passe | Signal produit |
|-------------|----------------|----------------|
| **Click entity** | L'utilisateur clique sur un agent | `{ "type": "user.click", "target": "blacksmith-01" }` |
| **Drag to slot** | L'utilisateur déplace un agent vers un slot | `{ "type": "user.move", "entity": "guard-02", "to_slot": "rampart-post" }` |
| **Zone draw** | L'utilisateur dessine une zone sur le board | `{ "type": "user.zone", "bounds": {...}, "intent": "patrol_area" }` |
| **Context action** | L'utilisateur choisit dans un menu contextuel | `{ "type": "user.command", "entity": "blacksmith-01", "action": "assign_task", "params": {...} }` |
| **Board click** | Clic sur un espace vide | `{ "type": "user.point", "position": { "x": 300, "y": 200 }, "zone": "forge" }` |

### Le flux retour

```
Utilisateur clique sur le forgeron
    → Stage capture l'événement (Godot input system)
    → Stage émet un signal : { type: "user.click", target: "blacksmith-01" }
    → Signal passe par le Choreographer (qui peut jouer une animation de feedback)
    → Signal remonte sur le bus (WebSocket)
    → L'agent IA reçoit et réagit
    → L'agent émet un signal en retour
    → Choreographer joue la séquence de réponse
    → Stage anime le résultat
```

La boucle complète. L'utilisateur et les agents communiquent à travers la scène.

---

## Pourquoi Godot

| Besoin | Godot | Three.js from scratch |
|--------|-------|----------------------|
| Rendu 2D iso | `TileMap`, `Camera2D` ortho, Y-sort natif | Tout à construire |
| Lighting 2D + normal maps | `PointLight2D`, `DirectionalLight2D`, `CanvasNormalMap` | Shaders custom |
| Particules | `GPUParticles2D`, éditeur visuel | Bibliothèque externe |
| Input / raycasting | `Area2D`, `InputEvent`, signaux natifs | Raycasting custom |
| Pathfinding | `NavigationAgent2D`, `AStarGrid2D` | Bibliothèque externe |
| Audio spatial | `AudioStreamPlayer2D` | Web Audio API |
| UI in-game | `Control` nodes, thèmes | DOM overlay |
| Export web | WASM + JS bridge | Natif |
| Éditeur de scène | Godot Editor | Rien |

L'argument le plus fort : **Godot a un éditeur visuel**. Ça veut dire que la création de boards, le placement de zones, l'ajustement du lighting, le tuning des particules — tout ça peut se faire visuellement dans l'éditeur Godot, pas en éditant du JSON à la main. Puis on exporte la config en déclaratif.

### L'intégration web

Godot exporte en WASM via son export template HTML5. Le runtime Godot tourne dans un `<canvas>`, et communique avec le JavaScript host via le bridge `JavaScriptBridge` (Godot 4) :

```
┌─────────────────────────────────────────────┐
│  Navigateur                                 │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Application web Sajou (React/TS)   │    │
│  │                                     │    │
│  │  ┌─────────────┐  ┌──────────────┐  │    │
│  │  │ @sajou/core  │  │   Stage UI   │  │    │
│  │  │ Signal bus   │◄─┤  (Godot WASM)│  │    │
│  │  │ Choreographer│─►│  <canvas>    │  │    │
│  │  └──────┬──────┘  └──────────────┘  │    │
│  │         │                            │    │
│  │         │ WebSocket                  │    │
│  │         ▼                            │    │
│  │  Agents IA (backend)                 │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

Le bridge JS expose deux canaux :
- **core → godot** : commandes déclaratives (spawn entity, move to, play animation, set lighting...)
- **godot → core** : événements d'interaction (user clicked, user dragged, user selected zone...)

```gdscript
# Côté Godot — recevoir des commandes du core
func _ready():
    JavaScriptBridge.create_callback(_on_core_command)

func _on_core_command(command_json: String):
    var cmd = JSON.parse_string(command_json)
    match cmd.type:
        "spawn_entity":
            _spawn(cmd.entity)
        "move_entity":
            _move(cmd.entity_id, cmd.to_slot, cmd.animation)
        "play_animation":
            _animate(cmd.entity_id, cmd.animation)
        "set_lighting":
            _update_light(cmd.light_id, cmd.properties)

# Côté Godot — remonter les interactions
func _on_entity_clicked(entity_id: String):
    JavaScriptBridge.eval(
        "window.sajouBridge.emit(%s)" % JSON.stringify({
            "type": "user.click",
            "target": entity_id
        })
    )
```

---

## Le pipeline d'assets

Les assets restent du pixel art (accessible, rapide à produire, tolérant aux imperfections d'animation) mais enrichi :

### Sprite standard
- Spritesheet pixel art (32×32, 48×48, 64×64)
- Palette cohérente par thème
- Animations standard par rig (idle, walk, work, attack, etc.)

### Normal map
- Générée à partir du sprite (outils IA : SpriteIlluminator, Laigter, ou modèle de diffusion)
- Permet au sprite de réagir au lighting dynamique du Stage
- Même résolution que le sprite

### Heightmap (optionnel)
- Pour la parallaxe et les ombres projetées
- Donne du volume au sprite plat

### Le pipeline IA réajusté

```
Rôle de l'IA générative :
  ✓ Générer des spritesheets pixel art (tolérant, basse résolution)
  ✓ Générer des normal maps à partir des sprites
  ✓ Générer des textures de particules
  ✓ Générer des tilesets pour les boards
  ✓ Matching sémantique (agent demande "forgeron" → trouver/générer le bon asset)

  ✗ Générer des images haute résolution cohérentes frame-à-frame (le problème qu'on a identifié)
```

Le pipeline ComfyUI qu'on a construit reste pertinent pour la génération pixel art et les assets de décor. Les rigs et poses OpenPose deviennent des références pour l'animation plutôt que des inputs ControlNet.

---

## Ce que ça change pour le projet

### Compétences requises
- GDScript / Godot 4 pour le Stage
- TypeScript pour le core (inchangé)
- Pixel art + normal maps pour les assets

### Complexité ajoutée
- Le bridge JS ↔ Godot est un composant critique — c'est l'API entre les deux mondes
- Le format déclaratif de scène doit être suffisamment expressif sans devenir un langage de programmation
- Le debugging cross-runtime (TS dans le navigateur + GDScript dans WASM) sera plus complexe

### Complexité retirée
- Plus de Z-sorting custom
- Plus de système de particules from scratch
- Plus de raycasting / hit detection à la main
- Plus de système d'input artisanal
- L'éditeur Godot remplace une bonne partie du Scene Builder qu'on construisait

### Migration
Le core ne change pas. Le Choreographer évolue pour gérer les signaux bidirectionnels. Le Stage remplace le renderer Three.js. Les schemas évoluent pour décrire boards, zones, interactions.

---

## Questions ouvertes

**Taille du WASM Godot** — Un export Godot 4 minimal fait ~25-30 MB en WASM. Acceptable pour une app web ? Cacheable/streamable ?

**Latence du bridge** — La communication JS ↔ Godot WASM passe par le bridge. Pour des interactions temps réel (drag, hover), la latence est-elle acceptable ? À tester.

**Éditeur de scène** — L'éditeur Godot sert pour le dev. Mais pour l'utilisateur final qui veut composer sa scène ? Faut-il un éditeur simplifié intégré à l'app web, ou l'édition se fait par configuration JSON + preview live ?

**Multiples stages** — Un utilisateur peut-il avoir plusieurs boards/scènes ? Plusieurs canvas Godot en parallèle ? Ou un seul Stage avec des scènes switchables ?

**Headless mode** — Pour les tests et le CI, le Stage doit pouvoir tourner sans rendu. Godot a un mode `--headless` mais en WASM c'est moins clair.

**Mobile** — Godot WASM tourne sur mobile mais la performance des GPUParticles2D et du lighting peut varier. Fallback vers un mode simplifié ?

---

## Prochaines étapes possibles

1. **Prototype minimal** — Un board iso vide dans Godot, exporté en WASM, avec le bridge JS qui spawn un sprite et le déplace sur commande. Proof of concept de la communication.

2. **Format de scène** — Stabiliser le JSON déclaratif (board, zones, slots, entités, lighting, particules) pour qu'il soit à la fois expressif et parseable par Godot.

3. **Premier board** — Une scène avec 2-3 zones, quelques entités pixel art avec normal maps, du lighting dynamique. La démo visuelle qui montre le saut qualitatif.

4. **Input loop** — Clic sur entité → signal → réponse → animation. La boucle bidirectionnelle en action.
