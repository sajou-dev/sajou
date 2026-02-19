# Sketch Editor

## Overview

The scene-builder includes a built-in sketch editor with live preview, supporting two runtime modes: **p5.js** and **Three.js**. Each sketch has a mode selector in the code panel header — the same annotations, params panel, wiring, and persistence work across both modes.

The Sketches node shares a pipeline slot with the Shader node — they are grouped in a single vertical-split container. When one is extended, it fills the slot while the other collapses to a thin 28px bar. Keyboard shortcut: `5` for Sketches, `4` for Shader.

---

## Sketch Format

Sketches are stored as `P5SketchDef` objects:

```typescript
type SketchMode = "p5" | "threejs";

interface P5SketchDef {
  id: string;
  name: string;
  source: string;          // JavaScript source code
  params: P5ParamDef[];    // Parsed from @param annotations
  width: number;           // Canvas size (0 = fit container)
  height: number;
  mode?: SketchMode;       // Runtime mode (default: "p5")
}
```

Existing sketches without a `mode` field default to `"p5"` (backward-compatible).

---

## p5.js Mode

User code receives a `p` instance with the full p5.js API, plus a `p.sajou` bridge object for accessing parameters:

```javascript
// @param: speed, slider, min: 0.1, max: 5.0

p.setup = function() {
  p.createCanvas(p.sajou._width, p.sajou._height);
  p.background(7, 7, 12);
};

p.draw = function() {
  const speed = p.sajou.speed ?? 1.0;
  p.background(7, 7, 12, 20);
  p.noStroke();
  p.fill(232, 168, 81);
  const x = p.width / 2 + p.sin(p.frameCount * 0.02 * speed) * 100;
  p.circle(x, p.height / 2, 40);
};
```

### Auto-injected parameters (p5)

| Parameter | Type | Description |
|-----------|------|-------------|
| `_width` | `number` | Container width in pixels |
| `_height` | `number` | Container height in pixels |
| `_time` | `number` | Milliseconds since sketch start |
| `_mouse` | `{x, y}` | Mouse position relative to canvas |

---

## Three.js Mode

User code defines `setup(ctx)` and `draw(ctx, state)` as top-level functions. The context object provides a pre-configured Three.js scene:

```javascript
// @param: speed, slider, min: 0.1, max: 5.0

function setup(ctx) {
  const geo = new ctx.THREE.BoxGeometry(1, 1, 1);
  const mat = new ctx.THREE.MeshStandardMaterial({ color: 0xe8a851 });
  const cube = new ctx.THREE.Mesh(geo, mat);
  ctx.scene.add(cube);

  const light = new ctx.THREE.DirectionalLight(0xffffff, 1);
  light.position.set(2, 3, 4);
  ctx.scene.add(light);
  ctx.scene.add(new ctx.THREE.AmbientLight(0x404040));

  return { cube };
}

function draw(ctx, state) {
  state.cube.rotation.y += (ctx.sajou.speed ?? 1.0) * ctx.sajou._deltaTime;
}
```

### Context object

| Property | Type | Description |
|----------|------|-------------|
| `ctx.scene` | `THREE.Scene` | The scene (dark background by default) |
| `ctx.camera` | `THREE.PerspectiveCamera` | 60 FOV camera at (0, 2, 5) looking at origin |
| `ctx.renderer` | `THREE.WebGLRenderer` | The WebGL renderer (anti-aliased) |
| `ctx.THREE` | `typeof THREE` | The full Three.js module — no import needed |
| `ctx.sajou` | `Record<string, unknown>` | Params bridge (same as p5) |

### setup() and draw()

- `setup(ctx)` runs once when the sketch starts. Return an object to store user state (meshes, materials, etc.).
- `draw(ctx, state)` runs every frame. `state` is whatever `setup()` returned.
- The renderer calls `renderer.render(scene, camera)` automatically after `draw()` — no need to call it yourself.

### Auto-injected parameters (Three.js)

| Parameter | Type | Description |
|-----------|------|-------------|
| `_width` | `number` | Container width in pixels |
| `_height` | `number` | Container height in pixels |
| `_time` | `number` | Seconds since sketch start |
| `_deltaTime` | `number` | Seconds since last frame |
| `_mouse` | `{x, y}` | Mouse position relative to canvas |

---

## Param Annotations

Add `// @param:` comments in your source to create interactive controls in the params panel. The same syntax works in both p5.js and Three.js modes:

```javascript
// @param: speed, slider, min: 0.1, max: 5.0
// @param: color, color
// @param: enable, toggle
// @param: center, xy, min: 0.0, max: 1.0
```

### Annotation syntax

```
// @param: <name>, <control> [, min: NUM] [, max: NUM] [, step: NUM]
```

### Control types

| Control | Value Type | Description |
|---------|------------|-------------|
| `slider` | `number` | Numeric slider with min/max/step |
| `color` | `[r, g, b]` | Color picker (0-1 RGB) |
| `toggle` | `boolean` | Checkbox |
| `xy` | `[x, y]` | Two sliders for 2D position |

### Default ranges

| Control | Default min | Default max | Default step |
|---------|-------------|-------------|--------------|
| `slider` | `0` | `1` | `0.01` |
| `xy` | `0` | `1` | `0.01` |

### Semantic binding

Use `// @bind:` to mark a param for choreographer wiring:

```javascript
// @param: intensity, slider, min: 0.0, max: 2.0 // @bind: intensity
```

Or on a separate line:

```javascript
// @bind: intensity
// @param: intensity, slider, min: 0.0, max: 2.0
```

---

## Mode Selector

The code panel header contains a mode dropdown between the sketch name and the sketch selector:

```
[Name] [p5.js ▾] [Sketch ▾] [▶] [spacer] [Presets] [+] [🗑]
```

When switching modes:
- If the source is still the default for the old mode, it's replaced by the default for the new mode.
- If the source has been edited by the user, it's kept as-is (the user is responsible for adapting their code).
- Creating a new sketch (`+`) inherits the mode of the currently selected sketch.

---

## Live Parameter Updates

When a slider or control is moved in the params panel, the value is updated directly on the running instance's params bridge. No re-run is needed — the sketch reads the new value on its next frame.

This makes parameter tuning instant and smooth, unlike code changes which trigger a full sketch restart (debounced 500ms).

---

## Wiring to Choreographer

Sketch params are exposed as badges on the connector bar in the scene-builder wiring view. This allows choreographer outputs to drive sketch parameters in real time.

Wire connections use the format `p5:{sketchId}:{paramName}` as their target identifier (same format for both p5.js and Three.js sketches).

Type colors on the connector badges follow the same scheme as shader uniforms:

| Param Type | Color |
|------------|-------|
| `float` / `int` (slider) | Amber `#E8A851` |
| `vec2` (xy) / `color` | Teal `#2DD4BF` |
| `bool` (toggle) | Grey `#6E6E8A` |

---

## External Control (MCP / HTTP)

Sketch params can be set externally via the scene-builder's HTTP API:

```
POST /api/p5/{sketchId}/params
Content-Type: application/json

{ "paramName": "speed", "value": 2.5 }
```

When a param value is changed externally (via MCP or direct HTTP call):

1. The server enqueues a `set-param` command and broadcasts it via SSE.
2. The browser's `command-consumer` updates the sketch state store.
3. The `p5-params-panel` subscriber detects the value change, calls `setParam()` on the running instance, and syncs the DOM slider position.

### Sketch management endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/p5` | GET | Read all sketches |
| `/api/p5` | POST | Add a new sketch |
| `/api/p5/:id` | PUT | Update a sketch (source, name, params, mode) |
| `/api/p5/:id` | DELETE | Remove a sketch |
| `/api/p5/:id/params` | POST | Set a param value in real-time |

---

## Presets

Six built-in presets are available, organized by mode:

### p5.js

1. **Particles** — bouncing particles with speed and count params
2. **Wave** — animated sine wave with speed and amplitude
3. **Grid** — mouse-reactive grid with scale param

### Three.js

4. **Bar Chart** — animated 3D bar chart with dynamic height targets
5. **City Block** — procedural buildings with flickering windows
6. **Orbit Ring** — orbiting agents around a glowing center

Use the book icon in the code panel header to load a preset. The dropdown groups presets by mode.

---

## Key Files

| File | Purpose |
|------|---------|
| `p5-editor/p5-canvas.ts` | Runtime routing — delegates to p5 or Three.js based on sketch mode |
| `p5-editor/threejs-canvas.ts` | Three.js runtime — WebGLRenderer, Scene, Camera, rAF loop, sajou bridge |
| `p5-editor/p5-code-panel.ts` | CodeMirror 6 JS editor, mode selector, sketch selector, run/stop |
| `p5-editor/p5-types.ts` | `P5SketchDef`, `P5ParamDef`, `SketchMode` type definitions |
| `p5-editor/p5-param-parser.ts` | `@param:` / `@bind:` annotation parser |
| `p5-editor/p5-params-panel.ts` | Interactive param controls (slider, color, toggle, xy) |
| `p5-editor/p5-presets.ts` | Built-in p5.js + Three.js presets |
| `p5-editor/p5-state.ts` | Module-state store with subscribe/notify |
| `workspace/connector-bar-p5.ts` | Wiring badges for sketch params |
