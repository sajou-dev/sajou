/**
 * MCP tool: create_binding
 *
 * Creates an entity binding — connects a choreography's output to an entity property.
 * Bindings are the Level 2 dynamic wiring: they define how choreography results
 * affect visual properties on placed entities.
 */

import { z } from "zod";
import { createBinding } from "../bridge.js";

export const name = "create_binding";

export const description =
  "Create a binding between a choreography and an entity property. " +
  "Bindings connect choreography outputs to entity visual properties (position, rotation, opacity, animation state, etc.). " +
  "Example: bind a 'tool_call' choreography's output to agent-1's 'animation.state' property, " +
  "so when the choreography runs, the agent switches to a 'working' animation. " +
  "The binding specifies which choreography provides the data, which entity receives it, and which property is controlled.";

export const inputSchema = z.object({
  targetEntityId: z
    .string()
    .describe(
      "The semanticId of the target entity (e.g. 'agent-1', 'door-kitchen'). " +
      "This must match a placed entity's semanticId in the scene.",
    ),
  property: z
    .string()
    .describe(
      "The entity property to bind to. Available properties: " +
      "'position' (point2D), 'position.x'/'position.y' (float), " +
      "'rotation' (float, degrees), 'scale'/'scale.x'/'scale.y' (float), " +
      "'opacity' (float, 0-1), 'visible' (bool), 'tint' (color), " +
      "'animation.state' (enum — switches animation), 'animation.speed' (float), " +
      "'zIndex' (int), " +
      "'moveTo:waypoint' (event — move entity to a waypoint), " +
      "'followRoute' (event — entity follows a route), " +
      "'teleportTo' (event — instant move).",
    ),
  sourceChoreographyId: z
    .string()
    .describe("The ID of the choreography that provides the data for this binding."),
  sourceType: z
    .enum(["float", "point2D", "bool", "enum", "event", "color", "int"])
    .optional()
    .describe(
      "The type of data the choreography outputs. Defaults to 'event'. " +
      "Must be compatible with the target property's accepted types.",
    ),
  sourceField: z
    .string()
    .optional()
    .describe(
      "Specific field to extract from the signal payload (e.g. 'velocity', 'value'). " +
      "If omitted, auto-detected from context.",
    ),
  mapping: z
    .record(z.unknown())
    .optional()
    .describe(
      "Optional value mapping function. Example: { fn: 'linear', inputRange: [0, 100], outputRange: [0, 1] }.",
    ),
  action: z
    .record(z.unknown())
    .optional()
    .describe(
      "Optional action config for event→action bindings. " +
      "Example for moveTo: { waypoint: 'workstation-1', animationDuring: 'walk', animationOnArrival: 'idle', duration: 1000 }.",
    ),
  transition: z
    .record(z.unknown())
    .optional()
    .describe(
      "Optional transition config for smooth property changes. " +
      "Example: { targetValue: 0.5, durationMs: 300, easing: 'easeOut' }.",
    ),
});

export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await createBinding({
    targetEntityId: params.targetEntityId,
    property: params.property,
    sourceChoreographyId: params.sourceChoreographyId,
    sourceType: params.sourceType ?? "event",
    sourceField: params.sourceField,
    mapping: params.mapping,
    action: params.action,
    transition: params.transition,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: result.ok,
          commandId: result.commandId ?? null,
          error: result.error ?? null,
        }),
      },
    ],
  };
}
