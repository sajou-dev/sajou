# Sajou â€” Manifeste

## Ce que c'est

**Sajou est un choreographer visuel pour agents IA.**

Il traduit les Ã©vÃ©nements d'un orchestrateur d'agents (tÃ¢ches, appels d'outils, coÃ»ts, erreurs) en scÃ¨nes visuelles animÃ©es, via un systÃ¨me de chorÃ©graphies thÃ©matisables.

Son architecture dÃ©clarative est conÃ§ue pour Ãªtre composÃ©e par des humains **ou par des IA**.

*Le petit singe qui observe tout depuis les branches.* ðŸ’

## Le constat

Tous les agents IA du monde partagent la mÃªme interface : un chat. OpenClaw, Claude, ChatGPT, Gemini â€” un champ de texte, des bulles, du streaming de tokens.

Pourtant, les agents deviennent de plus en plus autonomes : multi-Ã©tapes, multi-outils, multi-modÃ¨les, distribuÃ©s. Plus ils agissent seuls, plus on a besoin de **voir** ce qu'ils font â€” pas de le lire ligne par ligne dans un fil de conversation.

Le problÃ¨me n'est pas l'absence de dashboards. Grafana, Datadog, LangSmith existent. Le problÃ¨me c'est qu'entre les donnÃ©es brutes et une visualisation vivante, il manque une couche : celle qui dÃ©crit **comment** un Ã©vÃ©nement machine devient un mouvement Ã  l'Ã©cran. Un langage de mise en scÃ¨ne. Une chorÃ©graphie.

## Le pari

Les donnÃ©es d'un agent IA sont des **signaux** (comme du MIDI, de l'OSC, de l'ArtNet).
Un thÃ¨me visuel est une **scÃ¨ne** (comme une composition MadMapper ou une timeline After Effects).
Entre les deux, il faut un **choreographer** â€” le systÃ¨me qui dit : "quand ce signal arrive, joue cette sÃ©quence d'actions visuelles".

Personne ne construit cette couche aujourd'hui.

Et parce que cette couche est **dÃ©clarative** (du JSON, pas du code arbitraire), elle peut Ãªtre gÃ©nÃ©rÃ©e par une IA. Demain, on dit Ã  Claude ou Ã  un agent : "fais-moi un thÃ¨me Mon Petit Poney pour visualiser mes agents" â€” et Sajou le joue.

## L'architecture en 3 couches

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  SIGNAUX (data layer)                       â”‚
â”‚  Ce qui se passe                            â”‚
â”‚  task_dispatch, tool_call, token_usage,     â”‚
â”‚  agent_move, error, completion...           â”‚
â”‚  Format standardisÃ©, backend-agnostique     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                   â”‚
                   â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  CHOREOGRAPHER (le cÅ“ur de Sajou)           â”‚
â”‚  Ce que Ã§a implique visuellement            â”‚
â”‚  SÃ©quences d'actions dÃ©claratives :         â”‚
â”‚  move, spawn, fly, flash, destroy,          â”‚
â”‚  drawBeam, typeText...                      â”‚
â”‚  Timeline, durÃ©es, easings, chaÃ®nage,       â”‚
â”‚  interruptions, callbacks                   â”‚
â”‚  Tout est JSON. Tout est composable.        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                   â”‚
                   â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  THÃˆME (render layer)                       â”‚
â”‚  Comment Ã§a se dessine                      â”‚
â”‚  Sprites, modÃ¨les 3D, particules, shaders, â”‚
â”‚  sons, typographies, layouts                â”‚
â”‚  Chaque thÃ¨me = une scÃ¨ne complÃ¨te          â”‚
â”‚  Chaque thÃ¨me choisit sa stack de rendu     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Un mÃªme signal, trois thÃ¨mes, trois rÃ©sultats :**

| Signal | ThÃ¨me "Citadelle" (WC3) | ThÃ¨me "Neon" (Cyberpunk) | ThÃ¨me "Ops" (Minimal) |
|--------|------------------------|--------------------------|----------------------|
| `task_dispatch` | Un peon marche vers la forge, lance un pigeon voyageur qui vole vers l'Oracle | Un nÅ“ud pulse en cyan, un beam laser trace la connexion | Une flÃ¨che animÃ©e relie deux nÅ“uds sur un graphe |
| `tool_call` | Le bÃ¢timent s'illumine, une icÃ´ne d'ability apparaÃ®t dans la grille | Un terminal s'ouvre en glitch, du code dÃ©file | Une ligne s'ajoute dans un log horodatÃ© |
| `token_usage` | Les piÃ¨ces d'or tintent et le compteur descend | Un compteur d'Ã©nergie se vide avec un son synthÃ©tique | Un chiffre s'incrÃ©mente dans un coin |
| `error` | Explosion rouge, unitÃ© qui tombe, son de dÃ©faite | Ã‰cran qui crÃ©pite, texte rouge "CRITICAL" | Ligne rouge dans le log |

## Le Choreographer en dÃ©tail

Le choreographer est le contrat entre les signaux et les thÃ¨mes.

### Format dÃ©claratif

Les chorÃ©graphies sont dÃ©crites en JSON, pas en code impÃ©ratif. C'est ce qui permet Ã  une IA de les gÃ©nÃ©rer.

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

Vocabulaire fini et documentÃ© â€” le dictionnaire que les IA utilisent pour composer :

| Primitive | RÃ´le | ParamÃ¨tres clÃ©s |
|-----------|------|-----------------|
| `move` | DÃ©placer une entitÃ© | entity, to, duration, easing |
| `spawn` | CrÃ©er une entitÃ© visuelle | entity, at, options |
| `destroy` | Retirer une entitÃ© | entity |
| `fly` | DÃ©placement avec trajectoire | entity, to, duration, easing (arc, line, bezier) |
| `flash` | Effet visuel ponctuel | target, color, duration |
| `pulse` | Effet visuel cyclique | target, color, duration, repeat |
| `drawBeam` | Tracer une connexion visuelle | from, to, duration, style |
| `typeText` | Afficher du texte progressivement | text, at, speed |
| `playSound` | DÃ©clencher un son | sound, volume |
| `wait` | Pause dans la sÃ©quence | duration |
| `onArrive` | ChaÃ®ner aprÃ¨s une animation | steps |
| `onInterrupt` | RÃ©agir si annulÃ©/erreur mid-flight | steps |

Le thÃ¨me fournit les **renderers** pour chaque primitive (comment "move" se dessine dans son contexte visuel). Le choreographer orchestre le timing et le chaÃ®nage.

### Format d'entitÃ©s â€” question ouverte

Le format de dÃ©finition des entitÃ©s dans un thÃ¨me doit anticiper plusieurs niveaux de complexitÃ© :
- Sprites 2D statiques (PNG, SVG)
- Sprites animÃ©s (spritesheets, sÃ©quences)
- ModÃ¨les 3D (glTF, animations skelettales)
- SystÃ¨mes de particules
- Shaders / effets procÃ©duraux

Le bon niveau d'abstraction reste Ã  dÃ©finir. Le format doit Ãªtre suffisamment expressif pour du rendu riche tout en restant composable par une IA. C'est un des points clÃ©s Ã  explorer et challenger en V1.

## Ce que Sajou n'est PAS

- **Pas un orchestrateur d'agents.** Sajou ne dÃ©cide pas quoi faire. Il montre ce qui se passe.
- **Pas un concurrent d'OpenClaw.** Il peut s'y brancher. Ou sur n'importe quel backend.
- **Pas un dashboard de monitoring classique.** C'est un outil de mise en scÃ¨ne, pas un tableau de mÃ©triques.
- **Pas un chatbot.** L'interaction passe par la scÃ¨ne visuelle.
- **Pas un produit enterprise.** C'est un projet personnel d'apprentissage et d'expÃ©rimentation. S'il devient bon, il deviendra public.

## Pour qui

**V0 : moi.** Un dÃ©veloppeur avec du hardware et des agents qui veut voir ses agents travailler comme on regarde une partie de Starcraft â€” pas comme on lit des logs.

**V1+ (si Ã§a vaut le coup) :** des devs et crÃ©atifs qui veulent une interface de visualisation d'agents qui ne soit pas un Grafana de plus. Des gens qui pensent que l'esthÃ©tique d'une interface n'est pas un luxe mais une fonctionnalitÃ©.

## Principes de design

1. **Signal â†’ ChorÃ©graphie â†’ Rendu** â€” Toujours ces 3 couches. Jamais de raccourci signal â†’ rendu direct. La chorÃ©graphie est le produit.

2. **DÃ©claratif d'abord** â€” Tout ce qui peut Ãªtre du JSON doit Ãªtre du JSON. Les chorÃ©graphies, les thÃ¨mes, les layouts, les entitÃ©s. Le code impÃ©ratif n'intervient que dans le runtime qui interprÃ¨te ces dÃ©clarations. C'est ce qui rend Sajou composable par des IA.

3. **Le thÃ¨me est une scÃ¨ne complÃ¨te** â€” Pas un skin CSS. Un thÃ¨me apporte ses entitÃ©s, ses animations, ses sons, sa disposition spatiale, ses chorÃ©graphies, et choisit sa propre stack de rendu. Changer de thÃ¨me change tout sauf les donnÃ©es.

4. **Backend-agnostique** â€” Sajou consomme un flux de signaux standardisÃ© (JSON over WebSocket). Adapter un nouveau backend (OpenClaw, LangChain, custom) = Ã©crire un adaptateur qui traduit ses Ã©vÃ©nements vers le format Sajou.

5. **L'esthÃ©tique est le produit** â€” Un dashboard moche avec les bonnes donnÃ©es, Ã§a existe dÃ©jÃ . Sajou existe parce que l'interface doit donner **envie** de regarder ses agents travailler.

6. **Apprendre en construisant** â€” Le projet est un lab. Chaque couche est une occasion d'expÃ©rimenter (WebSocket, Canvas/WebGL, state machines, animation systems, theming). La perfection n'est pas le but. La comprÃ©hension oui.

## Roadmap

### V1 â€” Le runtime qui marche

L'objectif : un signal entre, une scÃ¨ne animÃ©e sort. Un thÃ¨me complet. Tout fonctionne.

**Couche Signaux**
- [ ] SpÃ©cification du protocole de signaux (JSON Schema)
- [ ] Bus de signaux cÃ´tÃ© frontend (rÃ©ception WebSocket, normalisation, store rÃ©actif)
- [ ] Backend Ã©mulateur (service minimal qui Ã©met des signaux de test rÃ©alistes)

**Couche Choreographer**
- [ ] Runtime qui interprÃ¨te les chorÃ©graphies dÃ©claratives (JSON â†’ sÃ©quences d'actions)
- [ ] BibliothÃ¨que de primitives (move, spawn, fly, flash, destroy, wait, chain...)
- [ ] SystÃ¨me de sÃ©quenÃ§age (timeline, durÃ©es, easings, interruptions)
- [ ] Gestion des Ã©tats concurrents (plusieurs chorÃ©graphies en parallÃ¨le)

**Couche ThÃ¨me**
- [ ] Contrat de thÃ¨me (JSON Schema : entitÃ©s, layout, chorÃ©graphies, assets)
- [ ] Format d'entitÃ©s extensible (du sprite 2D au modÃ¨le 3D)
- [ ] Renderers pour chaque primitive
- [ ] ThÃ¨me "Citadelle" (WC3) â€” premier thÃ¨me complet, sert de lab pour stabiliser le schema

**Adaptateurs**
- [ ] Adaptateur backend test (signaux simulÃ©s)
- [ ] Adaptateur OpenClaw (bridge Ã©vÃ©nements OpenClaw â†’ signaux Sajou)

### V2 — AI-composable & multi-sources

L'objectif : une IA peut générer un thème ou modifier une chorégraphie. Plusieurs sources de données peuvent alimenter une même vue.

**AI-composable**
- [ ] JSON Schema complet et documenté pour les thèmes et chorégraphies
- [ ] Validation stricte des thèmes générés
- [ ] Deuxième thème (généré par IA) pour prouver que le schema est suffisamment expressif
- [ ] Documentation orientée LLM (system prompts, exemples, contraintes)
- [ ] API ou CLI : "charge ce thème JSON et joue-le"

**Compositor (multi-sources)**
- [ ] Compositor déclaratif (JSON) : routage, filtrage, transformation de N flux vers le choreographer
- [ ] Tag de provenance sur chaque signal (`source`)
- [ ] Transforms par source (filtre, agrégation, remapping)
- [ ] Éditeur visuel : binding des sources sur les inputs des chorégraphies et entités

**Système d'inputs déclaratifs**
- [ ] Déclaration d'inputs en entête de chaque brique (chorégraphie, entité, FX)
- [ ] Types d'inputs (voir catalogue ci-dessous)
- [ ] Fonctions de mapping (lerp, clamp, step, curve)
- [ ] Références bindables (`$input_name`) dans les steps et propriétés

---

## V2 — Architecture multi-sources

### Le Compositor

En V1, l'architecture est : 1 flux de signaux → 1 choreographer → 1 thème.

En V2, plusieurs sources de données peuvent alimenter une même vue. Le **compositor** est la couche déclarative qui vit entre les sources brutes et le choreographer. Il route, filtre, transforme et tague les signaux.

```
Source A ─┐
Source B ─┼─→ Compositor (route/filter/tag) ─→ Choreographer ─→ Theme
Source C ─┘
```

Le compositor est **purement déclaratif** (JSON), comme le reste de Sajou. Il ne contient pas de logique cross-source complexe — les corrélations et décisions inter-sources sont la responsabilité de l'orchestrateur en amont.

Le compositor traite chaque source indépendamment :
- **Filtrage** — ne laisser passer que certains types de signaux
- **Transformation** — remapper des champs, agréger des valeurs
- **Tagging** — marquer chaque signal avec sa provenance (`source: "srcA"`)
- **Routage** — diriger des signaux vers des zones ou des chorégraphies spécifiques

Le contrat sacré **Signal → Chorégraphie → Rendu** reste intact. Le compositor produit des signaux normalisés en sortie.

### Inputs déclaratifs — le pattern ISF

Inspiré du format ISF (Interactive Shader Format) de MadMapper, chaque brique de Sajou (chorégraphie, entité, FX, thème) déclare ses **inputs** en entête. C'est son contrat public — ce que l'extérieur peut binder, ce que l'éditeur affiche, ce qu'une IA peut découvrir.

```json
{
  "id": "agent-move-to-forge",
  "inputs": [
    { "name": "origin", "type": "point2D", "label": "Départ" },
    { "name": "destination", "type": "point2D", "label": "Arrivée" },
    { "name": "speed", "type": "float", "min": 0, "max": 5, "default": 1 },
    { "name": "urgency", "type": "float", "min": 0, "max": 1, "default": 0, "label": "Tension visuelle" }
  ],
  "steps": [
    { "action": "move", "entity": "agent", "from": "$origin", "to": "$destination", "duration": "lerp($speed, 2000, 400)" },
    { "action": "flash", "target": "$destination", "intensity": "$urgency" }
  ]
}
```

Les principes :
- **Encapsulation** — la brique est une boîte noire avec des ports. Comme un shader ISF ou un nœud Blender.
- **Auto-documentation** — les inputs décrivent ce que la brique accepte. Une IA peut générer une chorégraphie et ses inputs sont auto-découverts.
- **Éditeur simple** — l'éditeur affiche des contrôles (sliders, color pickers, points) selon le type déclaré. Pas besoin de comprendre les steps internes.
- **Réutilisable** — la même chorégraphie avec des bindings différents donne des résultats différents. Comme un shader sur plusieurs surfaces.

### Bindings multi-sources

L'éditeur visuel permet de **binder** les inputs d'une brique sur des données sourcées. C'est du data binding déclaratif, pas du code.

```
srcA:task_dispatch.from   →  origin
srcA:task_dispatch.to     →  destination
srcB:system.cpu_load      →  urgency
```

Un même composant visuel peut être piloté par plusieurs sources simultanément :
- Le personnage se déplace sur une courbe de Bézier de A → B avec la data `srcA:data1`
- La courbe fait une rotation de l'angle X à l'angle Y selon la valeur pondérée de `srcB:data3`

Le binding est stocké en JSON dans la définition du thème ou de la chorégraphie. L'éditeur est juste l'UI qui produit ce JSON.

### Catalogue des types d'inputs

**Types primitifs**

| Type | Description | Paramètres | Éditeur UI |
|------|-------------|------------|-----------|
| `float` | Valeur numérique flottante | `min`, `max`, `default`, `step` | Slider / champ numérique |
| `int` | Valeur numérique entière | `min`, `max`, `default`, `step` | Slider / champ numérique |
| `bool` | Vrai/faux | `default` | Toggle |
| `string` | Texte libre | `default`, `maxLength` | Champ texte |
| `enum` | Choix parmi des valeurs nommées | `values`, `default`, `labels` | Dropdown / radio |

**Types spatiaux**

| Type | Description | Paramètres | Éditeur UI |
|------|-------------|------------|-----------|
| `point2D` | Position 2D `{x, y}` | `default`, `bounds` | Point draggable sur canvas |
| `point3D` | Position 3D `{x, y, z}` | `default`, `bounds` | Gizmo 3D |
| `angle` | Rotation en degrés | `min`, `max`, `default` | Dial rotatif |
| `bezier` | Courbe de Bézier (points de contrôle) | `default`, `pointCount` | Éditeur de courbe |
| `path` | Séquence de points (trajectoire) | `default`, `closed` | Éditeur de path |
| `rect` | Zone rectangulaire `{x, y, w, h}` | `default` | Rectangle draggable |

**Types visuels**

| Type | Description | Paramètres | Éditeur UI |
|------|-------------|------------|-----------|
| `color` | Couleur RGBA | `default` | Color picker |
| `gradient` | Dégradé (liste de stops couleur) | `default`, `stops` | Éditeur de gradient |
| `asset` | Référence à un asset du thème | `category`, `default` | Asset browser |
| `spritesheet` | Référence à un spritesheet + frame range | `default` | Preview animé |
| `audio` | Référence à un son/sample du thème | `category`, `default`, `loop`, `volume` | Preview audio + waveform |

**Types temporels**

| Type | Description | Paramètres | Éditeur UI |
|------|-------------|------------|-----------|
| `duration` | Durée en ms | `min`, `max`, `default` | Slider temporel |
| `easing` | Fonction d'easing | `default`, `values` | Preview de courbe |
| `curve` | Courbe de valeur dans le temps (keyframes) | `default`, `keys` | Éditeur de courbe temporelle |

**Types composés**

| Type | Description | Paramètres | Éditeur UI |
|------|-------------|------------|-----------|
| `vec2` | Vecteur 2D `{x, y}` (direction/force) | `default`, `magnitude` | Flèche draggable |
| `vec3` | Vecteur 3D `{x, y, z}` | `default` | Gizmo directionnel |
| `range` | Paire min/max | `min`, `max`, `default` | Double slider |
| `transform2D` | Position + rotation + échelle 2D | `default` | Gizmo combiné |

### Fonctions de mapping

Quand un input est bindé à une source de données, une **fonction de mapping** transforme la valeur brute en valeur utilisable par la brique :

| Fonction | Description | Exemple |
|----------|-------------|---------|
| `lerp` | Interpolation linéaire | `lerp($cpu, 0, 360)` — CPU 0→1 devient angle 0°→360° |
| `clamp` | Borner une valeur | `clamp($tokens, 0, 1000)` |
| `step` | Seuils discrets | `step($errors, [0, 5, 20], ["green", "orange", "red"])` |
| `curve` | Courbe custom (keyframes) | `curve($load, [[0, 0], [0.5, 0.2], [1, 1]])` |
| `map` | Remapping de range | `map($value, [0, 100], [0, 1])` |
| `smoothstep` | Transition lissée entre deux seuils | `smoothstep($val, 0.3, 0.7)` |
| `quantize` | Arrondir à des paliers | `quantize($speed, 0.25)` |

### Notes V1 — compatibilité future

Pour ne pas se fermer de portes en V1 sans implémenter le multi-source :
- Chaque signal dans le schema V1 porte un champ `source` **optionnel**
- Le signal bus ne hardcode pas l'hypothèse "un seul WebSocket"
- Le choreographer reste ignorant de la provenance — il reçoit des signaux, point
- Les propriétés des primitives (move, fly, etc.) acceptent soit une **valeur statique** soit un **placeholder** (`$variable`) — le binding n'est pas résolu en V1 mais le format est prêt

## Domaines

- sajou.org
- sajou.app
- sajou.dev

---

*Les signaux sont la musique. Les thÃ¨mes sont les danseurs. Sajou est le chorÃ©graphe.*
