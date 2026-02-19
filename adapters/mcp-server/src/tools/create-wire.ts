/**
 * MCP tool: create_wire
 *
 * Creates a wire connection between two zones in the sajou patch bay.
 * Wires define the data flow: signal sources → signal types → choreographies → theme.
 */

import { z } from "zod";
import { addWire } from "../state/mutations.js";

export const name = "create_wire";

export const description =
  "Create a wire connection in the sajou patch bay. " +
  "Wires define data flow through 3 layers: " +
  "(1) signal → signal-type: connects a signal source to a signal channel, " +
  "(2) signal-type → choreographer: triggers a choreography when that signal type arrives, " +
  "(3) choreographer → theme: sends choreography output to the theme renderer. " +
  "Example flow: wire 'local:claude-code' (signal source) → 'tool_call' (signal type) → choreography-id (choreographer). " +
  "This means: when Claude Code emits a tool_call signal, trigger the choreography.";

export const inputSchema = z.object({
  fromZone: z
    .enum(["signal", "signal-type", "choreographer"])
    .describe(
      "Source zone. " +
      "'signal' — a signal source (e.g. 'local:claude-code', a WebSocket source ID). " +
      "'signal-type' — a signal type channel (e.g. 'tool_call', 'agent_state_change'). " +
      "'choreographer' — a choreography node (use its ID).",
    ),
  fromId: z
    .string()
    .describe(
      "ID of the source endpoint. " +
      "For 'signal' zone: the signal source ID (e.g. 'local:claude-code'). " +
      "For 'signal-type' zone: the signal type name (e.g. 'tool_call'). " +
      "For 'choreographer' zone: the choreography ID.",
    ),
  toZone: z
    .enum(["signal-type", "choreographer", "theme", "shader"])
    .describe(
      "Destination zone. " +
      "'signal-type' — route a source to a signal type channel. " +
      "'choreographer' — trigger a choreography from a signal type. " +
      "'theme' — send choreography output to the theme renderer. " +
      "'shader' — connect to a shader uniform (format: '{shaderId}:{uniformName}').",
    ),
  toId: z
    .string()
    .describe(
      "ID of the destination endpoint. " +
      "For 'signal-type' zone: the signal type name. " +
      "For 'choreographer' zone: the choreography ID. " +
      "For 'theme' zone: the theme slot name. " +
      "For 'shader' zone: '{shaderId}:{uniformName}'.",
    ),
});

export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  // Validate zone flow direction
  const validFlows: Record<string, string[]> = {
    signal: ["signal-type"],
    "signal-type": ["choreographer"],
    choreographer: ["theme", "shader"],
  };

  const allowed = validFlows[params.fromZone];
  if (!allowed?.includes(params.toZone)) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            ok: false,
            error: `Invalid wire direction: ${params.fromZone} → ${params.toZone}. ` +
              `Valid flows: signal → signal-type, signal-type → choreographer, choreographer → theme/shader.`,
          }),
        },
      ],
    };
  }

  addWire({
    fromZone: params.fromZone,
    fromId: params.fromId,
    toZone: params.toZone,
    toId: params.toId,
  });

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
