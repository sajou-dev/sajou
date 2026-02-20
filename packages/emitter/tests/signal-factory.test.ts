import { describe, it, expect, beforeEach } from "vitest";
import { createSignal, resetCounter } from "../src/signal-factory.js";

describe("createSignal", () => {
  beforeEach(() => {
    resetCounter();
  });

  it("generates auto-incrementing IDs", () => {
    const s1 = createSignal("task_dispatch", {
      taskId: "t-1",
      from: "orchestrator",
      to: "agent-1",
    });
    const s2 = createSignal("tool_call", {
      toolName: "search",
      agentId: "agent-1",
    });

    expect(s1.id).toBe("sig-0001");
    expect(s2.id).toBe("sig-0002");
  });

  it("sets correct type and payload", () => {
    const signal = createSignal("error", {
      message: "boom",
      severity: "critical",
    });

    expect(signal.type).toBe("error");
    expect(signal.payload.message).toBe("boom");
    expect(signal.payload.severity).toBe("critical");
  });

  it("defaults source to adapter:emitter", () => {
    const signal = createSignal("completion", {
      taskId: "t-1",
      success: true,
    });

    expect(signal.source).toBe("adapter:emitter");
  });

  it("accepts optional envelope fields", () => {
    const signal = createSignal(
      "token_usage",
      { agentId: "a-1", promptTokens: 100, completionTokens: 50 },
      {
        source: "adapter:test",
        correlationId: "corr-1",
        metadata: { debug: true },
      },
    );

    expect(signal.source).toBe("adapter:test");
    expect(signal.correlationId).toBe("corr-1");
    expect(signal.metadata).toEqual({ debug: true });
  });

  it("captures a timestamp close to now", () => {
    const before = Date.now();
    const signal = createSignal("task_dispatch", {
      taskId: "t-1",
      from: "o",
      to: "a",
    });
    const after = Date.now();

    expect(signal.timestamp).toBeGreaterThanOrEqual(before);
    expect(signal.timestamp).toBeLessThanOrEqual(after);
  });

  it("resets counter", () => {
    createSignal("completion", { taskId: "t-1", success: true });
    createSignal("completion", { taskId: "t-2", success: true });
    resetCounter();
    const signal = createSignal("completion", { taskId: "t-3", success: true });

    expect(signal.id).toBe("sig-0001");
  });
});
