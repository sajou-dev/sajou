/**
 * Default shader sources and auto-injected uniform declarations.
 *
 * All shaders get the auto-injected uniform block prepended.
 * Users write fragment shaders starting from the main() function.
 */

/** Auto-injected uniform block (prepended to every fragment shader). */
export const UNIFORM_PREFIX = `
uniform float iTime;
uniform float iTimeDelta;
uniform vec2  iResolution;
uniform vec4  iMouse;
uniform int   iFrame;
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

/** Default fragment shader (animated gradient). */
export const DEFAULT_FRAGMENT_SOURCE = `#version 300 es
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
