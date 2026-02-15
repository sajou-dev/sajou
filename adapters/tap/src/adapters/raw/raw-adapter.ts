/**
 * Raw stdout adapter — uses regex heuristics to infer signal types from
 * unstructured text output.
 *
 * Pattern matching:
 *   - Error:|Exception:|FAILED → signal `error`
 *   - Calling tool:|Using:   → signal `tool_call`
 *   - Result:|Output:        → signal `tool_result`
 *   - Everything else        → signal `text_delta`
 */

import { createTapSignal } from "../../signal/signal-factory.js";
import type { TapAdapter } from "../types.js";
import type { TapTransport } from "../../client/transport.js";

/** Heuristic patterns for inferring signal types from raw output. */
const PATTERNS: ReadonlyArray<{
  regex: RegExp;
  type: "error" | "tool_call" | "tool_result";
}> = [
  { regex: /Error:|Exception:|FAILED/i, type: "error" },
  { regex: /Calling tool:|Using:/i, type: "tool_call" },
  { regex: /Result:|Output:/i, type: "tool_result" },
];

/** Options for the raw adapter. */
export interface RawAdapterOptions {
  /** Custom source identifier. */
  source?: string;
  /** Correlation ID to tag signals with. */
  correlationId?: string;
}

/** Raw stdout adapter — implements TapAdapter. */
export class RawAdapter implements TapAdapter {
  readonly name = "raw";
  readonly source: string;

  private transport: TapTransport | null = null;
  private readonly correlationId: string | undefined;

  constructor(options?: RawAdapterOptions) {
    this.source = options?.source ?? "adapter:tap:raw";
    this.correlationId = options?.correlationId;
  }

  async start(transport: TapTransport): Promise<void> {
    this.transport = transport;
  }

  async stop(): Promise<void> {
    this.transport = null;
  }

  /**
   * Processes a single stdout line using regex heuristics.
   *
   * @param line - A line from the child process stdout
   */
  processLine(line: string): void {
    if (!this.transport) return;

    const trimmed = line.trim();
    if (trimmed.length === 0) return;

    const matched = PATTERNS.find((p) => p.regex.test(trimmed));

    if (matched) {
      if (matched.type === "error") {
        const signal = createTapSignal(
          "error",
          {
            message: trimmed,
            severity: "error",
            agentId: "unknown",
          },
          { source: this.source, correlationId: this.correlationId },
        );
        this.transport.send(signal).catch(() => {});
      } else if (matched.type === "tool_call") {
        const signal = createTapSignal(
          "tool_call",
          {
            toolName: extractToolName(trimmed),
            agentId: "unknown",
          },
          { source: this.source, correlationId: this.correlationId },
        );
        this.transport.send(signal).catch(() => {});
      } else {
        const signal = createTapSignal(
          "tool_result",
          {
            toolName: "unknown",
            agentId: "unknown",
            success: true,
            output: { raw: trimmed },
          },
          { source: this.source, correlationId: this.correlationId },
        );
        this.transport.send(signal).catch(() => {});
      }
    } else {
      // Fallback: text_delta
      const signal = createTapSignal(
        "text_delta",
        {
          agentId: "unknown",
          content: trimmed,
        },
        { source: this.source, correlationId: this.correlationId },
      );
      this.transport.send(signal).catch(() => {});
    }
  }
}

/** Extracts a tool name from a line like "Calling tool: Bash" or "Using: grep". */
function extractToolName(line: string): string {
  const match = /(?:Calling tool:|Using:)\s*(\S+)/i.exec(line);
  return match?.[1] ?? "unknown";
}
