import { describe, it, expect } from "vitest";
import { createTapSignal } from "../src/signal/signal-factory.js";

describe("createTapSignal", () => {
  it("generates unique IDs with tap- prefix", () => {
    const a = createTapSignal("tool_call", {
      toolName: "Bash",
      agentId: "claude",
    });
    const b = createTapSignal("tool_call", {
      toolName: "Read",
      agentId: "claude",
    });

    expect(a.id).toMatch(/^tap-[0-9a-f-]{36}$/);
    expect(b.id).toMatch(/^tap-[0-9a-f-]{36}$/);
    expect(a.id).not.toBe(b.id);
  });

  it("sets correct type and payload", () => {
    const signal = createTapSignal("task_dispatch", {
      taskId: "t-1",
      from: "orchestrator",
      to: "agent-solver",
    });

    expect(signal.type).toBe("task_dispatch");
    expect(signal.payload.taskId).toBe("t-1");
    expect(signal.payload.from).toBe("orchestrator");
    expect(signal.payload.to).toBe("agent-solver");
  });

  it("uses adapter:tap as default source", () => {
    const signal = createTapSignal("tool_call", {
      toolName: "Bash",
      agentId: "claude",
    });
    expect(signal.source).toBe("adapter:tap");
  });

  it("allows overriding source", () => {
    const signal = createTapSignal(
      "tool_call",
      { toolName: "Bash", agentId: "claude" },
      { source: "adapter:custom" },
    );
    expect(signal.source).toBe("adapter:custom");
  });

  it("sets timestamp to a recent value", () => {
    const before = Date.now();
    const signal = createTapSignal("error", {
      message: "boom",
      severity: "error",
    });
    const after = Date.now();

    expect(signal.timestamp).toBeGreaterThanOrEqual(before);
    expect(signal.timestamp).toBeLessThanOrEqual(after);
  });

  it("passes correlationId and metadata through", () => {
    const signal = createTapSignal(
      "completion",
      { taskId: "t-1", success: true },
      { correlationId: "session-42", metadata: { debug: true } },
    );
    expect(signal.correlationId).toBe("session-42");
    expect(signal.metadata).toEqual({ debug: true });
  });
});
