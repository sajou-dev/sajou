/**
 * JSON Lines adapter — parses structured JSON from stdout, line by line.
 *
 * If a line parses as JSON and has a recognized `type` field, it's mapped
 * directly to a SignalEnvelope. Otherwise it's wrapped as a `text_delta`.
 * Non-JSON lines are silently ignored.
 */

import { randomUUID } from "node:crypto";
import type { TapAdapter } from "../types.js";
import type { TapTransport } from "../../client/transport.js";
import type { SignalEnvelope } from "@sajou/schema";

/** Well-known signal types for quick lookup. */
const KNOWN_TYPES: ReadonlySet<string> = new Set<string>([
  "task_dispatch",
  "tool_call",
  "tool_result",
  "token_usage",
  "agent_state_change",
  "error",
  "completion",
  "text_delta",
  "thinking",
]);

/** Options for the JSON Lines adapter. */
export interface JsonlAdapterOptions {
  /** Custom source identifier. */
  source?: string;
  /** Correlation ID to tag signals with. */
  correlationId?: string;
}

/** JSON Lines adapter — implements TapAdapter. */
export class JsonlAdapter implements TapAdapter {
  readonly name = "jsonl";
  readonly source: string;

  private transport: TapTransport | null = null;
  private readonly correlationId: string | undefined;

  constructor(options?: JsonlAdapterOptions) {
    this.source = options?.source ?? "adapter:tap:jsonl";
    this.correlationId = options?.correlationId;
  }

  async start(transport: TapTransport): Promise<void> {
    this.transport = transport;
  }

  async stop(): Promise<void> {
    this.transport = null;
  }

  /**
   * Processes a single stdout line.
   *
   * @param line - A line from the child process stdout
   */
  processLine(line: string): void {
    if (!this.transport) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // Not JSON — ignore
      return;
    }

    const type = typeof parsed["type"] === "string" ? parsed["type"] : undefined;

    if (type && KNOWN_TYPES.has(type)) {
      // Known signal type — build envelope directly from parsed JSON
      const { type: _t, ...rest } = parsed;
      const signal: SignalEnvelope = {
        id: `tap-${randomUUID()}`,
        type,
        timestamp: Date.now(),
        source: this.source,
        correlationId: this.correlationId,
        payload: rest,
      };
      this.transport.send(signal).catch(() => {});
    } else {
      // Unknown type — wrap as text_delta
      const signal: SignalEnvelope<"text_delta"> = {
        id: `tap-${randomUUID()}`,
        type: "text_delta",
        timestamp: Date.now(),
        source: this.source,
        correlationId: this.correlationId,
        metadata: { originalType: type ?? "unknown", raw: parsed },
        payload: {
          agentId: typeof parsed["agentId"] === "string" ? parsed["agentId"] : "unknown",
          content: JSON.stringify(parsed),
        },
      };
      this.transport.send(signal).catch(() => {});
    }
  }
}
