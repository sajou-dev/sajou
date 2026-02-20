/**
 * MCP tool: place_entity
 *
 * Places an entity instance on the scene at a given position.
 * Entities are visual objects from the theme's catalog (e.g. 'peon', 'tree', 'building').
 */

import { z } from "zod";
import { addEntity } from "../state/mutations.js";

export const name = "place_entity";

export const description =
  "Place an entity on the scene. Entities are visual objects defined in the theme's catalog. " +
  "Use get_catalog to see available entity types for the current theme. " +
  "Each placed entity gets a unique instance ID and can optionally have a semanticId " +
  "to make it an 'actor' that choreographies can target. " +
  "Example: place a 'peon' entity at (200, 300) with semanticId 'agent-1' — " +
  "then choreographies can animate 'agent-1' to move, change state, etc.";

export const inputSchema = z.object({
  entityId: z
    .string()
    .describe(
      "The entity type ID from the theme catalog (e.g. 'peon', 'tree', 'building-townhall'). " +
      "Use get_catalog to list available entity types.",
    ),
  x: z
    .number()
    .describe("X position on the scene (pixels from left). Scene is typically 960px wide."),
  y: z
    .number()
    .describe("Y position on the scene (pixels from top). Scene is typically 640px tall."),
  semanticId: z
    .string()
    .optional()
    .describe(
      "Optional actor name for this entity (e.g. 'agent-1', 'door-kitchen', 'indicator-status'). " +
      "When set, choreographies can target this entity by name. " +
      "Must be unique across all placed entities. " +
      "Omit for passive decoration entities.",
    ),
  layerId: z
    .string()
    .optional()
    .describe(
      "Scene layer: 'background' (behind), 'midground' (default), 'foreground' (in front). " +
      "Defaults to 'midground'.",
    ),
  scale: z
    .number()
    .optional()
    .describe("Uniform scale factor. 1 = normal size, 0.5 = half, 2 = double. Defaults to 1."),
  rotation: z
    .number()
    .optional()
    .describe("Rotation in degrees. Defaults to 0."),
  zIndex: z
    .number()
    .optional()
    .describe("Z-order within the layer. Higher values render on top. Defaults to 0."),
  activeState: z
    .string()
    .optional()
    .describe("Initial animation state (e.g. 'idle', 'walk', 'attack'). Defaults to 'idle'."),
});

export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const instanceId = crypto.randomUUID();

  addEntity({
    id: instanceId,
    entityId: params.entityId,
    x: params.x,
    y: params.y,
    semanticId: params.semanticId,
    layerId: params.layerId,
    scale: params.scale,
    rotation: params.rotation,
    zIndex: params.zIndex,
    activeState: params.activeState,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: true,
          instanceId,
          hint: params.semanticId
            ? `Entity placed with semanticId '${params.semanticId}'. Use this name in choreography steps and bindings.`
            : undefined,
        }),
      },
    ],
  };
}
