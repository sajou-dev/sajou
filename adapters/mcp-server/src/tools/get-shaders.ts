/**
 * MCP tool: get_shaders
 *
 * Lists all shader definitions with full details (code, uniforms, objects).
 */

import { z } from "zod";
import { getShaders } from "../state/store.js";

export const name = "get_shaders";

export const description =
  "List all GLSL shaders in the current scene with full details: source code, " +
  "uniforms (names, types, values, ranges, bindings), virtual objects, and pass count. " +
  "Use this to inspect existing shaders before modifying them or setting uniforms.";

export const inputSchema = z.object({});

export async function handler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const shadersState = getShaders();
  const shaders = (shadersState["shaders"] ?? []) as Array<Record<string, unknown>>;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: true,
          shaderCount: shaders.length,
          shaders: shaders.map((s) => ({
            id: s["id"],
            name: s["name"],
            mode: s["mode"],
            passes: s["passes"],
            fragmentSource: s["fragmentSource"],
            vertexSource: s["vertexSource"],
            uniforms: s["uniforms"],
            objects: s["objects"],
          })),
        }),
      },
    ],
  };
}
