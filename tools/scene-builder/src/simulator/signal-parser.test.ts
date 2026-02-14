/**
 * Tests for signal parsing rules.
 *
 * Covers all input formats the scene-builder can receive:
 *   - HTTP POST normalisation (full envelope, partial, raw JSON)
 *   - WebSocket/SSE message parsing (known types, unknown types, meta, errors)
 *   - OpenAI SSE chunks (text_delta, reasoning, finish, error)
 *   - Anthropic SSE events (all event types)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeHttpPost,
  parseMessage,
  parseOpenAIChunk,
  parseAnthropicEvent,
  resetIdCounter,
  KNOWN_TYPES,
} from "./signal-parser.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetIdCounter();
});

// ---------------------------------------------------------------------------
// HTTP POST normalisation
// ---------------------------------------------------------------------------

describe("normalizeHttpPost", () => {
  it("passes through a full sajou envelope with type", () => {
    const body = {
      type: "tool_call",
      id: "sig-001",
      timestamp: 1700000000000,
      source: "adapter:test",
      payload: { toolName: "read", agentId: "agent-1" },
    };
    const result = normalizeHttpPost(body);
    expect(result["type"]).toBe("tool_call");
    expect(result["id"]).toBe("sig-001");
    expect(result["timestamp"]).toBe(1700000000000);
    expect(result["source"]).toBe("adapter:test");
    expect(result["payload"]).toEqual({ toolName: "read", agentId: "agent-1" });
  });

  it("wraps raw JSON without type as event", () => {
    const body = { action: "read_file", path: "/etc/hosts" };
    const result = normalizeHttpPost(body);
    expect(result["type"]).toBe("event");
    expect(result["payload"]).toEqual(body);
  });

  it("fills missing id with generated value", () => {
    const result = normalizeHttpPost({ type: "error", payload: { message: "oops" } });
    expect(result["id"]).toBeTruthy();
    expect(typeof result["id"]).toBe("string");
  });

  it("fills missing timestamp with current time", () => {
    const before = Date.now();
    const result = normalizeHttpPost({ type: "completion" });
    const after = Date.now();
    expect(result["timestamp"]).toBeGreaterThanOrEqual(before);
    expect(result["timestamp"]).toBeLessThanOrEqual(after);
  });

  it("fills missing source with 'http'", () => {
    const result = normalizeHttpPost({ type: "task_dispatch" });
    expect(result["source"]).toBe("http");
  });

  it("fills missing payload with empty object", () => {
    const result = normalizeHttpPost({ type: "token_usage" });
    expect(result["payload"]).toEqual({});
  });

  it("preserves existing id, timestamp, source, payload", () => {
    const body = {
      type: "tool_result",
      id: "my-id",
      timestamp: 42,
      source: "my-source",
      payload: { success: true },
    };
    const result = normalizeHttpPost(body);
    expect(result["id"]).toBe("my-id");
    expect(result["timestamp"]).toBe(42);
    expect(result["source"]).toBe("my-source");
    expect(result["payload"]).toEqual({ success: true });
  });

  it("handles numeric type field as non-string → wraps as event", () => {
    const body = { type: 42, data: "hello" };
    const result = normalizeHttpPost(body as Record<string, unknown>);
    expect(result["type"]).toBe("event");
    expect(result["payload"]).toEqual(body);
  });

  it("handles empty object → wraps as event with defaults", () => {
    const result = normalizeHttpPost({});
    expect(result["type"]).toBe("event");
    expect(result["id"]).toBeTruthy();
    expect(result["source"]).toBe("http");
    expect(result["payload"]).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// WebSocket / SSE message parsing
// ---------------------------------------------------------------------------

describe("parseMessage", () => {
  describe("known signal types", () => {
    it("parses a full task_dispatch envelope", () => {
      const raw = JSON.stringify({
        id: "sig-001",
        type: "task_dispatch",
        timestamp: 1700000000000,
        source: "orchestrator",
        correlationId: "flow-1",
        payload: { taskId: "t-1", from: "orch", to: "agent-1" },
      });
      const result = parseMessage(raw);
      expect(result.ok).toBe(true);
      if (result.ok && !("meta" in result)) {
        expect(result.signal.type).toBe("task_dispatch");
        expect(result.signal.id).toBe("sig-001");
        expect(result.signal.source).toBe("orchestrator");
        expect(result.signal.correlationId).toBe("flow-1");
        expect(result.signal.payload["taskId"]).toBe("t-1");
      }
    });

    for (const knownType of KNOWN_TYPES) {
      it(`recognises known type: ${knownType}`, () => {
        const raw = JSON.stringify({ type: knownType, payload: { test: true } });
        const result = parseMessage(raw);
        expect(result.ok).toBe(true);
        if (result.ok && !("meta" in result)) {
          expect(result.signal.type).toBe(knownType);
        }
      });
    }

    it("fills missing id, timestamp, source with defaults", () => {
      const raw = JSON.stringify({ type: "error", payload: { message: "oops" } });
      const result = parseMessage(raw);
      expect(result.ok).toBe(true);
      if (result.ok && !("meta" in result)) {
        expect(result.signal.id).toBeTruthy();
        expect(result.signal.timestamp).toBeGreaterThan(0);
        expect(result.signal.source).toBe("unknown");
      }
    });

    it("defaults payload to empty object when missing", () => {
      const raw = JSON.stringify({ type: "completion" });
      const result = parseMessage(raw);
      expect(result.ok).toBe(true);
      if (result.ok && !("meta" in result)) {
        expect(result.signal.payload).toEqual({});
      }
    });
  });

  describe("meta events", () => {
    it("detects meta messages and returns meta result", () => {
      const raw = JSON.stringify({ meta: "heartbeat", status: "alive" });
      const result = parseMessage(raw);
      expect(result.ok).toBe(true);
      if (result.ok && "meta" in result) {
        expect(result.meta).toBe(true);
        expect(result.key).toBe("heartbeat");
      }
    });
  });

  describe("generic event fallback", () => {
    it("wraps unknown type as generic event", () => {
      const raw = JSON.stringify({ type: "my_custom_event", data: "hello" });
      const result = parseMessage(raw);
      expect(result.ok).toBe(true);
      if (result.ok && !("meta" in result)) {
        expect(result.signal.type).toBe("event");
        expect(result.signal.payload["type"]).toBe("my_custom_event");
        expect(result.signal.payload["data"]).toBe("hello");
      }
    });

    it("wraps JSON without type as generic event", () => {
      const raw = JSON.stringify({ action: "read", path: "/etc" });
      const result = parseMessage(raw);
      expect(result.ok).toBe(true);
      if (result.ok && !("meta" in result)) {
        expect(result.signal.type).toBe("event");
        expect(result.signal.payload["action"]).toBe("read");
      }
    });

    it("uses 'ts' field as timestamp fallback", () => {
      const raw = JSON.stringify({ action: "ping", ts: 1700000000000 });
      const result = parseMessage(raw);
      expect(result.ok).toBe(true);
      if (result.ok && !("meta" in result)) {
        expect(result.signal.timestamp).toBe(1700000000000);
      }
    });

    it("uses 'event' field as source fallback", () => {
      const raw = JSON.stringify({ event: "webhook", data: {} });
      const result = parseMessage(raw);
      expect(result.ok).toBe(true);
      if (result.ok && !("meta" in result)) {
        expect(result.signal.source).toBe("webhook");
      }
    });

    it("uses 'runId' as correlationId fallback", () => {
      const raw = JSON.stringify({ runId: "run-42", data: {} });
      const result = parseMessage(raw);
      expect(result.ok).toBe(true);
      if (result.ok && !("meta" in result)) {
        expect(result.signal.correlationId).toBe("run-42");
      }
    });
  });

  describe("error handling", () => {
    it("returns error for invalid JSON", () => {
      const result = parseMessage("not json at all");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("not json at all");
      }
    });

    it("returns error for truncated JSON", () => {
      const result = parseMessage('{"type": "tool_call"');
      expect(result.ok).toBe(false);
    });

    it("returns error for empty string", () => {
      const result = parseMessage("");
      expect(result.ok).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// OpenAI SSE chunk parsing
// ---------------------------------------------------------------------------

describe("parseOpenAIChunk", () => {
  const model = "gpt-4";
  const correlationId = "flow-1";

  it("extracts text_delta from content", () => {
    const chunk = {
      model: "gpt-4-turbo",
      choices: [{ delta: { content: "Hello" }, finish_reason: null }],
    };
    const result = parseOpenAIChunk(chunk, model, correlationId, 0);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.type).toBe("text_delta");
    expect(result.signals[0]!.payload["content"]).toBe("Hello");
    expect(result.signals[0]!.payload["index"]).toBe(0);
    expect(result.tokenCount).toBe(1);
    expect(result.done).toBe(false);
  });

  it("extracts thinking from reasoning_content (GLM/DeepSeek)", () => {
    const chunk = {
      model: "glm-4",
      choices: [{ delta: { reasoning_content: "Let me think..." }, finish_reason: null }],
    };
    const result = parseOpenAIChunk(chunk, model, correlationId, 0);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.type).toBe("thinking");
    expect(result.signals[0]!.payload["content"]).toBe("Let me think...");
    expect(result.tokenCount).toBe(0); // thinking doesn't increment count
  });

  it("emits both thinking and text_delta when both present", () => {
    const chunk = {
      model: "deepseek-v3",
      choices: [{ delta: { content: "Answer", reasoning_content: "Because..." }, finish_reason: null }],
    };
    const result = parseOpenAIChunk(chunk, model, correlationId, 5);
    expect(result.signals).toHaveLength(2);
    expect(result.signals[0]!.type).toBe("thinking");
    expect(result.signals[1]!.type).toBe("text_delta");
    expect(result.signals[1]!.payload["index"]).toBe(5);
    expect(result.tokenCount).toBe(6);
  });

  it("emits completion on finish_reason stop", () => {
    const chunk = {
      model: "gpt-4",
      choices: [{ delta: {}, finish_reason: "stop" }],
    };
    const result = parseOpenAIChunk(chunk, model, correlationId, 10);
    expect(result.done).toBe(true);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.type).toBe("completion");
    expect(result.signals[0]!.payload["result"]).toContain("10 chunks");
  });

  it("emits error on error field", () => {
    const chunk = {
      error: { message: "Rate limited", code: "rate_limit_exceeded" },
    };
    const result = parseOpenAIChunk(chunk, model, correlationId, 0);
    expect(result.done).toBe(true);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.type).toBe("error");
    expect(result.signals[0]!.payload["message"]).toBe("Rate limited");
    expect(result.signals[0]!.payload["code"]).toBe("rate_limit_exceeded");
  });

  it("handles empty choices array", () => {
    const chunk = { choices: [] };
    const result = parseOpenAIChunk(chunk, model, correlationId, 0);
    expect(result.signals).toHaveLength(0);
    expect(result.done).toBe(false);
  });

  it("handles missing choices", () => {
    const chunk = { id: "chatcmpl-1" };
    const result = parseOpenAIChunk(chunk, model, correlationId, 0);
    expect(result.signals).toHaveLength(0);
    expect(result.done).toBe(false);
  });

  it("handles chunk with empty delta (heartbeat)", () => {
    const chunk = {
      choices: [{ delta: {}, finish_reason: null }],
    };
    const result = parseOpenAIChunk(chunk, model, correlationId, 5);
    expect(result.signals).toHaveLength(0);
    expect(result.tokenCount).toBe(5);
  });

  it("uses chunk.model over provided model", () => {
    const chunk = {
      model: "gpt-4-0613",
      choices: [{ delta: { content: "Hi" }, finish_reason: null }],
    };
    const result = parseOpenAIChunk(chunk, "fallback-model", correlationId, 0);
    expect(result.signals[0]!.payload["agentId"]).toBe("gpt-4-0613");
  });

  it("accumulates token count across calls", () => {
    const chunk1 = { choices: [{ delta: { content: "A" }, finish_reason: null }] };
    const r1 = parseOpenAIChunk(chunk1, model, correlationId, 0);
    expect(r1.tokenCount).toBe(1);

    const chunk2 = { choices: [{ delta: { content: "B" }, finish_reason: null }] };
    const r2 = parseOpenAIChunk(chunk2, model, correlationId, r1.tokenCount);
    expect(r2.tokenCount).toBe(2);
    expect(r2.signals[0]!.payload["index"]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Anthropic SSE event parsing
// ---------------------------------------------------------------------------

describe("parseAnthropicEvent", () => {
  const model = "claude-sonnet-4-5-20250929";
  const correlationId = "flow-1";

  it("message_start → agent_state_change", () => {
    const data = { message: { model: "claude-sonnet-4-5-20250929", role: "assistant" } };
    const result = parseAnthropicEvent("message_start", data, model, correlationId);
    expect(result).not.toBeNull();
    if (result && "signal" in result) {
      expect(result.signal.type).toBe("agent_state_change");
      expect(result.signal.payload["from"]).toBe("idle");
      expect(result.signal.payload["to"]).toBe("acting");
    }
  });

  it("content_block_start with tool_use → tool_call", () => {
    const data = {
      content_block: { type: "tool_use", id: "toolu_01", name: "read_file" },
    };
    const result = parseAnthropicEvent("content_block_start", data, model, correlationId);
    expect(result).not.toBeNull();
    if (result && "signal" in result) {
      expect(result.signal.type).toBe("tool_call");
      expect(result.signal.payload["toolName"]).toBe("read_file");
      expect(result.signal.payload["callId"]).toBe("toolu_01");
    }
  });

  it("content_block_start with text → skip", () => {
    const data = { content_block: { type: "text", text: "" } };
    const result = parseAnthropicEvent("content_block_start", data, model, correlationId);
    expect(result).not.toBeNull();
    if (result) {
      expect("skip" in result).toBe(true);
    }
  });

  it("content_block_delta with text_delta → text_delta signal", () => {
    const data = { delta: { type: "text_delta", text: "Hello world" } };
    const result = parseAnthropicEvent("content_block_delta", data, model, correlationId);
    expect(result).not.toBeNull();
    if (result && "signal" in result) {
      expect(result.signal.type).toBe("text_delta");
      expect(result.signal.payload["content"]).toBe("Hello world");
      expect(result.signal.payload["agentId"]).toBe(model);
    }
  });

  it("content_block_delta with thinking_delta → thinking signal", () => {
    const data = { delta: { type: "thinking_delta", thinking: "Let me analyze..." } };
    const result = parseAnthropicEvent("content_block_delta", data, model, correlationId);
    expect(result).not.toBeNull();
    if (result && "signal" in result) {
      expect(result.signal.type).toBe("thinking");
      expect(result.signal.payload["content"]).toBe("Let me analyze...");
    }
  });

  it("content_block_delta with input_json_delta → skip", () => {
    const data = { delta: { type: "input_json_delta", partial_json: '{"key":' } };
    const result = parseAnthropicEvent("content_block_delta", data, model, correlationId);
    expect(result).not.toBeNull();
    if (result) {
      expect("skip" in result).toBe(true);
    }
  });

  it("content_block_delta without delta → skip", () => {
    const data = {};
    const result = parseAnthropicEvent("content_block_delta", data, model, correlationId);
    expect(result).not.toBeNull();
    if (result) {
      expect("skip" in result).toBe(true);
    }
  });

  it("message_delta with usage → token_usage", () => {
    const data = {
      usage: { input_tokens: 1200, output_tokens: 450 },
    };
    const result = parseAnthropicEvent("message_delta", data, model, correlationId);
    expect(result).not.toBeNull();
    if (result && "signal" in result) {
      expect(result.signal.type).toBe("token_usage");
      expect(result.signal.payload["promptTokens"]).toBe(1200);
      expect(result.signal.payload["completionTokens"]).toBe(450);
      expect(result.signal.payload["model"]).toBe(model);
    }
  });

  it("message_delta without usage → skip", () => {
    const data = { delta: { stop_reason: "end_turn" } };
    const result = parseAnthropicEvent("message_delta", data, model, correlationId);
    expect(result).not.toBeNull();
    if (result) {
      expect("skip" in result).toBe(true);
    }
  });

  it("message_stop → completion", () => {
    const result = parseAnthropicEvent("message_stop", {}, model, correlationId);
    expect(result).not.toBeNull();
    if (result && "signal" in result) {
      expect(result.signal.type).toBe("completion");
      expect(result.signal.payload["success"]).toBe(true);
    }
  });

  it("error → error signal", () => {
    const data = {
      error: { type: "overloaded_error", message: "Overloaded" },
    };
    const result = parseAnthropicEvent("error", data, model, correlationId);
    expect(result).not.toBeNull();
    if (result && "signal" in result) {
      expect(result.signal.type).toBe("error");
      expect(result.signal.payload["message"]).toBe("Overloaded");
      expect(result.signal.payload["code"]).toBe("overloaded_error");
    }
  });

  it("unknown event type → null", () => {
    const result = parseAnthropicEvent("ping", {}, model, correlationId);
    expect(result).toBeNull();
  });

  it("content_block_stop → null (not handled)", () => {
    const result = parseAnthropicEvent("content_block_stop", {}, model, correlationId);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cross-format consistency
// ---------------------------------------------------------------------------

describe("cross-format consistency", () => {
  it("all parsed signals have required fields", () => {
    const sources = [
      // HTTP POST
      normalizeHttpPost({ type: "tool_call", payload: { toolName: "test" } }),
      // Message parse
      (() => {
        const r = parseMessage(JSON.stringify({ type: "completion", payload: {} }));
        return r.ok && !("meta" in r) ? r.signal : null;
      })(),
      // OpenAI chunk
      (() => {
        const r = parseOpenAIChunk(
          { choices: [{ delta: { content: "hi" }, finish_reason: null }] },
          "gpt-4", "c-1", 0,
        );
        return r.signals[0] ?? null;
      })(),
      // Anthropic event
      (() => {
        const r = parseAnthropicEvent("message_stop", {}, "claude", "c-1");
        return r && "signal" in r ? r.signal : null;
      })(),
    ];

    for (const signal of sources) {
      if (!signal) continue;
      expect(signal).toHaveProperty("type");
      expect(typeof (signal as Record<string, unknown>)["type"]).toBe("string");
      expect(signal).toHaveProperty("id");
      expect(signal).toHaveProperty("source");
    }
  });

  it("KNOWN_TYPES contains all 9 well-known types", () => {
    const expected = [
      "task_dispatch", "tool_call", "tool_result", "token_usage",
      "agent_state_change", "error", "completion", "text_delta", "thinking",
    ];
    for (const t of expected) {
      expect(KNOWN_TYPES.has(t)).toBe(true);
    }
    expect(KNOWN_TYPES.size).toBe(9);
  });
});
