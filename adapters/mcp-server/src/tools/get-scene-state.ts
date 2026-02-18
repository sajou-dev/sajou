/**
 * get_scene_state tool — returns the current scene entities from the scene-builder.
 */

import { z } from "zod";
import { getSceneState } from "../bridge.js";

/** Tool name. */
export const name = "get_scene_state";

/** Tool description shown to the AI agent. */
export const description =
  "Get the current state of the sajou scene. Returns all entities with their " +
  "id, semanticId, position, and visibility. Use this to inspect the scene before emitting signals.";

/** Input schema — no parameters needed. */
export const inputSchema = z.object({});

/** Tool handler — fetches scene state from the bridge. */
export async function handler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const entities = await getSceneState();

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ entities }),
      },
    ],
  };
}
