/**
 * map_signals tool — signal-to-choreography wiring.
 *
 * Wiring in sajou is managed visually in the scene-builder's pipeline view
 * (drag-to-connect between signal types and choreography nodes). Programmatic
 * wiring via MCP is not yet supported — it requires a dedicated endpoint
 * that can mutate the wiring store from the server side.
 *
 * This tool honestly reports that limitation and directs the agent to use
 * the scene-builder UI for wiring, while providing the current wiring state
 * for reference.
 */

import { z } from "zod";
import { getWiring, getChoreographies, ping } from "../bridge.js";

/** Tool name. */
export const name = "map_signals";

/** Tool description shown to the AI agent. */
export const description =
  "View signal-to-choreography wiring. " +
  "NOTE: Programmatic wiring creation is not yet supported via MCP. " +
  "Wiring is managed visually in the scene-builder pipeline view. " +
  "This tool returns the current wiring state for reference.";

/** Input schema. */
export const inputSchema = z.object({
  signal_type: z
    .string()
    .optional()
    .describe("Optional: filter wiring for a specific signal type."),
});

/** Tool handler — returns current wiring state honestly. */
export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const [wires, choreographies] = await Promise.all([
    getWiring(),
    getChoreographies(),
  ]);

  if (wires === null || choreographies === null) {
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
            note: "Programmatic wiring creation is not yet supported. Use the scene-builder pipeline view to create wires by dragging between nodes.",
          }),
        },
      ],
    };
  }

  // Filter if signal_type was provided
  let relevantChoreographies = [...choreographies];
  if (params.signal_type) {
    relevantChoreographies = choreographies.filter(
      (c) =>
        c.on === params.signal_type ||
        c.wiredSignalTypes.includes(params.signal_type!),
    );
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: true,
          note: "Programmatic wiring creation is not yet supported via MCP. Use the scene-builder pipeline view to create or modify wires.",
          wires,
          choreographies: relevantChoreographies,
          wireCount: wires.length,
        }),
      },
    ],
  };
}
