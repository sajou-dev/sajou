/**
 * MCP tool: set_uniform
 *
 * Sets a uniform value on a shader in real-time. This is the key runtime
 * tool — an AI agent tweaks shader parameters as events flow through.
 */

import { z } from "zod";
import { setUniform } from "../state/mutations.js";

export const name = "set_uniform";

export const description =
  "Set a uniform value on a GLSL shader in real-time. This is the primary way an AI agent " +
  "controls shader visuals — tweak a float slider, change a color, toggle an effect, or move " +
  "a 2D position.\n\n" +
  "The value type must match the uniform's GLSL type:\n" +
  "- float/int → number (e.g. 0.5)\n" +
  "- bool → boolean (true/false)\n" +
  "- vec2 → [x, y]\n" +
  "- vec3 → [r, g, b] or [x, y, z]\n" +
  "- vec4 → [r, g, b, a]\n\n" +
  "Example: to make a shader pulse faster, set_uniform({ shaderId: '...', uniformName: 'uSpeed', value: 3.0 }).\n\n" +
  "Use get_shaders first to discover available uniforms and their value ranges.";

export const inputSchema = z.object({
  shaderId: z
    .string()
    .describe("ID of the shader containing the uniform."),
  uniformName: z
    .string()
    .describe("Name of the uniform to set (e.g. 'uSpeed', 'uColor', 'uInvert')."),
  value: z
    .union([z.number(), z.boolean(), z.array(z.number())])
    .describe(
      "New value for the uniform. Must match the GLSL type: " +
      "number for float/int, boolean for bool, number[] for vec2/vec3/vec4.",
    ),
});

export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  setUniform(params.shaderId, params.uniformName, params.value);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: true,
          shaderId: params.shaderId,
          uniformName: params.uniformName,
          value: params.value,
        }),
      },
    ],
  };
}
