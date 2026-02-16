/**
 * Pure signal parsing functions — extract, normalise, validate.
 *
 * These are the parsing rules used by the scene-builder to handle signals
 * from all input sources: HTTP POST, WebSocket, SSE, OpenAI, Anthropic.
 *
 * Extracted as pure functions for unit testing and reuse.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A parsed signal ready for dispatch. */
export interface ParsedSignal {
  id: string;
  type: string;
  timestamp: number;
  source: string;
  correlationId?: string;
  payload: Record<string, unknown>;
}

/** Result of parsing an incoming message. */
export type ParseResult =
  | { ok: true; signal: ParsedSignal }
  | { ok: true; meta: true; key: string; data: Record<string, unknown> }
  | { ok: false; error: string };

/** Result of parsing an OpenAI SSE chunk. */
export interface OpenAIChunkResult {
  signals: ParsedSignal[];
  done: boolean;
  tokenCount: number;
}

/** Result of parsing an Anthropic SSE event. */
export type AnthropicEventResult =
  | { signal: ParsedSignal }
  | { skip: true }
  | null;

/** Result of parsing an OpenClaw event. */
export type OpenClawEventResult = ParsedSignal | null;

// ---------------------------------------------------------------------------
// Known signal types
// ---------------------------------------------------------------------------

export const KNOWN_TYPES = new Set<string>([
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

// ---------------------------------------------------------------------------
// HTTP POST normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a JSON body received via HTTP POST into a signal envelope.
 *
 * Rules:
 * - If body has a string `type` field → use as envelope
 * - Else → wrap as `{ type: "event", payload: body }`
 * - Fill defaults: `id`, `timestamp`, `source`, `payload`
 */
export function normalizeHttpPost(body: Record<string, unknown>): Record<string, unknown> {
  let envelope: Record<string, unknown>;
  if (typeof body["type"] === "string") {
    envelope = { ...body };
  } else {
    envelope = { type: "event", payload: body };
  }

  if (!envelope["id"]) {
    envelope["id"] = generateId();
  }
  if (!envelope["timestamp"]) {
    envelope["timestamp"] = Date.now();
  }
  if (!envelope["source"]) {
    envelope["source"] = "http";
  }
  if (!envelope["payload"]) {
    envelope["payload"] = {};
  }

  return envelope;
}

// ---------------------------------------------------------------------------
// WebSocket / SSE message parsing
// ---------------------------------------------------------------------------

/**
 * Parse a raw JSON string into a signal.
 *
 * Rules:
 * 1. Parse JSON
 * 2. If `type` is a known signal type → extract as typed signal
 * 3. If has `meta` field → return meta event (skip dispatch)
 * 4. Else → wrap as generic `event` type with full JSON as payload
 * 5. On JSON parse error → return error signal with raw text
 */
export function parseMessage(raw: string): ParseResult {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const type = parsed["type"] as string | undefined;

    if (type && KNOWN_TYPES.has(type)) {
      return {
        ok: true,
        signal: {
          id: String(parsed["id"] ?? generateId()),
          type,
          timestamp: Number(parsed["timestamp"] ?? Date.now()),
          source: String(parsed["source"] ?? "unknown"),
          correlationId: parsed["correlationId"] as string | undefined,
          payload: (parsed["payload"] as Record<string, unknown>) ?? {},
        },
      };
    }

    if (parsed["meta"]) {
      return {
        ok: true,
        meta: true,
        key: String(parsed["meta"]),
        data: parsed,
      };
    }

    // Generic event — preserve full JSON as payload
    return {
      ok: true,
      signal: {
        id: String(parsed["id"] ?? generateId()),
        type: "event",
        timestamp: Number(parsed["timestamp"] ?? parsed["ts"] ?? Date.now()),
        source: String(parsed["source"] ?? parsed["event"] ?? "unknown"),
        correlationId: (parsed["correlationId"] as string | undefined)
          ?? (parsed["runId"] as string | undefined),
        payload: parsed,
      },
    };
  } catch {
    return { ok: false, error: raw };
  }
}

// ---------------------------------------------------------------------------
// OpenAI SSE chunk parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single OpenAI streaming chunk (from `data:` line).
 *
 * Returns the signals to emit and whether the stream is done.
 *
 * OpenAI format:
 * - `choices[0].delta.content` → `text_delta` signal
 * - `choices[0].delta.reasoning_content` → `thinking` signal (GLM/DeepSeek)
 * - `choices[0].finish_reason === "stop"` → `completion` signal
 * - `error` field → `error` signal
 */
export function parseOpenAIChunk(
  chunk: Record<string, unknown>,
  model: string,
  correlationId: string,
  tokenCount: number,
): OpenAIChunkResult {
  const signals: ParsedSignal[] = [];
  let done = false;
  let count = tokenCount;

  // Check for error
  if (chunk["error"]) {
    const err = chunk["error"] as Record<string, unknown>;
    signals.push({
      id: generateId(),
      type: "error",
      timestamp: Date.now(),
      source: model,
      correlationId,
      payload: {
        agentId: model,
        message: String(err["message"] ?? "Unknown OpenAI error"),
        code: String(err["code"] ?? "OPENAI_ERROR"),
        severity: "error",
      },
    });
    return { signals, done: true, tokenCount: count };
  }

  const choices = chunk["choices"] as Array<Record<string, unknown>> | undefined;
  if (!choices || choices.length === 0) {
    return { signals, done, tokenCount: count };
  }

  const choice = choices[0] as Record<string, unknown>;
  const delta = choice["delta"] as Record<string, unknown> | undefined;
  const finishReason = choice["finish_reason"] as string | null | undefined;

  if (delta) {
    const content = delta["content"] as string | undefined;
    const reasoning = delta["reasoning_content"] as string | undefined;

    if (reasoning) {
      signals.push({
        id: generateId(),
        type: "thinking",
        timestamp: Date.now(),
        source: model,
        correlationId,
        payload: {
          agentId: String(chunk["model"] ?? model),
          content: reasoning,
        },
      });
    }

    if (content) {
      count++;
      signals.push({
        id: generateId(),
        type: "text_delta",
        timestamp: Date.now(),
        source: model,
        correlationId,
        payload: {
          agentId: String(chunk["model"] ?? model),
          content,
          index: count - 1,
        },
      });
    }
  }

  if (finishReason === "stop") {
    done = true;
    signals.push({
      id: generateId(),
      type: "completion",
      timestamp: Date.now(),
      source: model,
      correlationId,
      payload: {
        agentId: String(chunk["model"] ?? model),
        success: true,
        result: `Stream completed (${count} chunks)`,
      },
    });
  }

  return { signals, done, tokenCount: count };
}

// ---------------------------------------------------------------------------
// Anthropic SSE event parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single Anthropic SSE event.
 *
 * Anthropic event types:
 * - `message_start` → `agent_state_change` (idle → acting)
 * - `content_block_start` + `type === "tool_use"` → `tool_call`
 * - `content_block_delta` + `delta.type === "text_delta"` → `text_delta`
 * - `content_block_delta` + `delta.type === "thinking_delta"` → `thinking`
 * - `message_delta` with `usage` → `token_usage`
 * - `message_stop` → `completion`
 * - `error` → `error`
 */
export function parseAnthropicEvent(
  eventType: string,
  data: Record<string, unknown>,
  model: string,
  correlationId: string,
): AnthropicEventResult {
  switch (eventType) {
    case "message_start": {
      const msg = data["message"] as Record<string, unknown> | undefined;
      const msgModel = msg ? String(msg["model"] ?? model) : model;
      return {
        signal: {
          id: generateId(),
          type: "agent_state_change",
          timestamp: Date.now(),
          source: msgModel,
          correlationId,
          payload: {
            agentId: msgModel,
            from: "idle",
            to: "acting",
            reason: "message started",
          },
        },
      };
    }

    case "content_block_start": {
      const block = data["content_block"] as Record<string, unknown> | undefined;
      if (block && block["type"] === "tool_use") {
        return {
          signal: {
            id: generateId(),
            type: "tool_call",
            timestamp: Date.now(),
            source: model,
            correlationId,
            payload: {
              toolName: String(block["name"] ?? "unknown"),
              agentId: model,
              callId: String(block["id"] ?? generateId()),
            },
          },
        };
      }
      return { skip: true };
    }

    case "content_block_delta": {
      const delta = data["delta"] as Record<string, unknown> | undefined;
      if (!delta) return { skip: true };

      if (delta["type"] === "text_delta") {
        return {
          signal: {
            id: generateId(),
            type: "text_delta",
            timestamp: Date.now(),
            source: model,
            correlationId,
            payload: {
              agentId: model,
              content: String(delta["text"] ?? ""),
            },
          },
        };
      }

      if (delta["type"] === "thinking_delta") {
        return {
          signal: {
            id: generateId(),
            type: "thinking",
            timestamp: Date.now(),
            source: model,
            correlationId,
            payload: {
              agentId: model,
              content: String(delta["thinking"] ?? ""),
            },
          },
        };
      }

      return { skip: true };
    }

    case "message_delta": {
      const usage = data["usage"] as Record<string, unknown> | undefined;
      if (usage) {
        return {
          signal: {
            id: generateId(),
            type: "token_usage",
            timestamp: Date.now(),
            source: model,
            correlationId,
            payload: {
              agentId: model,
              promptTokens: Number(usage["input_tokens"] ?? 0),
              completionTokens: Number(usage["output_tokens"] ?? 0),
              model,
            },
          },
        };
      }
      return { skip: true };
    }

    case "message_stop":
      return {
        signal: {
          id: generateId(),
          type: "completion",
          timestamp: Date.now(),
          source: model,
          correlationId,
          payload: {
            agentId: model,
            success: true,
            result: "Anthropic stream completed",
          },
        },
      };

    case "error": {
      const err = data["error"] as Record<string, unknown> | undefined;
      return {
        signal: {
          id: generateId(),
          type: "error",
          timestamp: Date.now(),
          source: model,
          correlationId,
          payload: {
            agentId: model,
            message: err ? String(err["message"] ?? "Anthropic error") : "Anthropic error",
            code: err ? String(err["type"] ?? "ANTHROPIC_ERROR") : "ANTHROPIC_ERROR",
            severity: "error",
          },
        },
      };
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// OpenClaw event parsing
// ---------------------------------------------------------------------------

/**
 * Parse a single OpenClaw WebSocket event into a sajou signal.
 *
 * OpenClaw events have the shape:
 * ```
 * { type: "event", event: "<category>", payload: { stream: "<stream>", data: {...} } }
 * ```
 *
 * Internal events (challenge, presence, pong, keepalive pings) return `null`.
 *
 * Heartbeat and cron events are emitted as generic `event` signals with
 * `_meta.heartbeat` or `_meta.cron` flags for UI filtering.
 */
export function parseOpenClawEvent(
  event: Record<string, unknown>,
): OpenClawEventResult {
  const type = event["type"] as string | undefined;
  const eventCategory = event["event"] as string | undefined;
  const payload = (event["payload"] as Record<string, unknown>) ?? {};
  const stream = payload["stream"] as string | undefined;
  const data = (payload["data"] as Record<string, unknown>) ?? {};

  // --- Internal events: skip silently ---
  if (type === "connect.challenge" || eventCategory === "connect.challenge") return null;
  if (type === "res" || type === "pong") return null;
  if (eventCategory === "system-presence") return null;
  if (type === "ping") return null;

  // Extract channel metadata from payload
  const channel = (payload["provider"] ?? data["provider"] ?? "") as string;
  const channelLabel = (payload["label"] ?? data["label"] ?? "") as string;
  const sessionKey = (payload["sessionKey"] ?? data["sessionKey"] ?? "") as string;
  const agentId = (data["agentId"] ?? "openclaw") as string;

  // --- Heartbeat events ---
  if (eventCategory === "heartbeat" || type === "heartbeat") {
    return {
      id: generateId(),
      type: "event",
      timestamp: Date.now(),
      source: "openclaw",
      payload: {
        ...data,
        _meta: { heartbeat: true },
      },
    };
  }

  // --- Cron events ---
  if (eventCategory === "cron" || type === "cron") {
    return {
      id: generateId(),
      type: "event",
      timestamp: Date.now(),
      source: "openclaw",
      payload: {
        ...data,
        _meta: { cron: true, cronJobId: data["cronJobId"] ?? data["jobId"] },
      },
    };
  }

  // --- exec.approval.requested → agent_state_change (acting → waiting) ---
  if (type === "exec.approval.requested" || eventCategory === "exec.approval.requested") {
    return {
      id: generateId(),
      type: "agent_state_change",
      timestamp: Date.now(),
      source: "openclaw",
      payload: {
        agentId,
        from: "acting",
        to: "waiting",
        reason: "approval",
        channel,
        channelLabel,
        sessionKey,
      },
    };
  }

  // --- Agent events ---
  if (eventCategory === "agent") {
    return parseOpenClawAgentEvent(stream, data, agentId, channel, channelLabel, sessionKey);
  }

  // --- Session events (token usage) ---
  if (eventCategory === "session") {
    const promptTokens = data["promptTokens"] ?? data["input_tokens"] ?? 0;
    const completionTokens = data["completionTokens"] ?? data["output_tokens"] ?? 0;
    const model = (data["model"] ?? "unknown") as string;
    if (typeof promptTokens === "number" || typeof completionTokens === "number") {
      return {
        id: generateId(),
        type: "token_usage",
        timestamp: Date.now(),
        source: "openclaw",
        payload: {
          agentId,
          promptTokens: Number(promptTokens),
          completionTokens: Number(completionTokens),
          model,
          channel,
          sessionKey,
        },
      };
    }
  }

  // --- Fallback: generic event ---
  if (type === "event" || eventCategory) {
    return {
      id: generateId(),
      type: "event",
      timestamp: Date.now(),
      source: "openclaw",
      payload: { ...payload, eventCategory },
    };
  }

  return null;
}

/**
 * Parse an OpenClaw `event:"agent"` sub-event by stream type.
 */
function parseOpenClawAgentEvent(
  stream: string | undefined,
  data: Record<string, unknown>,
  agentId: string,
  channel: string,
  channelLabel: string,
  sessionKey: string,
): OpenClawEventResult {
  const phase = (data["phase"] ?? data["status"] ?? "") as string;

  switch (stream) {
    case "lifecycle": {
      if (phase === "start" || phase === "started") {
        return {
          id: generateId(),
          type: "agent_state_change",
          timestamp: Date.now(),
          source: "openclaw",
          payload: {
            agentId,
            from: "idle",
            to: "acting",
            channel,
            channelLabel,
            sessionKey,
          },
        };
      }
      if (phase === "end" || phase === "completed" || phase === "done") {
        return {
          id: generateId(),
          type: "completion",
          timestamp: Date.now(),
          source: "openclaw",
          payload: {
            agentId,
            success: true,
            channel,
            channelLabel,
            sessionKey,
          },
        };
      }
      if (phase === "error" || phase === "failed") {
        return {
          id: generateId(),
          type: "error",
          timestamp: Date.now(),
          source: "openclaw",
          payload: {
            agentId,
            message: String(data["message"] ?? data["error"] ?? "Agent error"),
            severity: "error",
            channel,
            channelLabel,
            sessionKey,
          },
        };
      }
      return null;
    }

    case "tool": {
      if (phase === "start" || phase === "started") {
        return {
          id: generateId(),
          type: "tool_call",
          timestamp: Date.now(),
          source: "openclaw",
          payload: {
            toolName: String(data["toolName"] ?? data["tool"] ?? "unknown"),
            agentId,
            callId: String(data["callId"] ?? data["id"] ?? generateId()),
            channel,
            sessionKey,
          },
        };
      }
      if (phase === "end" || phase === "completed" || phase === "done") {
        return {
          id: generateId(),
          type: "tool_result",
          timestamp: Date.now(),
          source: "openclaw",
          payload: {
            toolName: String(data["toolName"] ?? data["tool"] ?? "unknown"),
            agentId,
            success: data["success"] !== false,
            output: data["output"] ?? data["result"],
            channel,
            sessionKey,
          },
        };
      }
      return null;
    }

    case "assistant": {
      // Prefer `delta` (incremental chunk) over `text` (accumulated full text)
      const textContent = data["delta"] ?? data["content"] ?? data["text"] ?? "";
      if (!textContent) return null; // Skip empty deltas
      return {
        id: generateId(),
        type: "text_delta",
        timestamp: Date.now(),
        source: "openclaw",
        payload: {
          agentId,
          content: String(textContent),
          channel,
          channelLabel,
          sessionKey,
        },
      };
    }

    case "thinking": {
      const thinkContent = data["delta"] ?? data["content"] ?? data["text"] ?? "";
      if (!thinkContent) return null;
      return {
        id: generateId(),
        type: "thinking",
        timestamp: Date.now(),
        source: "openclaw",
        payload: {
          agentId,
          content: String(thinkContent),
        },
      };
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let counter = 0;

/** Generate a short unique ID. Deterministic in tests when reset. */
export function generateId(): string {
  counter++;
  return `parse-${counter.toString(36).padStart(4, "0")}`;
}

/** Reset ID counter (for deterministic tests). */
export function resetIdCounter(): void {
  counter = 0;
}
