# Shader Annotation Reference

Source of truth: `tools/scene-builder/src/shader-editor/shader-uniform-parser.ts` and `tools/scene-builder/src/shader-editor/shader-types.ts`

---

## @ui Annotation

Declares a UI control for a user-defined uniform. Placed as a trailing comment on the uniform declaration line.

### Syntax

```glsl
uniform <type> <name>; // @ui: <control> [, min: NUM] [, max: NUM] [, step: NUM]
```

### Controls

| Control | Description |
|---|---|
| `slider` | Numeric slider with min/max/step |
| `color` | RGB color picker |
| `xy` | 2D position pad |
| `toggle` | Boolean on/off switch |

### Default control by GLSL type

| GLSL Type | Default Control | Default Min | Default Max | Default Step |
|---|---|---|---|---|
| `float` | `slider` | 0.0 | 1.0 | 0.01 |
| `int` | `slider` | 0 | 10 | 1 |
| `vec2` | `xy` | 0.0 | 1.0 | 0.01 |
| `vec3` | `color` | 0.0 | 1.0 | 0.01 |
| `vec4` | `slider` | 0.0 | 1.0 | 0.01 |
| `bool` | `toggle` | -- | -- | -- |

### Default values

| GLSL Type | Default Value |
|---|---|
| `float` | `(min + max) / 2` |
| `int` | `floor((min + max) / 2)` |
| `bool` | `false` |
| `vec2` | `[0.5, 0.5]` |
| `vec3` | `[1.0, 1.0, 1.0]` (white) |
| `vec4` | `[1.0, 1.0, 1.0, 1.0]` |

### Examples

```glsl
uniform float uSpeed;                          // slider, min: 0, max: 1, step: 0.01
uniform float uRadius; // @ui: slider, min: 0.1, max: 5.0, step: 0.1
uniform vec3 uTint;    // @ui: color
uniform vec2 uCenter;  // @ui: xy, min: -1.0, max: 1.0
uniform bool uActive;  // @ui: toggle
uniform int uCount;    // @ui: slider, min: 1, max: 100, step: 1
```

### Auto-injected uniforms

The following uniforms are injected by the runtime and excluded from parsing. Do not annotate them:

- `iTime` -- elapsed time in seconds
- `iResolution` -- canvas resolution in pixels
- `iMouse` -- mouse position
- `iFrame` -- frame count
- `iChannel0..3` -- sampler inputs

---

## @object Annotation

Groups subsequent uniforms into a named virtual object for visual organization in the panel.

### Syntax

```glsl
// @object: <id> [, label: <display name>]
```

The `id` is a machine identifier. The `label` is optional and defaults to the `id` if omitted.

### Scope

All uniforms declared after an `@object` annotation belong to that object, until the next `@object` annotation or end of file.

### Example

```glsl
// @object: sphere, label: Main Sphere
uniform float uRadius; // @ui: slider, min: 0.1, max: 2.0
uniform vec3 uColor;   // @ui: color

// @object: camera, label: Camera
uniform vec2 uCamPos;  // @ui: xy, min: -5.0, max: 5.0
uniform float uZoom;   // @ui: slider, min: 0.5, max: 10.0
```

Result: two collapsible groups in the uniforms panel -- "Main Sphere" and "Camera".

---

## @bind Annotation

Enables semantic wiring between a uniform and choreographer commands. Can be combined with `@ui` on the same line.

### Syntax

```glsl
uniform <type> <name>; // @bind: <semantic>
```

### Semantics

The `semantic` string is a freeform identifier that maps to choreographer output values. Common semantics:

| Semantic | Typical Use |
|---|---|
| `position` | Entity position (vec2) |
| `scale` | Entity scale (float) |
| `rotation` | Entity rotation (float) |
| `intensity` | Light/effect intensity (float) |
| `color` | Dynamic color (vec3) |

### Combined annotation

```glsl
uniform vec2 uPos; // @ui: xy, min: -1.0, max: 1.0 @bind: position
uniform float uGlow; // @ui: slider, min: 0.0, max: 2.0 @bind: intensity
```

The `@bind` portion is stripped before parsing `@ui` parameters.

---

## ShaderUniformDef (parsed result)

```typescript
interface ShaderUniformDef {
  name: string;
  type: "float" | "int" | "bool" | "vec2" | "vec3" | "vec4";
  control: "slider" | "color" | "toggle" | "xy";
  value: number | boolean | number[];
  defaultValue: number | boolean | number[];
  min: number;
  max: number;
  step: number;
  objectId?: string;
  bind?: { semantic: string };
}
```

---

## Key Files

- `tools/scene-builder/src/shader-editor/shader-uniform-parser.ts` -- annotation parser
- `tools/scene-builder/src/shader-editor/shader-types.ts` -- type definitions
- `tools/scene-builder/src/shader-editor/shader-defaults.ts` -- auto-injected uniform names
- `tools/scene-builder/src/shader-editor/shader-analyzer.ts` -- static value detection
