import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTapMiddleware } from "../src/adapters/agent-sdk/sdk-middleware.js";
import type { TapTransport } from "../src/client/transport.js";
import type { SignalEnvelope } from "@sajou/schema";

function createMockTransport(): TapTransport & {
  sent: SignalEnvelope[];
} {
  const sent: SignalEnvelope[] = [];
  return {
    sent,
    connected: true,
    connect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockImplementation(async (signal: SignalEnvelope) => {
      sent.push(signal);
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe("TapMiddleware", () => {
  let transport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    transport = createMockTransport();
  });

  it("onToolCall produces a tool_call signal", async () => {
    const tap = await createTapMiddleware({ transport });
    tap.onToolCall("Bash", { command: "ls" }, "c-1");

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.type).toBe("tool_call");
    const payload = transport.sent[0]!.payload as {
      toolName: string;
      callId: string;
      input: Record<string, unknown>;
    };
    expect(payload.toolName).toBe("Bash");
    expect(payload.callId).toBe("c-1");
    expect(payload.input).toEqual({ command: "ls" });

    await tap.close();
  });

  it("onToolResult produces a tool_result signal", async () => {
    const tap = await createTapMiddleware({ transport });
    tap.onToolResult("Bash", true, { output: "files" }, "c-1");

    expect(transport.sent[0]!.type).toBe("tool_result");
    const payload = transport.sent[0]!.payload as {
      toolName: string;
      success: boolean;
    };
    expect(payload.toolName).toBe("Bash");
    expect(payload.success).toBe(true);

    await tap.close();
  });

  it("onTaskDispatch produces a task_dispatch signal", async () => {
    const tap = await createTapMiddleware({ transport });
    tap.onTaskDispatch("t-1", "orchestrator", "agent-a");

    expect(transport.sent[0]!.type).toBe("task_dispatch");
    const payload = transport.sent[0]!.payload as {
      taskId: string;
      from: string;
      to: string;
    };
    expect(payload.taskId).toBe("t-1");
    expect(payload.from).toBe("orchestrator");
    expect(payload.to).toBe("agent-a");

    await tap.close();
  });

  it("onStateChange produces an agent_state_change signal", async () => {
    const tap = await createTapMiddleware({ transport });
    tap.onStateChange("agent-1", "idle", "thinking");

    expect(transport.sent[0]!.type).toBe("agent_state_change");
    const payload = transport.sent[0]!.payload as {
      agentId: string;
      from: string;
      to: string;
    };
    expect(payload.agentId).toBe("agent-1");
    expect(payload.from).toBe("idle");
    expect(payload.to).toBe("thinking");

    await tap.close();
  });

  it("onError produces an error signal", async () => {
    const tap = await createTapMiddleware({ transport });
    tap.onError("Something broke", "critical", "ERR_001");

    expect(transport.sent[0]!.type).toBe("error");
    const payload = transport.sent[0]!.payload as {
      message: string;
      severity: string;
      code: string;
    };
    expect(payload.message).toBe("Something broke");
    expect(payload.severity).toBe("critical");
    expect(payload.code).toBe("ERR_001");

    await tap.close();
  });

  it("onError defaults severity to error", async () => {
    const tap = await createTapMiddleware({ transport });
    tap.onError("boom");

    const payload = transport.sent[0]!.payload as { severity: string };
    expect(payload.severity).toBe("error");

    await tap.close();
  });

  it("onCompletion produces a completion signal", async () => {
    const tap = await createTapMiddleware({ transport });
    tap.onCompletion("t-1", true, "All done");

    expect(transport.sent[0]!.type).toBe("completion");
    const payload = transport.sent[0]!.payload as {
      taskId: string;
      success: boolean;
      result: string;
    };
    expect(payload.taskId).toBe("t-1");
    expect(payload.success).toBe(true);
    expect(payload.result).toBe("All done");

    await tap.close();
  });

  it("onTextDelta produces a text_delta signal", async () => {
    const tap = await createTapMiddleware({ transport });
    tap.onTextDelta("agent-1", "Hello ");

    expect(transport.sent[0]!.type).toBe("text_delta");
    const payload = transport.sent[0]!.payload as {
      agentId: string;
      content: string;
    };
    expect(payload.agentId).toBe("agent-1");
    expect(payload.content).toBe("Hello ");

    await tap.close();
  });

  it("emit sends a raw signal envelope", async () => {
    const tap = await createTapMiddleware({ transport });
    const signal: SignalEnvelope = {
      id: "custom-1",
      type: "thinking",
      timestamp: Date.now(),
      source: "test",
      payload: { agentId: "a", content: "hmm" },
    };
    tap.emit(signal);

    expect(transport.sent[0]!.id).toBe("custom-1");
    expect(transport.sent[0]!.type).toBe("thinking");

    await tap.close();
  });

  it("uses custom source and correlationId", async () => {
    const tap = await createTapMiddleware({
      transport,
      source: "my-agent",
      correlationId: "sess-42",
    });
    tap.onToolCall("test");

    expect(transport.sent[0]!.source).toBe("my-agent");
    expect(transport.sent[0]!.correlationId).toBe("sess-42");

    await tap.close();
  });

  it("close() closes the transport", async () => {
    const tap = await createTapMiddleware({ transport });
    await tap.close();
    expect(transport.close).toHaveBeenCalled();
  });
});
