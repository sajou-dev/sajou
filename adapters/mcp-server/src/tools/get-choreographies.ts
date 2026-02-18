/**
 * get_choreographies tool — lists choreographies defined in the current scene.
 *
 * Queries the real scene-builder state via the bridge. Returns all
 * choreography definitions with their signal triggers, steps, and wiring info.
 */

import { z } from "zod";
import { getChoreographies, ping } from "../bridge.js";

/** Tool name. */
export const name = "get_choreographies";

/** Tool description shown to the AI agent. */
export const description =
  "List all choreographies in the current scene. Returns each choreography's " +
  "trigger signal type, when-conditions, step count, step types, and wiring " +
  "info (which signal sources feed into it). Use this to understand what " +
  "animations are available before emitting signals.";

/** Input schema — no parameters needed. */
export const inputSchema = z.object({});

/** Tool handler — fetches real choreographies from the bridge. */
export async function handler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const choreographies = await getChoreographies();

  if (choreographies === null) {
    const isRunning = await ping();

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            ok: false,
            message: isRunning
              ? "Scene-builder is running but no state has been synced yet. Open the scene-builder UI — state syncs automatically when the page loads."
              : "Scene-builder is not running. Start it with: cd tools/scene-builder && pnpm dev",
            choreographies: [],
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
          choreographies,
          count: choreographies.length,
        }),
      },
    ],
  };
}
