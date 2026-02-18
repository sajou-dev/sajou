/**
 * map_signals tool — creates a wiring between a signal type and a choreography.
 *
 * When a signal of the given type is emitted, the mapped choreography
 * will be triggered in the scene.
 */

import { z } from "zod";
import { mapSignal } from "../bridge.js";

/** Tool name. */
export const name = "map_signals";

/** Tool description shown to the AI agent. */
export const description =
  "Map a signal type to a choreography. When a signal of this type is emitted, " +
  "the specified choreography will play. Use get_choreographies to see available " +
  "choreographies first.";

/** Input schema. */
export const inputSchema = z.object({
  signal_type: z
    .string()
    .describe("The signal type to map (e.g. 'task_dispatch', 'error')."),
  choreography_id: z
    .string()
    .describe("The choreography ID to trigger (e.g. 'task-dispatch', 'error')."),
});

/** Tool handler — sends the mapping to the bridge. */
export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await mapSignal(params.signal_type, params.choreography_id);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ok: result.ok }),
      },
    ],
  };
}
