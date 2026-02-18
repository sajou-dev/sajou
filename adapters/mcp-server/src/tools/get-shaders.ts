/**
 * MCP tool: get_shaders
 *
 * Lists all shader definitions with full details (code, uniforms, objects).
 */

import { z } from "zod";
import { getShaders, ping } from "../bridge.js";

export const name = "get_shaders";

export const description =
  "List all GLSL shaders in the current scene with full details: source code, " +
  "uniforms (names, types, values, ranges, bindings), virtual objects, and pass count. " +
  "Use this to inspect existing shaders before modifying them or setting uniforms.";

export const inputSchema = z.object({});

export async function handler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const shaders = await getShaders();

  if (shaders === null) {
    const isRunning = await ping();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            ok: false,
            message: isRunning
              ? "Scene-builder is running but no shader state has been synced yet. Open the scene-builder UI — state syncs automatically when the page loads."
              : "Scene-builder is not running. Start it with: cd tools/scene-builder && pnpm dev",
            shaders: [],
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: true,
          shaderCount: shaders.length,
          shaders: shaders.map((s) => ({
            id: s.id,
            name: s.name,
            mode: s.mode,
            passes: s.passes,
            fragmentSource: s.fragmentSource,
            vertexSource: s.vertexSource,
            uniforms: s.uniforms,
            objects: s.objects,
          })),
        }),
      },
    ],
  };
}
