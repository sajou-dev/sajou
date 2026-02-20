/**
 * MCP tool: create_shader
 *
 * Creates a GLSL shader in the scene-builder with uniforms that the
 * choreographer can tween at runtime.
 */

import { z } from "zod";
import { addShader } from "../state/mutations.js";

export const name = "create_shader";

export const description =
  "Create a GLSL shader — a visual layer that renders custom fragment/vertex shaders on the sajou scene. " +
  "Shaders are the most expressive visual primitive: they run per-pixel GPU code every frame.\n\n" +
  "**Uniforms** are the knobs the choreographer can tween. Declare them in the GLSL source and in the " +
  "`uniforms` array so the UI and choreographer know about them. Each uniform has a control type " +
  "(slider, color, toggle, xy) and value range.\n\n" +
  "**@object grouping**: Use the `objects` array to declare virtual objects (e.g. 'sphere', 'camera'). " +
  "Then set `objectId` on uniforms to group them under that object in the UI. This is purely organizational.\n\n" +
  "**@bind semantic**: Set `bind: { semantic: 'intensity' }` on a uniform to connect it to choreographer signals. " +
  "The choreographer can then tween that uniform in response to agent events.\n\n" +
  "**Multi-pass**: Set `passes: 2` (or more) for ping-pong feedback effects (e.g. reaction-diffusion, fluid sim). " +
  "The previous frame is available as `iChannel0`.\n\n" +
  "**Auto-injected uniforms** (do NOT declare these — they are always available):\n" +
  "- `iTime` (float) — elapsed time in seconds\n" +
  "- `iTimeDelta` (float) — time since last frame\n" +
  "- `iResolution` (vec3) — canvas width, height, pixel ratio\n" +
  "- `iMouse` (vec4) — mouse position\n" +
  "- `iFrame` (int) — frame counter\n" +
  "- `iChannel0` (sampler2D) — previous frame (multi-pass only)\n\n" +
  "**Minimal example** — animated gradient:\n" +
  "```glsl\n" +
  "#version 300 es\n" +
  "precision highp float;\n" +
  "in vec2 vUv;\n" +
  "out vec4 fragColor;\n" +
  "uniform float uSpeed; // @ui: slider\n" +
  "void main() {\n" +
  "  vec3 col = 0.5 + 0.5 * cos(iTime * uSpeed + vUv.xyx + vec3(0,2,4));\n" +
  "  fragColor = vec4(col, 1.0);\n" +
  "}\n" +
  "```\n\n" +
  "After creating a shader, use `set_uniform` to tweak parameters in real-time, " +
  "or wire it to the choreographer via `create_wire` (choreographer → shader).";

const uniformSchema = z.object({
  name: z
    .string()
    .describe("Uniform name as declared in GLSL (e.g. 'uSpeed', 'uColor')."),
  type: z
    .enum(["float", "int", "bool", "vec2", "vec3", "vec4"])
    .describe("GLSL type of the uniform."),
  control: z
    .enum(["slider", "color", "toggle", "xy"])
    .describe(
      "UI control widget. 'slider' for numeric, 'color' for vec3 RGB, " +
      "'toggle' for bool, 'xy' for vec2 position.",
    ),
  value: z
    .union([z.number(), z.boolean(), z.array(z.number())])
    .describe("Initial value. number for float/int, boolean for bool, number[] for vecN."),
  min: z.number().optional().describe("Minimum value for slider controls. Default: 0."),
  max: z.number().optional().describe("Maximum value for slider controls. Default: 1."),
  step: z.number().optional().describe("Step increment for slider controls. Default: 0.01."),
  objectId: z
    .string()
    .optional()
    .describe("Virtual object ID this uniform belongs to (matches an entry in the objects array)."),
  bind: z
    .object({ semantic: z.string().describe("Semantic role: 'intensity', 'position', 'scale', 'rotation', etc.") })
    .optional()
    .describe("Choreographer binding hint — connects this uniform to a signal semantic."),
});

const objectSchema = z.object({
  id: z.string().describe("Object identifier (e.g. 'sphere', 'camera')."),
  label: z.string().describe("Display label in the UI panel."),
});

export const inputSchema = z.object({
  name: z
    .string()
    .describe("Display name for the shader (e.g. 'Plasma Background', 'Agent Glow')."),
  fragmentSource: z
    .string()
    .describe(
      "GLSL fragment shader source code (ES 3.0). Must include #version 300 es, " +
      "precision qualifier, and output to fragColor. Auto-injected uniforms (iTime, etc.) " +
      "are available without declaring them.",
    ),
  vertexSource: z
    .string()
    .optional()
    .describe(
      "GLSL vertex shader source. If omitted, a default passthrough vertex shader is used " +
      "that passes UVs to the fragment shader via vUv.",
    ),
  uniforms: z
    .array(uniformSchema)
    .optional()
    .describe("User-defined uniforms exposed in the editor and available to the choreographer."),
  objects: z
    .array(objectSchema)
    .optional()
    .describe("Virtual objects for grouping related uniforms in the UI."),
  passes: z
    .number()
    .optional()
    .describe("Number of render passes. 1 = single-pass (default), 2+ = ping-pong feedback."),
});

/** Default passthrough vertex shader. */
const DEFAULT_VERTEX = `#version 300 es
precision highp float;

in vec3 position;
in vec2 uv;

out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const shaderId = crypto.randomUUID();

  const uniformsPayload = (params.uniforms ?? []).map((u) => ({
    name: u.name,
    type: u.type,
    control: u.control,
    value: u.value,
    defaultValue: u.value,
    min: u.min ?? 0,
    max: u.max ?? 1,
    step: u.step ?? 0.01,
    objectId: u.objectId,
    bind: u.bind,
  }));

  addShader({
    id: shaderId,
    name: params.name,
    fragmentSource: params.fragmentSource,
    vertexSource: params.vertexSource ?? DEFAULT_VERTEX,
    uniforms: uniformsPayload,
    objects: params.objects ?? [],
    passes: params.passes ?? 1,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: true,
          shaderId,
          hint: `Shader '${params.name}' created with ID ${shaderId}. ` +
            `Use set_uniform to tweak parameters, or create_wire to connect it to the choreographer.`,
        }),
      },
    ],
  };
}
