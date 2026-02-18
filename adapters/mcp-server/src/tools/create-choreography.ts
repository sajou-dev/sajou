/**
 * MCP tool: create_choreography
 *
 * Creates a choreography definition with steps in the scene-builder.
 * A choreography is a sequence of animation actions that execute when
 * a matching signal arrives.
 */

import { z } from "zod";
import { createChoreography } from "../bridge.js";

export const name = "create_choreography";

export const description =
  "Create a choreography — a sequence of animation steps triggered by a signal. " +
  "Choreographies are the core of sajou's animation system. When a signal of the matching type " +
  "arrives, the choreography's steps execute in order, animating entities on the scene. " +
  "After creating a choreography, wire it to a signal type using create_wire (signal-type → choreographer). " +
  "Example: a 'tool_call' signal triggers a choreography that moves an agent entity to a workstation, " +
  "plays a working animation, then flashes a result indicator.";

const stepSchema = z.object({
  action: z
    .enum(["move", "fly", "flash", "spawn", "destroy", "wait", "playSound", "setAnimation", "parallel", "onArrive", "onInterrupt"])
    .describe(
      "The animation action to perform. " +
      "'move' — animate entity along a path to target position. " +
      "'fly' — instant arc movement to target. " +
      "'flash' — brief visual highlight on the entity. " +
      "'spawn' — create a new entity instance at a position. " +
      "'destroy' — remove an entity from the scene. " +
      "'wait' — pause the sequence for a duration. " +
      "'playSound' — trigger an audio cue. " +
      "'setAnimation' — change the entity's animation state (e.g. 'idle' → 'walk'). " +
      "'parallel' — run child steps simultaneously. " +
      "'onArrive' — execute child steps when entity reaches destination. " +
      "'onInterrupt' — execute child steps if choreography is interrupted.",
    ),
  entity: z
    .string()
    .optional()
    .describe(
      "Target entity semanticId (e.g. 'agent-1', 'door-kitchen'). " +
      "Can use signal references like 'signal.payload.from' to dynamically resolve. " +
      "If omitted, uses the choreography's defaultTargetEntityId.",
    ),
  target: z
    .string()
    .optional()
    .describe("Target position or waypoint name for movement actions (e.g. 'workstation-1', 'patrol-route')."),
  delay: z
    .number()
    .optional()
    .describe("Delay in milliseconds before this step starts."),
  duration: z
    .number()
    .optional()
    .describe("Duration in milliseconds for timed actions (move, wait)."),
  easing: z
    .string()
    .optional()
    .describe("Easing function: 'linear', 'easeIn', 'easeOut', 'easeInOut', 'arc'."),
  params: z
    .record(z.unknown())
    .optional()
    .describe(
      "Additional parameters specific to the action type. " +
      "For 'flash': { color: '#ff0', intensity: 0.8 }. " +
      "For 'setAnimation': { state: 'walk' }. " +
      "For 'spawn': { entityId: 'arrow', x: 100, y: 200 }. " +
      "For 'playSound': { sound: 'click' }.",
    ),
});

export const inputSchema = z.object({
  on: z
    .string()
    .describe(
      "Signal type that triggers this choreography (e.g. 'tool_call', 'agent_state_change', 'task_dispatch'). " +
      "This is the default trigger — the actual wiring is done via create_wire.",
    ),
  steps: z
    .array(stepSchema)
    .min(1)
    .describe("Ordered list of animation steps to execute when triggered."),
  defaultTargetEntityId: z
    .string()
    .optional()
    .describe(
      "Default entity semanticId for steps that don't specify their own entity. " +
      "Useful when most steps target the same actor.",
    ),
  when: z
    .record(z.unknown())
    .optional()
    .describe(
      "Optional payload filter — choreography only triggers when signal payload matches. " +
      "Example: { field: 'toolName', operator: 'eq', value: 'Read' } triggers only for Read tool calls.",
    ),
  interrupts: z
    .boolean()
    .optional()
    .describe("If true, this choreography can interrupt a running one on the same entity. Default: false."),
});

export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await createChoreography({
    on: params.on,
    steps: params.steps.map((s) => ({
      action: s.action,
      entity: s.entity,
      target: s.target,
      delay: s.delay,
      duration: s.duration,
      easing: s.easing,
      params: s.params ?? {},
    })),
    defaultTargetEntityId: params.defaultTargetEntityId,
    when: params.when,
    interrupts: params.interrupts ?? false,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: result.ok,
          choreographyId: result.choreographyId,
          error: result.error ?? null,
          hint: result.ok
            ? `Choreography created. Wire it to a signal type with create_wire: { fromZone: 'signal-type', fromId: '${params.on}', toZone: 'choreographer', toId: '${result.choreographyId}' }`
            : undefined,
        }),
      },
    ],
  };
}
