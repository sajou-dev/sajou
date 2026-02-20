/**
 * Default shader sources and auto-injected uniform declarations.
 *
 * All shaders get the auto-injected uniform block prepended.
 * Users write fragment shaders starting from the main() function.
 */

/** Auto-injected uniform block (prepended to every fragment shader). */
export const UNIFORM_PREFIX = `precision highp float;
#define HW_PERFORMANCE 1
uniform float iTime;
uniform float iTimeDelta;
uniform vec3  iResolution;
uniform vec4  iMouse;
uniform int   iFrame;
`;

/** Additional uniform block for multi-pass shaders (ping-pong feedback). */
export const MULTIPASS_PREFIX = `
uniform sampler2D iChannel0;
`;

/** Auto-injected uniform names — excluded from the user uniforms panel. */
export const AUTO_UNIFORMS = new Set([
  "iTime",
  "iTimeDelta",
  "iResolution",
  "iMouse",
  "iFrame",
  "iChannel0",
]);

/** Default vertex shader (GLSL ES 3.0 passthrough). */
export const DEFAULT_VERTEX_SOURCE = `#version 300 es
precision highp float;

in vec3 position;
in vec2 uv;

out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

/** Default fragment shader — plasma with bindable uniforms. */
export const DEFAULT_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float uSpeed;     // @ui: slider, min: 0.1, max: 5.0
uniform float uScale;     // @ui: slider, min: 1.0, max: 20.0
uniform float uIntensity; // @ui: slider, min: 0.0, max: 1.0
uniform vec3  uTint;      // @ui: color
uniform vec2  uCenter;    // @ui: xy
uniform bool  uInvert;    // @ui: toggle

void main() {
  vec2 uv = vUv * uScale;
  vec2 c = uCenter * uScale;
  float t = iTime * uSpeed;

  // layered sine plasma
  float v = sin(uv.x + t);
  v += sin(uv.y + t * 0.7);
  v += sin((uv.x + uv.y) + t * 0.5);
  v += sin(length(uv - c) * 2.0 + t);
  v *= 0.25; // normalise to -1..1

  // palette: cosine gradient tinted by uTint
  vec3 col = 0.5 + 0.5 * cos(v * 3.14159 + vec3(0.0, 2.0, 4.0));
  col = mix(col, col * uTint, uIntensity);

  if (uInvert) col = 1.0 - col;

  fragColor = vec4(col, 1.0);
}
`;
