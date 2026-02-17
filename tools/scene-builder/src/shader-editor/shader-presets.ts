/**
 * Built-in shader presets.
 *
 * Each preset is a complete ShaderDef ready to be cloned and added
 * to the shader editor state.
 */

import { DEFAULT_VERTEX_SOURCE } from "./shader-defaults.js";
import type { ShaderDef } from "./shader-types.js";

// ---------------------------------------------------------------------------
// 1. Minimal Gradient — simple animated color gradient
// ---------------------------------------------------------------------------

const MINIMAL_GRADIENT_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 uv = vUv;
  float t = iTime * 0.5;
  vec3 col = 0.5 + 0.5 * cos(t + uv.xyx + vec3(0.0, 2.0, 4.0));
  fragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
// 2. Reaction-Diffusion — Gray-Scott model (multi-pass feedback)
// ---------------------------------------------------------------------------

const REACTION_DIFFUSION_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float uFeedRate; // @ui: slider, min: 0.01, max: 0.08, step: 0.001
uniform float uKillRate; // @ui: slider, min: 0.04, max: 0.07, step: 0.001
uniform vec3 uColor1;    // @ui: color
uniform vec3 uColor2;    // @ui: color

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / iResolution.xy;

  if (iFrame < 2) {
    // Initialize: uniform chemical A=1, B=0, seed a spot in center
    float d = length(uv - 0.5);
    float b = d < 0.05 ? 1.0 : 0.0;
    fragColor = vec4(1.0, b, 0.0, 1.0);
    return;
  }

  // Read current state from feedback buffer
  vec4 c = texture(iChannel0, uv);
  float a = c.r;
  float b = c.g;

  // Laplacian (5-point stencil)
  float la = -a * 4.0;
  float lb = -b * 4.0;
  la += texture(iChannel0, uv + vec2(texel.x, 0.0)).r;
  la += texture(iChannel0, uv - vec2(texel.x, 0.0)).r;
  la += texture(iChannel0, uv + vec2(0.0, texel.y)).r;
  la += texture(iChannel0, uv - vec2(0.0, texel.y)).r;
  lb += texture(iChannel0, uv + vec2(texel.x, 0.0)).g;
  lb += texture(iChannel0, uv - vec2(texel.x, 0.0)).g;
  lb += texture(iChannel0, uv + vec2(0.0, texel.y)).g;
  lb += texture(iChannel0, uv - vec2(0.0, texel.y)).g;

  // Gray-Scott reaction-diffusion
  float dA = 1.0;
  float dB = 0.5;
  float dt = 1.0;
  float abb = a * b * b;
  float newA = a + (dA * la - abb + uFeedRate * (1.0 - a)) * dt;
  float newB = b + (dB * lb + abb - (uKillRate + uFeedRate) * b) * dt;

  newA = clamp(newA, 0.0, 1.0);
  newB = clamp(newB, 0.0, 1.0);

  // Color output
  vec3 col = mix(uColor1, uColor2, newB);
  fragColor = vec4(newA, newB, col.b, 1.0);

  // Visual output (for final pass to screen)
  fragColor = vec4(col, 1.0);
  fragColor.rg = vec2(newA, newB); // Store state in rg channels for feedback
}
`;

// ---------------------------------------------------------------------------
// 3. Noise Field — Perlin-like flow field
// ---------------------------------------------------------------------------

const NOISE_FIELD_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float uSpeed; // @ui: slider, min: 0.0, max: 5.0, step: 0.1
uniform float uScale; // @ui: slider, min: 1.0, max: 20.0, step: 0.5
uniform vec3 uColor;  // @ui: color

// Hash-based pseudo-random
vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// Gradient noise
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// FBM (fractal Brownian motion)
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = vUv * uScale;
  float t = iTime * uSpeed * 0.3;

  // Warped noise field
  float n1 = fbm(uv + vec2(t * 0.3, t * 0.1));
  float n2 = fbm(uv + vec2(n1 * 2.0, t * 0.2));
  float n3 = fbm(uv + vec2(n2 * 1.5, n1 * 1.5 + t * 0.1));

  // Color mapping
  float intensity = n3 * 0.5 + 0.5;
  vec3 col = uColor * intensity;
  col += 0.1 * vec3(n1, n2, n3); // subtle color variation

  fragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

/** All built-in shader presets. */
export const SHADER_PRESETS: readonly ShaderPreset[] = [
  {
    name: "Minimal Gradient",
    description: "Simple animated color gradient",
    create: () => ({
      id: crypto.randomUUID(),
      name: "Minimal Gradient",
      mode: "glsl",
      vertexSource: DEFAULT_VERTEX_SOURCE,
      fragmentSource: MINIMAL_GRADIENT_FRAG,
      uniforms: [],
      objects: [],
      passes: 1,
      bufferResolution: 0,
    }),
  },
  {
    name: "Reaction-Diffusion",
    description: "Gray-Scott model with feedback (multi-pass)",
    create: () => ({
      id: crypto.randomUUID(),
      name: "Reaction-Diffusion",
      mode: "glsl",
      vertexSource: DEFAULT_VERTEX_SOURCE,
      fragmentSource: REACTION_DIFFUSION_FRAG,
      uniforms: [
        { name: "uFeedRate", type: "float", control: "slider", value: 0.037, defaultValue: 0.037, min: 0.01, max: 0.08, step: 0.001 },
        { name: "uKillRate", type: "float", control: "slider", value: 0.06, defaultValue: 0.06, min: 0.04, max: 0.07, step: 0.001 },
        { name: "uColor1", type: "vec3", control: "color", value: [0.1, 0.1, 0.3], defaultValue: [0.1, 0.1, 0.3], min: 0, max: 1, step: 0.01 },
        { name: "uColor2", type: "vec3", control: "color", value: [0.9, 0.6, 0.2], defaultValue: [0.9, 0.6, 0.2], min: 0, max: 1, step: 0.01 },
      ],
      objects: [],
      passes: 2,
      bufferResolution: 0,
    }),
  },
  {
    name: "Noise Field",
    description: "Perlin noise flow field with FBM",
    create: () => ({
      id: crypto.randomUUID(),
      name: "Noise Field",
      mode: "glsl",
      vertexSource: DEFAULT_VERTEX_SOURCE,
      fragmentSource: NOISE_FIELD_FRAG,
      uniforms: [
        { name: "uSpeed", type: "float", control: "slider", value: 1.0, defaultValue: 1.0, min: 0, max: 5, step: 0.1 },
        { name: "uScale", type: "float", control: "slider", value: 5.0, defaultValue: 5.0, min: 1, max: 20, step: 0.5 },
        { name: "uColor", type: "vec3", control: "color", value: [0.91, 0.66, 0.32], defaultValue: [0.91, 0.66, 0.32], min: 0, max: 1, step: 0.01 },
      ],
      objects: [],
      passes: 1,
      bufferResolution: 0,
    }),
  },
] as const;

/** A preset entry with factory function. */
export interface ShaderPreset {
  name: string;
  description: string;
  create: () => ShaderDef;
}
