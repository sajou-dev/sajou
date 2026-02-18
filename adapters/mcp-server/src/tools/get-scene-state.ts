/**
 * get_scene_state tool — returns the current scene state from the scene-builder.
 *
 * Queries the real scene-builder state via the bridge. Returns all placed
 * entities with their positions, topology, and scene metadata.
 */

import { z } from "zod";
import { getSceneState, ping } from "../bridge.js";

/** Tool name. */
export const name = "get_scene_state";

/** Tool description shown to the AI agent. */
export const description =
  "Get the current state of the sajou scene. Returns all placed entities with " +
  "their id, semanticId, asset type, position, visibility, and topology. Also " +
  "includes scene dimensions, positions, routes, layers, and current editor mode. " +
  "Use this to inspect the scene before emitting signals.";

/** Input schema — no parameters needed. */
export const inputSchema = z.object({});

/** Tool handler — fetches real scene state from the bridge. */
export async function handler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const sceneState = await getSceneState();

  if (sceneState === null) {
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
            entities: [],
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
          dimensions: sceneState.dimensions,
          background: sceneState.background,
          layers: sceneState.layers,
          entities: sceneState.entities,
          positions: sceneState.positions,
          routes: sceneState.routes,
          zoneTypes: sceneState.zoneTypes,
          mode: sceneState.mode,
          viewMode: sceneState.viewMode,
          entityCount: sceneState.entities.length,
          positionCount: sceneState.positions.length,
          routeCount: sceneState.routes.length,
        }),
      },
    ],
  };
}
