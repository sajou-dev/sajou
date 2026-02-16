/**
 * Tests for OpenClaw event parsing.
 *
 * Covers all OpenClaw event→signal mappings:
 *   - Agent lifecycle (start, end, error)
 *   - Agent tool (start, end)
 *   - Agent assistant (text_delta)
 *   - Agent thinking
 *   - Session (token_usage)
 *   - exec.approval.requested
 *   - Heartbeat and cron tagging
 *   - Channel metadata extraction
 *   - Internal events (challenge, presence, pong) ignored
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  parseOpenClawEvent,
  resetIdCounter,
} from "./signal-parser.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetIdCounter();
});

// ---------------------------------------------------------------------------
// Helper: build an OpenClaw event
// ---------------------------------------------------------------------------

function agentEvent(
  stream: string,
  data: Record<string, unknown>,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: "event",
    event: "agent",
    payload: { stream, data, ...extra },
  };
}

// ---------------------------------------------------------------------------
// Agent lifecycle events
// ---------------------------------------------------------------------------

describe("parseOpenClawEvent — agent lifecycle", () => {
  it("lifecycle start → agent_state_change (idle → acting)", () => {
    const event = agentEvent("lifecycle", {
      phase: "start",
      agentId: "agent-1",
    }, { provider: "telegram", label: "Chat #42", sessionKey: "tg:42" });

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("agent_state_change");
    expect(signal!.source).toBe("openclaw");
    expect(signal!.payload["from"]).toBe("idle");
    expect(signal!.payload["to"]).toBe("acting");
    expect(signal!.payload["channel"]).toBe("telegram");
    expect(signal!.payload["channelLabel"]).toBe("Chat #42");
    expect(signal!.payload["sessionKey"]).toBe("tg:42");
  });

  it("lifecycle started (alternative phase) → agent_state_change", () => {
    const signal = parseOpenClawEvent(agentEvent("lifecycle", { phase: "started" }));
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("agent_state_change");
    expect(signal!.payload["to"]).toBe("acting");
  });

  it("lifecycle end → completion", () => {
    const event = agentEvent("lifecycle", {
      phase: "end",
      agentId: "agent-1",
    }, { provider: "whatsapp", sessionKey: "wa:1" });

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("completion");
    expect(signal!.payload["success"]).toBe(true);
    expect(signal!.payload["channel"]).toBe("whatsapp");
    expect(signal!.payload["sessionKey"]).toBe("wa:1");
  });

  it("lifecycle completed (alternative phase) → completion", () => {
    const signal = parseOpenClawEvent(agentEvent("lifecycle", { phase: "completed" }));
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("completion");
  });

  it("lifecycle done (alternative phase) → completion", () => {
    const signal = parseOpenClawEvent(agentEvent("lifecycle", { phase: "done" }));
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("completion");
  });

  it("lifecycle error → error signal", () => {
    const event = agentEvent("lifecycle", {
      phase: "error",
      message: "LLM timeout",
      agentId: "agent-1",
    }, { provider: "slack", sessionKey: "sl:1" });

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("error");
    expect(signal!.payload["message"]).toBe("LLM timeout");
    expect(signal!.payload["severity"]).toBe("error");
    expect(signal!.payload["channel"]).toBe("slack");
  });

  it("lifecycle failed (alternative phase) → error signal", () => {
    const signal = parseOpenClawEvent(agentEvent("lifecycle", { phase: "failed", error: "crash" }));
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("error");
    expect(signal!.payload["message"]).toBe("crash");
  });

  it("lifecycle unknown phase → null", () => {
    const signal = parseOpenClawEvent(agentEvent("lifecycle", { phase: "paused" }));
    expect(signal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Agent tool events
// ---------------------------------------------------------------------------

describe("parseOpenClawEvent — agent tool", () => {
  it("tool start → tool_call", () => {
    const event = agentEvent("tool", {
      phase: "start",
      toolName: "read_file",
      agentId: "agent-1",
      callId: "call-001",
    }, { provider: "discord", sessionKey: "dc:1" });

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("tool_call");
    expect(signal!.payload["toolName"]).toBe("read_file");
    expect(signal!.payload["callId"]).toBe("call-001");
    expect(signal!.payload["channel"]).toBe("discord");
  });

  it("tool start uses 'tool' field as fallback for toolName", () => {
    const signal = parseOpenClawEvent(agentEvent("tool", { phase: "start", tool: "write_file" }));
    expect(signal).not.toBeNull();
    expect(signal!.payload["toolName"]).toBe("write_file");
  });

  it("tool end → tool_result", () => {
    const event = agentEvent("tool", {
      phase: "end",
      toolName: "read_file",
      success: true,
      output: "file contents here",
    }, { provider: "telegram" });

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("tool_result");
    expect(signal!.payload["toolName"]).toBe("read_file");
    expect(signal!.payload["success"]).toBe(true);
    expect(signal!.payload["output"]).toBe("file contents here");
  });

  it("tool end with failure", () => {
    const signal = parseOpenClawEvent(agentEvent("tool", {
      phase: "end",
      toolName: "exec",
      success: false,
      output: "permission denied",
    }));
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("tool_result");
    expect(signal!.payload["success"]).toBe(false);
  });

  it("tool unknown phase → null", () => {
    const signal = parseOpenClawEvent(agentEvent("tool", { phase: "running" }));
    expect(signal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Agent assistant (text_delta)
// ---------------------------------------------------------------------------

describe("parseOpenClawEvent — agent assistant", () => {
  it("assistant stream prefers delta (incremental) over text (accumulated)", () => {
    const event = agentEvent("assistant", {
      delta: " world",
      text: "Hello world",
      agentId: "agent-1",
    }, { provider: "imessage", label: "John's chat", sessionKey: "im:1" });

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("text_delta");
    expect(signal!.payload["content"]).toBe(" world");
    expect(signal!.payload["agentId"]).toBe("agent-1");
    expect(signal!.payload["channel"]).toBe("imessage");
    expect(signal!.payload["channelLabel"]).toBe("John's chat");
  });

  it("assistant stream falls back to content when no delta", () => {
    const signal = parseOpenClawEvent(agentEvent("assistant", { content: "Hello" }));
    expect(signal).not.toBeNull();
    expect(signal!.payload["content"]).toBe("Hello");
  });

  it("assistant stream falls back to text when no delta or content", () => {
    const signal = parseOpenClawEvent(agentEvent("assistant", { text: "fallback text" }));
    expect(signal).not.toBeNull();
    expect(signal!.payload["content"]).toBe("fallback text");
  });

  it("assistant stream with empty delta → null (skip)", () => {
    const signal = parseOpenClawEvent(agentEvent("assistant", { delta: "", text: "full" }));
    expect(signal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Agent thinking
// ---------------------------------------------------------------------------

describe("parseOpenClawEvent — agent thinking", () => {
  it("thinking stream prefers delta over content", () => {
    const event = agentEvent("thinking", {
      delta: "step 2...",
      content: "step 1... step 2...",
      agentId: "agent-1",
    });

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("thinking");
    expect(signal!.payload["content"]).toBe("step 2...");
    expect(signal!.payload["agentId"]).toBe("agent-1");
  });

  it("thinking stream falls back to content when no delta", () => {
    const signal = parseOpenClawEvent(agentEvent("thinking", { content: "Let me analyze..." }));
    expect(signal).not.toBeNull();
    expect(signal!.payload["content"]).toBe("Let me analyze...");
  });
});

// ---------------------------------------------------------------------------
// Session events (token usage)
// ---------------------------------------------------------------------------

describe("parseOpenClawEvent — session", () => {
  it("session with token data → token_usage", () => {
    const event: Record<string, unknown> = {
      type: "event",
      event: "session",
      payload: {
        data: {
          promptTokens: 1200,
          completionTokens: 450,
          model: "claude-sonnet-4-5-20250929",
          agentId: "agent-1",
        },
        sessionKey: "tg:42",
        provider: "telegram",
      },
    };

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("token_usage");
    expect(signal!.payload["promptTokens"]).toBe(1200);
    expect(signal!.payload["completionTokens"]).toBe(450);
    expect(signal!.payload["model"]).toBe("claude-sonnet-4-5-20250929");
    expect(signal!.payload["channel"]).toBe("telegram");
  });

  it("session with input_tokens/output_tokens (alt names)", () => {
    const event: Record<string, unknown> = {
      type: "event",
      event: "session",
      payload: {
        data: {
          input_tokens: 800,
          output_tokens: 200,
          model: "gpt-4",
        },
      },
    };

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("token_usage");
    expect(signal!.payload["promptTokens"]).toBe(800);
    expect(signal!.payload["completionTokens"]).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Approval requested
// ---------------------------------------------------------------------------

describe("parseOpenClawEvent — exec.approval.requested", () => {
  it("exec.approval.requested type → agent_state_change (acting → waiting)", () => {
    const event: Record<string, unknown> = {
      type: "exec.approval.requested",
      payload: {
        data: { agentId: "agent-1" },
        provider: "signal",
        sessionKey: "sig:1",
      },
    };

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("agent_state_change");
    expect(signal!.payload["from"]).toBe("acting");
    expect(signal!.payload["to"]).toBe("waiting");
    expect(signal!.payload["reason"]).toBe("approval");
    expect(signal!.payload["channel"]).toBe("signal");
  });

  it("exec.approval.requested as event category", () => {
    const event: Record<string, unknown> = {
      type: "event",
      event: "exec.approval.requested",
      payload: { data: {} },
    };

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("agent_state_change");
    expect(signal!.payload["to"]).toBe("waiting");
  });
});

// ---------------------------------------------------------------------------
// Heartbeat events
// ---------------------------------------------------------------------------

describe("parseOpenClawEvent — heartbeat", () => {
  it("heartbeat event category → event with _meta.heartbeat", () => {
    const event: Record<string, unknown> = {
      type: "event",
      event: "heartbeat",
      payload: { data: { uptime: 3600 } },
    };

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("event");
    expect(signal!.source).toBe("openclaw");
    const meta = signal!.payload["_meta"] as Record<string, unknown>;
    expect(meta["heartbeat"]).toBe(true);
    expect(signal!.payload["uptime"]).toBe(3600);
  });

  it("heartbeat type → event with _meta.heartbeat", () => {
    const event: Record<string, unknown> = {
      type: "heartbeat",
      payload: { data: { status: "alive" } },
    };

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("event");
    const meta = signal!.payload["_meta"] as Record<string, unknown>;
    expect(meta["heartbeat"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cron events
// ---------------------------------------------------------------------------

describe("parseOpenClawEvent — cron", () => {
  it("cron event category → event with _meta.cron", () => {
    const event: Record<string, unknown> = {
      type: "event",
      event: "cron",
      payload: { data: { cronJobId: "job-42", task: "cleanup" } },
    };

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("event");
    const meta = signal!.payload["_meta"] as Record<string, unknown>;
    expect(meta["cron"]).toBe(true);
    expect(meta["cronJobId"]).toBe("job-42");
  });

  it("cron type → event with _meta.cron", () => {
    const event: Record<string, unknown> = {
      type: "cron",
      payload: { data: { jobId: "job-99" } },
    };

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    const meta = signal!.payload["_meta"] as Record<string, unknown>;
    expect(meta["cron"]).toBe(true);
    expect(meta["cronJobId"]).toBe("job-99");
  });
});

// ---------------------------------------------------------------------------
// Internal / ignored events
// ---------------------------------------------------------------------------

describe("parseOpenClawEvent — ignored events", () => {
  it("connect.challenge (bare type) → null", () => {
    const event: Record<string, unknown> = {
      type: "connect.challenge",
      nonce: "abc123",
      ts: Date.now(),
    };
    expect(parseOpenClawEvent(event)).toBeNull();
  });

  it("connect.challenge (envelope form) → null", () => {
    const event: Record<string, unknown> = {
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "5a45edc0", ts: 1771230192304 },
    };
    expect(parseOpenClawEvent(event)).toBeNull();
  });

  it("res (response) → null", () => {
    const event: Record<string, unknown> = {
      type: "res",
      id: "req-1",
      ok: true,
    };
    expect(parseOpenClawEvent(event)).toBeNull();
  });

  it("pong → null", () => {
    const event: Record<string, unknown> = { type: "pong" };
    expect(parseOpenClawEvent(event)).toBeNull();
  });

  it("system-presence → null", () => {
    const event: Record<string, unknown> = {
      type: "event",
      event: "system-presence",
      payload: { data: {} },
    };
    expect(parseOpenClawEvent(event)).toBeNull();
  });

  it("ping → null", () => {
    const event: Record<string, unknown> = { type: "ping" };
    expect(parseOpenClawEvent(event)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Channel metadata extraction
// ---------------------------------------------------------------------------

describe("parseOpenClawEvent — channel metadata", () => {
  it("extracts channel from payload.provider", () => {
    const event = agentEvent("assistant", { content: "Hi" }, { provider: "matrix" });
    const signal = parseOpenClawEvent(event);
    expect(signal!.payload["channel"]).toBe("matrix");
  });

  it("extracts channel from data.provider as fallback", () => {
    const event = agentEvent("assistant", { content: "Hi", provider: "telegram" });
    const signal = parseOpenClawEvent(event);
    expect(signal!.payload["channel"]).toBe("telegram");
  });

  it("extracts channelLabel from payload.label", () => {
    const event = agentEvent("assistant", { content: "Hi" }, {
      provider: "whatsapp",
      label: "Family Group",
    });
    const signal = parseOpenClawEvent(event);
    expect(signal!.payload["channelLabel"]).toBe("Family Group");
  });

  it("extracts sessionKey from payload.sessionKey", () => {
    const event = agentEvent("assistant", { content: "Hi" }, { sessionKey: "wa:123:456" });
    const signal = parseOpenClawEvent(event);
    expect(signal!.payload["sessionKey"]).toBe("wa:123:456");
  });

  it("defaults channel/label/sessionKey to empty string when missing", () => {
    const event = agentEvent("assistant", { content: "Hi" });
    const signal = parseOpenClawEvent(event);
    expect(signal!.payload["channel"]).toBe("");
    expect(signal!.payload["channelLabel"]).toBe("");
    expect(signal!.payload["sessionKey"]).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Unknown agent streams
// ---------------------------------------------------------------------------

describe("parseOpenClawEvent — unknown streams", () => {
  it("unknown agent stream → null", () => {
    const event = agentEvent("metrics", { cpu: 0.8 });
    const signal = parseOpenClawEvent(event);
    expect(signal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Generic fallback
// ---------------------------------------------------------------------------

describe("parseOpenClawEvent — generic fallback", () => {
  it("unknown event category → generic event signal", () => {
    const event: Record<string, unknown> = {
      type: "event",
      event: "custom.notification",
      payload: { data: { message: "Hello" }, extra: true },
    };

    const signal = parseOpenClawEvent(event);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("event");
    expect(signal!.payload["eventCategory"]).toBe("custom.notification");
  });

  it("bare object without type or event → null", () => {
    const event: Record<string, unknown> = { data: "orphan" };
    const signal = parseOpenClawEvent(event);
    expect(signal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Signal field consistency
// ---------------------------------------------------------------------------

describe("parseOpenClawEvent — signal fields", () => {
  it("all emitted signals have required fields", () => {
    const events = [
      agentEvent("lifecycle", { phase: "start" }),
      agentEvent("lifecycle", { phase: "end" }),
      agentEvent("lifecycle", { phase: "error", message: "fail" }),
      agentEvent("tool", { phase: "start", toolName: "read" }),
      agentEvent("tool", { phase: "end", toolName: "read" }),
      agentEvent("assistant", { content: "Hi" }),
      agentEvent("thinking", { content: "Hmm" }),
      { type: "event", event: "heartbeat", payload: { data: {} } },
      { type: "event", event: "cron", payload: { data: { cronJobId: "j1" } } },
      { type: "exec.approval.requested", payload: { data: {} } },
    ];

    for (const event of events) {
      const signal = parseOpenClawEvent(event as Record<string, unknown>);
      expect(signal).not.toBeNull();
      expect(signal!.id).toBeTruthy();
      expect(typeof signal!.type).toBe("string");
      expect(signal!.source).toBe("openclaw");
      expect(signal!.timestamp).toBeGreaterThan(0);
      expect(typeof signal!.payload).toBe("object");
    }
  });
});
