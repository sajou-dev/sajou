/**
 * map_signals tool — convenience wrapper around create_wire for signal→choreography mapping.
 *
 * This is a simpler interface than create_wire for the common case:
 * "when signal X arrives, trigger choreography Y".
 */

import { z } from "zod";
import { createWire } from "../bridge.js";

/** Tool name. */
export const name = "map_signals";

/** Tool description shown to the AI agent. */
export const description =
  "Map a signal type to a choreography — when this signal arrives, that choreography plays. " +
  "This is a convenience shortcut. Under the hood it creates a wire from signal-type → choreographer zone. " +
  "For more complex wiring (e.g. connecting a specific signal source first), use create_wire instead.";

/** Input schema. */
export const inputSchema = z.object({
  signal_type: z
    .string()
    .describe("The signal type to listen for (e.g. 'task_dispatch', 'tool_call', 'error')."),
  choreography_id: z
    .string()
    .describe("The choreography ID to trigger when the signal arrives."),
});

/** Tool handler — creates the wire. */
export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await createWire({
    fromZone: "signal-type",
    fromId: params.signal_type,
    toZone: "choreographer",
    toId: params.choreography_id,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: result.ok,
          wire_id: result.commandId ?? null,
          message: result.ok
            ? `Mapped signal "${params.signal_type}" → choreography "${params.choreography_id}"`
            : result.error ?? "Failed to create wire",
        }),
      },
    ],
  };
}
