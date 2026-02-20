/**
 * get_scene_state tool — returns the current scene state from the store.
 *
 * Reads the server-authoritative state directly. Returns all placed
 * entities with their positions, topology, and scene metadata.
 */

import { z } from "zod";
import { getSceneSnapshot, getEditor } from "../state/store.js";

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

/** Tool handler — reads scene state from the store. */
export async function handler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const sceneState = getSceneSnapshot();
  const editor = getEditor();

  const entities = (sceneState["entities"] ?? []) as Array<Record<string, unknown>>;
  const positions = (sceneState["positions"] ?? []) as Array<Record<string, unknown>>;
  const routes = (sceneState["routes"] ?? []) as Array<Record<string, unknown>>;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: true,
          dimensions: sceneState["dimensions"],
          background: sceneState["background"],
          layers: sceneState["layers"],
          entities,
          positions,
          routes,
          zoneTypes: sceneState["zoneTypes"],
          mode: editor["mode"] ?? null,
          viewMode: editor["viewMode"] ?? null,
          entityCount: entities.length,
          positionCount: positions.length,
          routeCount: routes.length,
        }),
      },
    ],
  };
}
