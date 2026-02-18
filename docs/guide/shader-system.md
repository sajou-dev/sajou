# Shader System

## Overview

The scene-builder includes a built-in GLSL shader editor with live preview. Shaders are compiled and rendered on a dedicated Three.js canvas using `RawShaderMaterial` applied to a fullscreen quad geometry (`PlaneGeometry` 2x2) viewed through an orthographic camera. All shaders use GLSL ES 3.0 (WebGL2).

The shader editor supports interactive uniform controls via annotation comments, Shadertoy import with automatic code wrapping, multi-pass ping-pong rendering, and static analysis of fragment source to detect extractable numeric literals.

---

## Shader Format

Shaders are stored as separate vertex and fragment source strings within a `ShaderDef` object:

```typescript
interface ShaderDef {
  id: string;
  name: string;
  mode: "glsl";
  vertexSource: string;       // GLSL ES 3.0 vertex shader
  fragmentSource: string;     // GLSL ES 3.0 fragment shader
  uniforms: ShaderUniformDef[];
  objects: ShaderObjectDef[];
  passes: number;             // 1 = single-pass, 2+ = ping-pong
  bufferResolution: number;   // 0 = match canvas
}
```

- `passes` controls the number of render passes. A value of `1` means single-pass rendering. A value of `2` or more enables ping-pong feedback (see the Multi-Pass section below).
- `bufferResolution` of `0` means the render targets match the canvas dimensions. Any other value sets a fixed resolution for the offscreen buffers.

---

## Default Vertex Shader

A passthrough vertex shader is provided by default. It forwards the UV coordinates to the fragment shader and passes the vertex position through unchanged:

```glsl
#version 300 es
precision highp float;
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
```

Most shader work happens in the fragment shader. You only need to modify the vertex shader if your effect requires custom vertex transformations.

---

## Auto-Injected Uniforms

The following uniforms are automatically prepended to every fragment shader before compilation:

```glsl
uniform float iTime;        // Elapsed seconds
uniform float iTimeDelta;   // Delta time last frame
uniform vec3  iResolution;  // (width, height, aspectRatio)
uniform vec4  iMouse;       // (x, y, clickX, clickY)
uniform int   iFrame;       // Frame counter
```

For multi-pass shaders, an additional sampler is injected:

```glsl
uniform sampler2D iChannel0; // Previous frame (ping-pong buffer)
```

These auto-injected uniforms are excluded from the uniforms UI panel. You do not need to declare them in your shader code or in the `uniforms` array of the `ShaderDef` -- they are always available.

---

## Importing from Shadertoy

The scene-builder auto-detects Shadertoy code. When it finds the Shadertoy entry point signature `mainImage(out vec4 fragColor, in vec2 fragCoord)` instead of a standard `void main()`, it wraps the code automatically.

A Shadertoy shader written as:

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
}
```

Gets wrapped by the scene-builder into:

```glsl
out vec4 _fragColor;
void mainImage(out vec4 fragColor, in vec2 fragCoord);
void main() {
    mainImage(_fragColor, gl_FragCoord.xy);
}
// ... your Shadertoy code follows here ...
```

### How to import

1. Copy the Shadertoy code as-is into the fragment source field.
2. The auto-detection recognizes the `mainImage` signature and generates the wrapper.
3. `iTime`, `iResolution`, `iMouse`, and `iFrame` are already provided by the auto-injected uniforms (they match the Shadertoy convention).

### Limitations

- Only `iChannel0` is supported via multi-pass ping-pong. `iChannel1`, `iChannel2`, and `iChannel3` are not available.
- Shadertoy Buffer A/B/C/D tabs are not mapped automatically. If a shader depends on multiple buffer passes, you will need to restructure it into a single-buffer pipeline or remove those dependencies.
- `iChannelResolution`, `iDate`, and `iSampleRate` are not injected. Shaders that rely on these will need manual edits.

---

## Uniform Annotations

Add `// @ui:` comments at the end of a uniform declaration to create interactive controls in the editor panel:

```glsl
uniform float uSpeed;    // @ui: slider, min: 0.1, max: 5.0
uniform vec3  uColor;    // @ui: color
uniform vec2  uCenter;   // @ui: xy
uniform bool  uInvert;   // @ui: toggle
```

### Annotation syntax

```
// @ui: <control> [, min: NUM] [, max: NUM] [, step: NUM]
```

The `min`, `max`, and `step` parameters are optional and apply to numeric controls (`slider`, `xy`).

### Default controls by type

If no `// @ui:` annotation is present, the parser assigns a default control based on the GLSL type:

| GLSL Type       | Default Control |
|-----------------|-----------------|
| `float` / `int` | `slider`        |
| `vec2`          | `xy`            |
| `vec3`          | `color`         |
| `bool`          | `toggle`        |

### Virtual object grouping

Use `// @object:` to group related uniforms under a named section in the UI panel:

```glsl
// @object: sphere, label: Sphere Properties
uniform float uRadius;   // @ui: slider, min: 0.1, max: 10.0
uniform vec3  uEmission; // @ui: color
```

All uniforms following an `@object:` comment belong to that group until the next `@object:` comment or the end of the source.

### Semantic binding

Use `// @bind:` to mark a uniform for choreographer wiring:

```glsl
uniform vec2 uPos; // @bind: position
```

This allows the choreographer to drive the uniform value through the signal pipeline.

---

## Shader Analyzer

The analyzer performs static analysis on the fragment source to detect extractable numeric literals. These are constants embedded directly in the code that could be promoted to uniforms for interactive control.

The analyzer detects literals in the following contexts:

- **Vec constructors** -- with color heuristics applied for `vec3`/`vec4` values in the 0.0 to 1.0 range.
- **Function arguments** -- calls to `smoothstep`, `mix`, `pow`, and `clamp`.
- **Time patterns** -- expressions like `iTime * FREQ` or `sin(... * FREQ)` where `FREQ` is a numeric literal.
- **SDF primitives** -- calls like `sdSphere(pos, RADIUS)` where `RADIUS` is a literal.

Each detection is assigned a confidence score between 0 and 1. You can "expose" a detected literal to promote it to a uniform with a `// @ui:` annotation, replacing the inline constant with a controllable parameter.

---

## Multi-Pass (Ping-Pong Feedback)

Set `passes: 2` (or higher) in the `ShaderDef` to enable multi-pass ping-pong rendering. This is useful for feedback effects, simulations, and any technique that reads the previous frame's output.

The rendering pipeline works as follows:

1. Render pass 1: output goes to `renderTargetB`, reading from `renderTargetA` via `iChannel0`.
2. Swap `renderTargetA` and `renderTargetB`.
3. Final pass renders to screen.

Use `iFrame` to detect the first frame and initialize state:

```glsl
if (iFrame == 0) {
    // Initialize buffer state
    fragColor = vec4(0.0);
    return;
}
// Read previous frame
vec4 prev = texture(iChannel0, vUv);
```

---

## Wiring to Choreographer

Shader uniforms are exposed as badges on the connector bar in the scene-builder wiring view. This allows choreographer outputs to drive shader parameters in real time.

Wire connections use the format `{shaderId}:{uniformName}` as their target identifier.

Type colors on the connector badges follow this scheme:

| Uniform Type           | Color                  |
|------------------------|------------------------|
| `float` / `int`        | Amber `#E8A851`        |
| `vec2` / `vec3` / `vec4` | Teal `#2DD4BF`      |
| `bool`                 | Grey `#6E6E8A`         |

---

## Key Files

| File | Purpose |
|------|---------|
| `tools/scene-builder/src/shader-editor/shader-canvas.ts` | Shader compilation and Three.js rendering |
| `tools/scene-builder/src/shader-editor/shader-types.ts` | `ShaderDef` and related type definitions |
| `tools/scene-builder/src/shader-editor/shader-uniform-parser.ts` | `@ui:` annotation parser |
| `tools/scene-builder/src/shader-editor/shader-analyzer.ts` | Static literal detection and confidence scoring |
| `tools/scene-builder/src/shader-editor/shader-presets.ts` | Built-in shader presets |
| `tools/scene-builder/src/shader-editor/extract-to-uniform.ts` | Promote detected literal to a uniform |
