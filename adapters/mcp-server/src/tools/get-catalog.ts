/**
 * get_catalog tool — returns entity catalog for a theme.
 *
 * Theme catalog system is not yet implemented. Returns a stub response
 * directing agents to use scene-level tools instead.
 */

import { z } from "zod";

/** Tool name. */
export const name = "get_catalog";

/** Tool description shown to the AI agent. */
export const description =
  "Get the entity catalog for a theme. " +
  "NOTE: Theme catalog is under development. Use get_scene_state to see " +
  "entities in the currently loaded scene instead.";

/** Input schema. */
export const inputSchema = z.object({
  theme: z
    .string()
    .describe("Theme ID to get the catalog for."),
});

/** Tool handler — returns stub until theme catalog is implemented. */
export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          status: "not_yet_available",
          theme: params.theme,
          message:
            "Theme catalog is under development. Use get_scene_state to see " +
            "entities in the currently loaded scene.",
          catalog: {},
        }),
      },
    ],
  };
}
