# p5.js Editor

## Overview

The scene-builder includes a built-in p5.js sketch editor with live preview. Sketches run in [instance mode](https://github.com/processing/p5.js/wiki/Global-and-instance-mode) — each sketch is an isolated function receiving a `p` instance, with no global pollution.

The p5.js node shares a pipeline slot with the Shader node — they are grouped in a single vertical-split container. When one is extended, it fills the slot while the other collapses to a thin 28px bar. Keyboard shortcut: `5` for p5.js, `4` for Shader.

The p5 editor supports interactive param controls via annotation comments, a params bridge for live parameter updates without re-running, and multiple sketch management with presets.

---

## Sketch Format

Sketches are stored as `P5SketchDef` objects:

```typescript
interface P5SketchDef {
  id: string;
  name: string;
  source: string;          // JavaScript source code
  params: P5ParamDef[];    // Parsed from @param annotations
  width: number;           // Canvas size (0 = fit container)
  height: number;
}
```

---

## Writing Sketches

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

---

## Auto-Injected Parameters

The following values are automatically available on `p.sajou` without any annotation:

| Parameter | Type | Description |
|-----------|------|-------------|
| `_width` | `number` | Container width in pixels |
| `_height` | `number` | Container height in pixels |
| `_time` | `number` | Milliseconds since sketch start |
| `_mouse` | `{x, y}` | Mouse position relative to canvas |

---

## Param Annotations

Add `// @param:` comments in your source to create interactive controls in the params panel:

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

| Control | p5 Value Type | Description |
|---------|---------------|-------------|
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

## Live Parameter Updates

When a slider or control is moved in the params panel, the value is updated directly on the `p.sajou` bridge object of the running p5 instance. No re-run is needed — the sketch reads the new value on its next `draw()` call.

This makes parameter tuning instant and smooth, unlike code changes which trigger a full sketch restart (debounced 500ms).

---

## Wiring to Choreographer

p5 sketch params are exposed as badges on the connector bar in the scene-builder wiring view. This allows choreographer outputs to drive sketch parameters in real time.

Wire connections use the format `p5:{sketchId}:{paramName}` as their target identifier.

Type colors on the connector badges follow the same scheme as shader uniforms:

| Param Type | Color |
|------------|-------|
| `float` / `int` (slider) | Amber `#E8A851` |
| `vec2` (xy) / `color` | Teal `#2DD4BF` |
| `bool` (toggle) | Grey `#6E6E8A` |

---

## External Control (MCP / HTTP)

p5 sketch params can be set externally via the scene-builder's HTTP API:

```
POST /api/p5/{sketchId}/params
Content-Type: application/json

{ "paramName": "speed", "value": 2.5 }
```

When a param value is changed externally (via MCP or direct HTTP call):

1. The server enqueues a `set-param` command and broadcasts it via SSE.
2. The browser's `command-consumer` updates the p5 state store.
3. The `p5-params-panel` subscriber detects the value change, calls `setParam()` on the running p5 instance, and syncs the DOM slider position.

### Sketch management endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/p5` | GET | Read all sketches |
| `/api/p5` | POST | Add a new sketch |
| `/api/p5/:id` | PUT | Update a sketch (source, name, params) |
| `/api/p5/:id` | DELETE | Remove a sketch |
| `/api/p5/:id/params` | POST | Set a param value in real-time |

---

## Presets

Three built-in presets are available:

1. **Particles** — bouncing particles with speed and count params
2. **Wave** — animated sine wave with speed and amplitude
3. **Grid** — mouse-reactive grid with scale param

Use the book icon in the code panel header to load a preset.

---

## Key Files

| File | Purpose |
|------|---------|
| `tools/scene-builder/src/p5-editor/p5-canvas.ts` | p5 instance lifecycle (start/stop/rerun, sajou bridge) |
| `tools/scene-builder/src/p5-editor/p5-code-panel.ts` | CodeMirror 6 JS editor + sketch selector + run/stop |
| `tools/scene-builder/src/p5-editor/p5-types.ts` | `P5SketchDef`, `P5ParamDef` type definitions |
| `tools/scene-builder/src/p5-editor/p5-param-parser.ts` | `@param:` / `@bind:` annotation parser |
| `tools/scene-builder/src/p5-editor/p5-params-panel.ts` | Interactive param controls (slider, color, toggle, xy) |
| `tools/scene-builder/src/p5-editor/p5-presets.ts` | Built-in sketch presets |
| `tools/scene-builder/src/p5-editor/p5-state.ts` | Module-state store with subscribe/notify |
| `tools/scene-builder/src/workspace/connector-bar-p5.ts` | Wiring badges for p5 params |
