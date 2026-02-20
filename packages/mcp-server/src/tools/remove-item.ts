/**
 * MCP tool: remove_item
 *
 * Generic removal tool — removes an entity, choreography, binding, or wire from the scene.
 */

import { z } from "zod";
import {
  removeEntity,
  removeChoreography,
  removeBinding,
  removeWire,
  removeSignalSource,
} from "../state/mutations.js";

export const name = "remove_item";

export const description =
  "Remove an item from the scene. Supports removing entities, choreographies, bindings, wires, and signal sources. " +
  "Use get_scene_state, get_choreographies, or describe_scene to find item IDs. " +
  "Removing a choreography also cleans up its connected wires. " +
  "Removing a signal source also cleans up its wires.";

export const inputSchema = z.object({
  type: z
    .enum(["entity", "choreography", "binding", "wire", "source"])
    .describe(
      "What type of item to remove. " +
      "'entity' — a placed entity instance (use the instance ID, not the entity type). " +
      "'choreography' — a choreography definition (also removes connected wires). " +
      "'binding' — an entity binding. " +
      "'wire' — a wire connection. " +
      "'source' — a signal source (local sources cannot be removed).",
    ),
  id: z
    .string()
    .describe("The ID of the item to remove."),
});

export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  switch (params.type) {
    case "entity":
      removeEntity(params.id);
      break;
    case "choreography":
      removeChoreography(params.id);
      break;
    case "binding":
      removeBinding(params.id);
      break;
    case "wire":
      removeWire(params.id);
      break;
    case "source":
      removeSignalSource(params.id);
      break;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: true,
        }),
      },
    ],
  };
}
