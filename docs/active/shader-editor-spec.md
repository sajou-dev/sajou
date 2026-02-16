# Shader Editor — Spec technique

## Overview

Le Shader Editor est un nouvel onglet du scene-builder qui permet de créer et éditer des effets visuels procéduraux (shaders, generative art) directement dans le même runtime Three.js que la scène existante.

**Deux modes d'édition switchables** :

1. **Mode GLSL** — écriture directe de vertex/fragment shaders, preview temps réel via `ShaderMaterial` sur un quad plein écran (pattern ShaderToy)
2. **Mode Script (p5.js)** — code JavaScript avec l'API p5.js, le langage du creative coding. Le sketch tourne dans une instance p5 isolée (P2D), son canvas alimente une `THREE.CanvasTexture`

Les deux modes produisent le même format de sortie : un **Shader Theme JSON** exportable et réimportable.

### Direction artistique

Le shader editor est conçu pour produire des atmosphères, pas des effets décoratifs. Les presets et exemples s'inspirent de :

- **Ryoji Ikeda** — data brute → cathédrale visuelle (grilles, lignes de données, stroboscopie)
- **Réaction-diffusion** (Karl Sims) — patterns organiques qui émergent, mutent, se stabilisent
- **Generative typography** (Zach Lieberman) — texte vivant, déformé, respiration typographique
- **WebGL fluids** (Felix Turner, David Li) — les signaux comme flux, les agents comme courants

---

## Architecture

### Intégration dans le workspace

Le Shader Editor vit dans un **nouvel onglet** ajouté au header, à côté de Run/Preview/New/Import/Export. Ce n'est pas un panel flottant — c'est un mode d'affichage alternatif du `#zone-theme`.

```
┌─ header ────────────────────────────────────────────────┐
│ logo  sajou    [Signal] [Choreo] [Visual]               │
│                                    ▲                    │
│           (existant, inchangé)     │                    │
│                          [Shader Editor] ← nouveau tab  │
│                  Run  Preview  New  Import  Export       │
└─────────────────────────────────────────────────────────┘
```

Quand l'onglet Shader Editor est actif :

- Le contenu de `#zone-theme` est remplacé par le layout du shader editor
- Le rideau et les zones Signal/Choreographer restent accessibles (la pipeline est toujours visible)
- Le toolbar (outils de placement) est masqué (non pertinent dans ce mode)
- Retour au mode Visual = retour au canvas 3D normal

### Nouveau `ViewId`

```typescript
// types.ts — extension
export type ViewId = "signal" | "orchestrator" | "visual" | "shader";
```

Le switch se fait via `setActiveView("shader")` dans l'EditorState. Le workspace souscrit au changement et swap le contenu de `#zone-theme`.

### Structure de fichiers

```
tools/scene-builder/src/
├── shader-editor/
│   ├── shader-view.ts           # Point d'entrée : init, layout, tab switch
│   ├── shader-state.ts          # Store : shader defs, sélection, mode
│   ├── shader-canvas.ts         # Preview Three.js (ShaderMaterial sur quad)
│   ├── shader-code-panel.ts     # Éditeur de code (GLSL ou JS)
│   ├── shader-uniforms-panel.ts # Contrôles d'uniforms (sliders, pickers, dials)
│   ├── shader-presets.ts        # Bibliothèque de presets embarqués
│   ├── p5-runtime.ts            # Sandbox p5.js (instance mode + P2D offscreen)
│   └── shader-export.ts         # Sérialisation shader-theme.json
```

---

## UI Layout

Le shader editor divise `#zone-theme` en 3 régions :

```
┌──────────────────────────────────────────────────────┐
│  Shader Editor                              [GLSL|p5] │  ← mode switch (toggle button)
├────────────────────────┬─────────────────────────────┤
│                        │                             │
│   Code Editor          │     Preview Canvas          │
│   (left panel)         │     (Three.js quad ou       │
│                        │      p5 canvas texture)     │
│   - vertex shader      │                             │
│   - fragment shader    │                             │
│   - ou JS (mode p5)    │                             │
│                        │                             │
├────────────────────────┤                             │
│   Uniforms Panel       │                             │
│   (sliders, pickers,   │                             │
│   dials, toggles)      │                             │
└────────────────────────┴─────────────────────────────┘
```

### Code Editor (panneau gauche haut)

- **Éditeur embarqué** : CodeMirror 6 (léger, tree-shakeable, extensible)
  - Alternative considérée : Monaco (trop lourd ~3MB, conçu pour des IDE complets)
  - CodeMirror avec les extensions GLSL syntax + JS syntax + autocompletion uniforms = ~200KB
- **Mode GLSL** : deux onglets internes "Vertex" et "Fragment", syntaxe GLSL ES 3.0
- **Mode Script** : un seul onglet JS, avec autocompletion de l'API p5.js
- **Live reload** : recompilation à chaque modification (debounced 300ms), erreurs de compilation affichées inline (annotations CodeMirror)
- Les erreurs GLSL du WebGL context sont parsées et mappées aux lignes du code source

### Uniforms Panel (panneau gauche bas)

Chaque uniform déclaré dans le shader est automatiquement exposé comme contrôle interactif :

| Type GLSL | Contrôle UI | Pattern existant |
|-----------|-------------|-----------------|
| `float` | Slider (range configurable) | `createSlider()` de lighting-panel |
| `vec2` | Deux sliders ou XY pad | — |
| `vec3` (color) | Color picker | `createColorInput()` de lighting-panel |
| `vec3` (direction) | Compass dial Canvas2D | Dial widget de particle-panel |
| `vec4` | 4 sliders ou color picker + alpha | — |
| `bool` | Toggle switch | — |
| `int` | Slider (step 1) | — |
| `sampler2D` | Texture slot (drag asset) | Asset drop pattern de canvas-drop-handler |

Les uniforms sont annotés dans le GLSL via des commentaires structurés :

```glsl
uniform float uSpeed;     // @ui: slider, min: 0.0, max: 10.0, default: 1.0
uniform vec3  uColor;     // @ui: color, default: #E8A851
uniform float uDirection; // @ui: dial, min: 0, max: 360, default: 0
uniform bool  uInvert;    // @ui: toggle, default: false
```

Le parser d'annotations extrait ces métadonnées et génère les contrôles automatiquement. Les uniforms sans annotation `@ui` reçoivent un contrôle par défaut selon leur type.

### Uniforms injectés automatiquement (ShaderToy-style)

Ces uniforms sont disponibles dans tous les shaders, sans déclaration manuelle :

| Uniform | Type | Description |
|---------|------|-------------|
| `iTime` | `float` | Temps écoulé en secondes |
| `iTimeDelta` | `float` | Delta time depuis la dernière frame |
| `iResolution` | `vec3` | Dimensions du viewport (x, y, ratio) |
| `iMouse` | `vec4` | Position souris (xy = position, zw = click) |
| `iFrame` | `int` | Numéro de frame |

En mode script (p5.js), ces valeurs sont accessibles via `p.getTime()`, `p.getResolution()`, etc. (helpers injectés dans le contexte p5).

### Preview Canvas (panneau droit)

- **Mode GLSL** : `THREE.ShaderMaterial` sur un `PlaneGeometry(2, 2)` avec `OrthographicCamera(-1,1,1,-1,0,1)`. Le fragment shader est le code de l'utilisateur. Rendu dans le même `WebGLRenderer` que la scène (un seul contexte WebGL).
- **Mode Script** : `p5.Graphics` en mode P2D (Canvas2D, pas de second contexte WebGL) → `THREE.CanvasTexture` → `MeshBasicMaterial` sur le même quad. Texture mise à jour à chaque frame (`needsUpdate = true`).

**Performance budget** : la preview tourne dans la boucle `requestAnimationFrame` existante du scene-builder. Le quad shader remplace temporairement le rendu de scène dans `#canvas-container`.

---

## Compatibilité p5.js → ShaderMaterial

### Approche retenue : render-to-texture (P2D)

```
p5 instance (instance mode, noCanvas)
  └─ createGraphics(w, h, P2D)    ← Canvas2D, zéro contexte WebGL supplémentaire
       └─ .elt (HTMLCanvasElement)
            └─ THREE.CanvasTexture(elt)
                 └─ MeshBasicMaterial / ShaderMaterial uniform
```

- **Pas de double contexte WebGL** — p5 tourne en P2D (Canvas2D), Three.js est le seul contexte WebGL
- **Isolation** : p5 en instance mode, `noCanvas()`, pas de DOM visible
- **Résolution** : configurable (256–2048), défaut 512×512 pour le preview
- **Synchronisation** : p5 `draw()` appelé dans la même boucle RAF que Three.js

### Pourquoi pas p5 en mode WEBGL ?

- Crée un second contexte WebGL (limite browser : ~16 par domaine)
- Le `WebGLTexture` de p5 n'est pas transférable à Three.js (contextes séparés)
- Il faudrait un `readPixels()` GPU→CPU puis `texImage2D()` CPU→GPU = pipeline stall
- P2D est suffisant pour 95% du generative art (2D, typographie, patterns, simulations)

### Traduction GLSL p5 ↔ Three.js

Les shaders GLSL sont compatibles entre p5 et Three.js au niveau du langage (GLSL ES). Les seules différences sont les noms d'attributs/uniforms built-in :

| p5.js | Three.js |
|-------|----------|
| `aPosition` | `position` |
| `aTexCoord` | `uv` |
| `uModelViewMatrix` | `modelViewMatrix` |
| `uProjectionMatrix` | `projectionMatrix` |

Un shader écrit dans le mode GLSL du shader editor utilise les conventions Three.js (puisqu'il tourne directement dans Three.js). Le mode p5 ne touche pas au GLSL — il produit une texture bitmap.

---

## Formats

### Shader Definition (in-memory state)

```typescript
interface ShaderDef {
  /** Unique shader ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Editing mode that produced this shader. */
  mode: "glsl" | "script";
  /** Vertex shader source (GLSL mode only). */
  vertexSource: string;
  /** Fragment shader source (GLSL mode only). */
  fragmentSource: string;
  /** JavaScript source (script mode only). */
  scriptSource: string;
  /** Declared uniforms with UI metadata and current values. */
  uniforms: ShaderUniformDef[];
  /** Preview resolution. */
  resolution: { width: number; height: number };
  /** Node position on the wiring canvas (for future choreography integration). */
  nodeX: number;
  nodeY: number;
}

interface ShaderUniformDef {
  /** GLSL uniform name. */
  name: string;
  /** GLSL type. */
  type: "float" | "vec2" | "vec3" | "vec4" | "int" | "bool" | "sampler2D";
  /** UI control type. */
  control: "slider" | "color" | "dial" | "toggle" | "xy-pad" | "texture";
  /** Current value. */
  value: number | number[] | string | boolean;
  /** Default value. */
  defaultValue: number | number[] | string | boolean;
  /** Range for numeric controls. */
  min?: number;
  max?: number;
  step?: number;
}
```

### Shader Theme JSON (export format)

```json
{
  "version": 1,
  "shaders": [
    {
      "id": "reaction-diffusion-01",
      "name": "Reaction Diffusion",
      "mode": "glsl",
      "vertexSource": "...",
      "fragmentSource": "...",
      "uniforms": [
        { "name": "uFeedRate", "type": "float", "control": "slider", "value": 0.055, "min": 0, "max": 0.1 },
        { "name": "uKillRate", "type": "float", "control": "slider", "value": 0.062, "min": 0, "max": 0.1 },
        { "name": "uColor1", "type": "vec3", "control": "color", "value": "#E8A851" },
        { "name": "uColor2", "type": "vec3", "control": "color", "value": "#07070C" }
      ],
      "resolution": { "width": 512, "height": 512 }
    }
  ]
}
```

Ce fichier est ajouté au ZIP d'export sous le nom `shaders.json` (à côté de `scene.json`, `entities.json`, `choreographies.json`).

### Persistance

- `ShaderEditorState` sauvegardé dans IndexedDB (store `"shaders"`, même pattern que les autres stores)
- Auto-save debounced 500ms via `persistence.ts`
- Restauré au démarrage avec le reste de l'état

---

## Intégration

### Avec le système existant

| Système | Intégration |
|---------|-------------|
| **Lighting** | Les uniforms `uAmbientColor`, `uAmbientIntensity`, `uDirectionalAngle` sont synchronisables avec le `LightingState` de la scène. Le shader editor peut consommer l'état lighting comme input automatique. |
| **Particles** | Un shader peut servir de texture pour le `PointsMaterial` des particles (remplace le point blanc par défaut). |
| **Wiring** | Un shader peut être un nœud dans le graphe choreographique — un signal modifie un uniform en temps réel (ex: `uIntensity` piloté par `token_usage`). Nécessite un nouveau `WireZone: "shader"`. |
| **Export** | `shaders.json` ajouté au ZIP. Les assets référencés par des uniforms `sampler2D` sont inclus dans `assets/`. |
| **Persistence** | Nouveau store IndexedDB `"shaders"` dans `persistence-db.ts` (ajout à `STORES`, bump `DB_VERSION` à 2). |

### Avec le choreographer (futur)

Le shader editor produit des effets visuels paramétrables par uniforms. Le choreographer peut animer ces uniforms via des bindings :

```
signal "thinking" → choreography "pulse" → uniform "uIntensity" (0→1→0, easing sine)
```

Cela nécessite :
- Un nouveau type de binding : `ShaderUniformBinding` (similaire à `EntityBinding`)
- Un nouveau `WireZone: "shader"` pour le connector bar
- Les uniforms exposés apparaissent comme des "propriétés bindables" dans le connector bar V

Ce wiring est hors scope de la V1 du shader editor mais l'architecture doit le rendre possible.

### Avec la scène (application du shader)

Le shader peut être appliqué de plusieurs façons :

1. **Post-processing** — le shader traite l'image rendue de la scène entière (fullscreen quad après le rendu principal)
2. **Par entité** — le shader remplace le `MeshBasicMaterial` d'une entité spécifique
3. **Background** — le shader remplace le background color statique
4. **Overlay** — le shader est rendu par-dessus la scène avec blending (additif, multiply, screen)

La V1 implémente le mode **fullscreen preview** uniquement (le shader est visible dans le preview canvas du shader editor). L'application à la scène (post-processing, par entité, background) est une extension future.

---

## State store

### `shader-state.ts`

```typescript
interface ShaderEditorState {
  /** All shader definitions. */
  shaders: ShaderDef[];
  /** Currently selected shader ID. */
  selectedShaderId: string | null;
  /** Active editing mode. */
  activeMode: "glsl" | "script";
  /** Whether the preview is playing (animating). */
  playing: boolean;
}
```

Pattern identique aux autres stores : `getShaderState()`, `setShaderState()`, `subscribeShader()`, `resetShaderState()`.

### Extension de `EditorState`

```typescript
// Ajouts dans EditorState (types.ts)
panelLayouts: Record<PanelId, PanelLayout>;  // existant
// PanelId: ajouter "shader-code" | "shader-uniforms" si panels flottants
// ViewId: ajouter "shader"
```

---

## Presets embarqués

Le shader editor inclut une bibliothèque de presets pour démarrer rapidement :

| Preset | Mode | Inspiration |
|--------|------|-------------|
| `data-grid` | GLSL | Ryoji Ikeda — grille de données animée, lignes qui scrollent |
| `reaction-diffusion` | GLSL | Karl Sims — Gray-Scott model, patterns organiques |
| `fluid-flow` | GLSL | Felix Turner — simulation de fluide 2D simplifiée |
| `breathing-text` | Script | Zach Lieberman — texte qui pulse et se déforme |
| `noise-field` | GLSL | Perlin/simplex noise flow field, particules |
| `scan-lines` | GLSL | CRT scanlines + chromatic aberration + vignette |
| `minimal-gradient` | GLSL | Gradient animé, bon point de départ pour apprendre |

Chaque preset est un `ShaderDef` complet avec source, uniforms, et valeurs par défaut. L'utilisateur peut dupliquer un preset et le modifier.

---

## Dépendances

| Dépendance | Usage | Taille | Justification |
|------------|-------|--------|---------------|
| CodeMirror 6 | Éditeur de code | ~200KB (tree-shaken) | Léger, extensible, GLSL syntax highlighting via `@codemirror/lang-*` |
| p5.js | Runtime script mode | ~1MB (complet) ou ~300KB (instance mode tree-shaken) | Standard du creative coding, immense écosystème de sketches portables |
| — | Three.js | déjà présent | Pas de dépendance nouvelle pour le mode GLSL |

**Import stratégie** : CodeMirror et p5.js sont chargés en **lazy import** (dynamic `import()`) au premier accès au tab Shader Editor. Pas de coût au démarrage du scene-builder si l'onglet n'est jamais ouvert.

---

## Décisions (résolu)

### Multi-pass shaders — requis en V1

Les effets comme la réaction-diffusion nécessitent un ping-pong entre deux framebuffers (l'output de la frame N−1 est l'input de la frame N). C'est un prérequis pour les presets fondamentaux.

**Implémentation** : deux `WebGLRenderTarget` dans le même contexte Three.js. Chaque frame :
1. Render pass A → target B (lecture de A comme `sampler2D`, écriture dans B)
2. Swap A ↔ B
3. Render le résultat final sur le quad de preview

L'utilisateur contrôle le nombre de passes via la `ShaderDef` :

```typescript
interface ShaderDef {
  // ... champs existants ...
  /** Number of feedback passes per frame (1 = single pass, 2+ = ping-pong). */
  passes: number;
  /** Buffer resolution (can differ from preview resolution for performance). */
  bufferResolution: { width: number; height: number };
}
```

Le buffer interne de feedback (`bufferResolution`) peut être inférieur à la résolution de preview pour des raisons de performance. Uniform auto-injecté : `iChannel0` = framebuffer précédent.

### Audio reactivity — source locale + signal futur

Deux vecteurs d'entrée audio :

1. **V1 — fichier importé** : l'utilisateur importe un fichier audio (WAV/MP3/OGG) dans l'asset manager. Le shader editor crée un `AudioContext` + `AnalyserNode`, expose les données FFT comme uniform `iAudioSpectrum` (`sampler2D` 1D, 512 bins) et `iAudioLevel` (`float`, RMS normalisé 0–1). Le fichier audio est playable/pausable depuis le panneau uniforms.

2. **V2 — connecteur audio** : un nouveau type de source signal `"audio"` dans le système de signal sources. L'audio capturé (microphone, système) ou streamé depuis un agent devient un signal routable dans le graphe. Le shader consomme l'audio via le wiring comme n'importe quel autre signal. Ceci nécessite un nouveau `SignalSource.protocol: "audio"` et un transport `AudioWorklet` → signal bus.

### Sandbox — iframe sandbox pour le mode Script

Le code JavaScript utilisateur (mode p5.js) tourne dans un **`<iframe>` sandbox** :

- `sandbox="allow-scripts"` — exécute le JS mais bloque l'accès au DOM parent, cookies, localStorage
- Communication via `postMessage` : le scene-builder envoie le code source + uniforms, l'iframe renvoie le canvas bitmap (`OffscreenCanvas.transferToImageBitmap()` ou `canvas.toDataURL()`)
- Le p5.js est chargé dans l'iframe, pas dans le contexte principal
- Crash isolation : une erreur dans le sketch ne casse pas le scene-builder
- Le `srcdoc` de l'iframe est généré dynamiquement avec le runtime p5 + le code utilisateur

**Trade-off** : la communication `postMessage` ajoute ~1ms de latence par frame. Acceptable pour du preview 30-60fps. La bitmap est transférée via `Transferable` (zero-copy si le browser supporte `ImageBitmap`).

### Résolution adaptive — vectoriel

Les shaders GLSL sont vectoriels par nature (le fragment shader est évalué par pixel). La résolution de sortie est simplement la taille du `WebGLRenderTarget` ou du viewport.

**Stratégie** :
- L'éditeur preview tourne à la résolution du viewport (remplissage du panneau droit)
- Le resize est automatique (observer `ResizeObserver` sur le container)
- L'export produit à une résolution configurable (défaut : 1920×1080, ou dimensions de la scène)
- Les buffers de feedback (multi-pass) peuvent avoir une résolution indépendante (configurable dans `bufferResolution`)
- Pas de slider de qualité — la résolution suit le viewport. Un shader trop lourd se manifeste par une baisse de FPS, visible dans un compteur FPS affiché dans le coin du preview

### p5.js bundle size — non bloquant

La taille de p5.js (~1MB) n'est pas un enjeu à ce stade. Le chargement est lazy (dynamic import au premier accès au tab), l'impact sur le startup est nul. À revisiter uniquement si le build de production impose un budget réseau strict.

---

## Open questions

1. **Wiring types V1** — Faut-il déclarer `WireZone: "shader"` dans les types dès la V1 du shader editor (sans implémentation du wiring), pour éviter une migration plus tard ? Ou attendre la V2 wiring ?

2. **GLSL version** — WebGL2 est supporté par tous les browsers modernes (>97% coverage). Faut-il cibler GLSL ES 3.0 exclusivement, ou supporter aussi GLSL ES 1.0 (WebGL1) pour les vieux devices ?

3. **Shader library / community sharing** — À terme, les shader themes pourraient être partagés (import URL, galerie). Quel format de distribution : standalone JSON, ou intégré dans le ZIP de scène uniquement ?
