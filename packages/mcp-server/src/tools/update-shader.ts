/**
 * MCP tool: update_shader
 *
 * Updates an existing shader's code, uniforms, name, or pass count.
 */

import { z } from "zod";
import { updateShader } from "../state/mutations.js";

export const name = "update_shader";

export const description =
  "Update an existing GLSL shader. You can change the fragment/vertex source code, " +
  "uniforms, name, or pass count. Only provided fields are updated — omitted fields " +
  "keep their current values. Use get_shaders first to find the shader ID.";

const uniformSchema = z.object({
  name: z.string().describe("Uniform name as declared in GLSL."),
  type: z.enum(["float", "int", "bool", "vec2", "vec3", "vec4"]).describe("GLSL type."),
  control: z.enum(["slider", "color", "toggle", "xy"]).describe("UI control widget."),
  value: z.union([z.number(), z.boolean(), z.array(z.number())]).describe("Current value."),
  min: z.number().optional().describe("Minimum for slider. Default: 0."),
  max: z.number().optional().describe("Maximum for slider. Default: 1."),
  step: z.number().optional().describe("Step for slider. Default: 0.01."),
  objectId: z.string().optional().describe("Virtual object ID for grouping."),
  bind: z
    .object({ semantic: z.string() })
    .optional()
    .describe("Choreographer binding hint."),
});

const objectSchema = z.object({
  id: z.string().describe("Object identifier."),
  label: z.string().describe("Display label."),
});

export const inputSchema = z.object({
  shaderId: z
    .string()
    .describe("ID of the shader to update (from create_shader or get_shaders)."),
  name: z.string().optional().describe("New display name."),
  fragmentSource: z.string().optional().describe("New fragment shader GLSL source."),
  vertexSource: z.string().optional().describe("New vertex shader GLSL source."),
  uniforms: z.array(uniformSchema).optional().describe("Replace the full uniforms list."),
  objects: z.array(objectSchema).optional().describe("Replace the full objects list."),
  passes: z.number().optional().describe("New pass count."),
});

export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { shaderId, ...fields } = params;

  const data: Record<string, unknown> = {};
  if (fields.name !== undefined) data["name"] = fields.name;
  if (fields.fragmentSource !== undefined) data["fragmentSource"] = fields.fragmentSource;
  if (fields.vertexSource !== undefined) data["vertexSource"] = fields.vertexSource;
  if (fields.passes !== undefined) data["passes"] = fields.passes;
  if (fields.uniforms !== undefined) {
    data["uniforms"] = fields.uniforms.map((u) => ({
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
  }
  if (fields.objects !== undefined) data["objects"] = fields.objects;

  updateShader(shaderId, data);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: true,
          shaderId,
        }),
      },
    ],
  };
}
