/**
 * emit_signal tool — sends a signal to the scene-builder via the bridge.
 *
 * This is the primary runtime tool: the agent emits signals and sajou
 * translates them into choreographed animations.
 */

import { z } from "zod";
import { emitSignal } from "../bridge.js";

/** Tool name. */
export const name = "emit_signal";

/** Tool description shown to the AI agent. */
export const description =
  "Emit a signal to the sajou scene. Signals trigger choreographies that animate entities. " +
  "Use well-known types (task_dispatch, tool_call, tool_result, agent_state_change, error, completion) " +
  "or any custom string.";

/** Input schema validated by the MCP SDK via Zod. */
export const inputSchema = z.object({
  type: z
    .string()
    .describe(
      "Signal type. Well-known: task_dispatch, tool_call, tool_result, token_usage, agent_state_change, error, completion, text_delta, thinking. Custom types are also accepted.",
    ),
  from: z
    .string()
    .describe("Entity ID of the signal sender (e.g. 'orchestrator', 'agent-1')."),
  to: z
    .string()
    .optional()
    .describe("Entity ID of the signal receiver, if applicable."),
  payload: z
    .record(z.unknown())
    .optional()
    .describe("Additional payload data for the signal."),
});

/** Tool handler — called when the agent invokes emit_signal. */
export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const payload: Record<string, unknown> = { ...params.payload };
  if (params.from) payload["from"] = params.from;
  if (params.to) payload["to"] = params.to;

  const result = await emitSignal({
    type: params.type,
    source: "mcp",
    payload,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          signal_id: result.id ?? null,
          ok: result.ok,
        }),
      },
    ],
  };
}
