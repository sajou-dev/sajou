/**
 * get_choreographies tool — lists registered choreographies.
 *
 * V1: returns a hardcoded list of well-known choreography types.
 * Future: will query the choreographer registry via the bridge.
 */

import { z } from "zod";

/** Tool name. */
export const name = "get_choreographies";

/** Tool description shown to the AI agent. */
export const description =
  "List available choreographies. Returns choreography types with the signal " +
  "they listen to and a description. Use this to discover what animations " +
  "are available before mapping signals.";

/** Input schema — no parameters needed. */
export const inputSchema = z.object({});

/**
 * Hardcoded choreography catalog for V1.
 * These match the well-known signal types from @sajou/schema.
 */
const CHOREOGRAPHIES = [
  {
    id: "task-dispatch",
    on: "task_dispatch",
    description: "Animates task assignment — a messenger travels from sender to receiver.",
  },
  {
    id: "tool-call",
    on: "tool_call",
    description: "Animates an agent invoking a tool — entity performs an action gesture.",
  },
  {
    id: "tool-result",
    on: "tool_result",
    description: "Animates a tool returning results — visual feedback on the calling entity.",
  },
  {
    id: "agent-state-change",
    on: "agent_state_change",
    description: "Animates an agent changing state (idle, thinking, acting, waiting, done, error).",
  },
  {
    id: "error",
    on: "error",
    description: "Animates an error — visual alarm with severity-based intensity.",
  },
  {
    id: "completion",
    on: "completion",
    description: "Animates task completion — celebration or failure feedback.",
  },
];

/** Tool handler — returns the choreography catalog. */
export async function handler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ choreographies: CHOREOGRAPHIES }),
      },
    ],
  };
}
