/**
 * list_themes tool — returns available sajou themes.
 *
 * Theme catalog system is not yet implemented. Returns a stub response
 * directing agents to use scene-level tools instead.
 */

import { z } from "zod";

/** Tool name. */
export const name = "list_themes";

/** Tool description shown to the AI agent. */
export const description =
  "List available sajou themes. " +
  "NOTE: Theme catalog is under development. Use get_scene_state and " +
  "get_choreographies to interact with the currently loaded scene instead.";

/** Input schema — no parameters needed. */
export const inputSchema = z.object({});

/** Tool handler — returns stub until theme catalog is implemented. */
export async function handler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          status: "not_yet_available",
          message:
            "Theme catalog is under development. Use get_scene_state and " +
            "get_choreographies to interact with the currently loaded scene.",
          themes: [],
        }),
      },
    ],
  };
}
