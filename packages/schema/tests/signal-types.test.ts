import { describe, it, expect } from "vitest";
import type {
  SignalEvent,
  SignalEnvelope,
  SignalType,
  WellKnownSignalType,
  TaskDispatchPayload,
  ToolCallPayload,
  ToolResultPayload,
  TokenUsagePayload,
  AgentStateChangePayload,
  ErrorPayload,
  CompletionPayload,
  TextDeltaPayload,
  ThinkingPayload,
} from "../src/signal-types.js";

describe("Signal types", () => {
  it("creates a valid task_dispatch signal", () => {
    const signal: SignalEnvelope<"task_dispatch"> = {
      id: "sig-001",
      type: "task_dispatch",
      timestamp: Date.now(),
      source: "adapter:test",
      payload: {
        taskId: "t-42",
        from: "orchestrator",
        to: "agent-solver",
        description: "Solve the equation",
      },
    };

    expect(signal.type).toBe("task_dispatch");
    expect(signal.payload.taskId).toBe("t-42");
    expect(signal.payload.from).toBe("orchestrator");
    expect(signal.payload.to).toBe("agent-solver");
  });

  it("creates a valid tool_call signal", () => {
    const signal: SignalEnvelope<"tool_call"> = {
      id: "sig-002",
      type: "tool_call",
      timestamp: Date.now(),
      source: "adapter:test",
      payload: {
        toolName: "web_search",
        agentId: "agent-1",
        callId: "call-001",
        input: { query: "Sajou meaning" },
      },
    };

    expect(signal.type).toBe("tool_call");
    expect(signal.payload.toolName).toBe("web_search");
  });

  it("creates a valid tool_result signal", () => {
    const signal: SignalEnvelope<"tool_result"> = {
      id: "sig-003",
      type: "tool_result",
      timestamp: Date.now(),
      source: "adapter:test",
      payload: {
        toolName: "web_search",
        agentId: "agent-1",
        callId: "call-001",
        success: true,
        output: { results: ["Sajou is a capuchin monkey"] },
      },
    };

    expect(signal.payload.success).toBe(true);
  });

  it("creates a valid token_usage signal", () => {
    const signal: SignalEnvelope<"token_usage"> = {
      id: "sig-004",
      type: "token_usage",
      timestamp: Date.now(),
      source: "adapter:test",
      payload: {
        agentId: "agent-1",
        promptTokens: 1200,
        completionTokens: 350,
        model: "claude-opus-4-6",
        cost: 0.042,
      },
    };

    expect(signal.payload.promptTokens).toBe(1200);
    expect(signal.payload.completionTokens).toBe(350);
  });

  it("creates a valid agent_state_change signal", () => {
    const signal: SignalEnvelope<"agent_state_change"> = {
      id: "sig-005",
      type: "agent_state_change",
      timestamp: Date.now(),
      source: "adapter:test",
      payload: {
        agentId: "agent-1",
        from: "idle",
        to: "thinking",
        reason: "received task",
      },
    };

    expect(signal.payload.from).toBe("idle");
    expect(signal.payload.to).toBe("thinking");
  });

  it("creates a valid error signal", () => {
    const signal: SignalEnvelope<"error"> = {
      id: "sig-006",
      type: "error",
      timestamp: Date.now(),
      source: "adapter:test",
      payload: {
        agentId: "agent-1",
        code: "TOOL_TIMEOUT",
        message: "Tool web_search timed out after 30s",
        severity: "error",
      },
    };

    expect(signal.payload.severity).toBe("error");
  });

  it("creates a valid completion signal", () => {
    const signal: SignalEnvelope<"completion"> = {
      id: "sig-007",
      type: "completion",
      timestamp: Date.now(),
      source: "adapter:test",
      payload: {
        taskId: "t-42",
        agentId: "agent-1",
        success: true,
        result: "Equation solved: x = 7",
      },
    };

    expect(signal.payload.success).toBe(true);
    expect(signal.payload.taskId).toBe("t-42");
  });

  it("supports correlationId and metadata in envelope", () => {
    const signal: SignalEnvelope<"task_dispatch"> = {
      id: "sig-010",
      type: "task_dispatch",
      timestamp: Date.now(),
      source: "adapter:openclaw",
      correlationId: "workflow-99",
      metadata: { raw: { openclawEventId: "oc-abc" } },
      payload: {
        taskId: "t-100",
        from: "orchestrator",
        to: "agent-2",
      },
    };

    expect(signal.correlationId).toBe("workflow-99");
    expect(signal.metadata).toBeDefined();
  });

  it("narrows payload type via discriminated union", () => {
    const signal: SignalEvent = {
      id: "sig-020",
      type: "error",
      timestamp: Date.now(),
      source: "adapter:test",
      payload: {
        message: "something broke",
        severity: "critical",
      },
    };

    // Type narrowing via switch
    switch (signal.type) {
      case "error":
        // TypeScript knows payload is ErrorPayload here
        expect(signal.payload.severity).toBe("critical");
        expect(signal.payload.message).toBe("something broke");
        break;
      default:
        // Should not reach here
        expect.unreachable("unexpected signal type");
    }
  });
});

describe("New signal types (text_delta, thinking)", () => {
  it("creates a valid text_delta signal", () => {
    const signal: SignalEnvelope<"text_delta"> = {
      id: "sig-100",
      type: "text_delta",
      timestamp: Date.now(),
      source: "adapter:anthropic",
      payload: {
        agentId: "claude",
        content: "Hello, world!",
        contentType: "text",
        index: 0,
      },
    };

    expect(signal.type).toBe("text_delta");
    expect(signal.payload.agentId).toBe("claude");
    expect(signal.payload.content).toBe("Hello, world!");
    expect(signal.payload.contentType).toBe("text");
    expect(signal.payload.index).toBe(0);
  });

  it("creates a valid thinking signal", () => {
    const signal: SignalEnvelope<"thinking"> = {
      id: "sig-101",
      type: "thinking",
      timestamp: Date.now(),
      source: "adapter:anthropic",
      payload: {
        agentId: "claude",
        content: "Let me reason about this problem...",
      },
    };

    expect(signal.type).toBe("thinking");
    expect(signal.payload.agentId).toBe("claude");
    expect(signal.payload.content).toBe("Let me reason about this problem...");
  });

  it("narrows text_delta in discriminated union", () => {
    const signal: SignalEvent = {
      id: "sig-102",
      type: "text_delta",
      timestamp: Date.now(),
      source: "adapter:test",
      payload: {
        agentId: "agent-1",
        content: "chunk",
      },
    };

    switch (signal.type) {
      case "text_delta":
        expect(signal.payload.content).toBe("chunk");
        break;
      default:
        expect.unreachable("unexpected signal type");
    }
  });
});

describe("Open protocol (custom signal types)", () => {
  it("accepts a custom signal type as SignalType", () => {
    // The (string & {}) trick allows any string while preserving autocomplete
    const customType: SignalType = "my_custom_event";
    expect(customType).toBe("my_custom_event");
  });

  it("creates an envelope with a custom type and generic payload", () => {
    const signal: SignalEnvelope<"my_custom_event"> = {
      id: "sig-200",
      type: "my_custom_event",
      timestamp: Date.now(),
      source: "adapter:custom",
      payload: {
        foo: "bar",
        count: 42,
      },
    };

    expect(signal.type).toBe("my_custom_event");
    expect(signal.payload["foo"]).toBe("bar");
    expect(signal.payload["count"]).toBe(42);
  });

  it("allows unparameterized SignalEnvelope with string payload", () => {
    const signal: SignalEnvelope = {
      id: "sig-201",
      type: "anything_goes",
      timestamp: Date.now(),
      source: "adapter:external",
      payload: { data: [1, 2, 3] },
    };

    expect(signal.type).toBe("anything_goes");
  });

  it("preserves type safety for well-known types", () => {
    // Well-known types still get proper payload typing
    const signal: SignalEnvelope<"tool_call"> = {
      id: "sig-202",
      type: "tool_call",
      timestamp: Date.now(),
      source: "adapter:test",
      payload: {
        toolName: "read_file",
        agentId: "agent-1",
      },
    };

    // TypeScript enforces the payload shape — this is a compile-time check
    expect(signal.payload.toolName).toBe("read_file");
    expect(signal.payload.agentId).toBe("agent-1");
  });
});

// Suppress unused import warnings — these are compile-time-only checks
void (0 as unknown as TaskDispatchPayload);
void (0 as unknown as ToolCallPayload);
void (0 as unknown as ToolResultPayload);
void (0 as unknown as TokenUsagePayload);
void (0 as unknown as AgentStateChangePayload);
void (0 as unknown as ErrorPayload);
void (0 as unknown as CompletionPayload);
void (0 as unknown as TextDeltaPayload);
void (0 as unknown as ThinkingPayload);
void (0 as unknown as WellKnownSignalType);
