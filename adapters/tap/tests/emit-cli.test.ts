import { describe, it, expect } from "vitest";
import { parseEmitArgs, mapHookToSignal } from "../src/emit-cli.js";

describe("parseEmitArgs", () => {
  it("parses positional type and payload", () => {
    const args = parseEmitArgs([
      "node",
      "emit-cli.js",
      "tool_call",
      '{"toolName":"Bash","agentId":"claude"}',
    ]);
    expect(args.type).toBe("tool_call");
    expect(args.payloadJson).toBe('{"toolName":"Bash","agentId":"claude"}');
    expect(args.stdin).toBe(false);
  });

  it("parses --stdin flag", () => {
    const args = parseEmitArgs(["node", "emit-cli.js", "--stdin"]);
    expect(args.stdin).toBe(true);
    expect(args.type).toBeUndefined();
  });

  it("parses --endpoint option", () => {
    const args = parseEmitArgs([
      "node",
      "emit-cli.js",
      "--endpoint",
      "http://remote:8080/api/signal",
      "tool_call",
      "{}",
    ]);
    expect(args.endpoint).toBe("http://remote:8080/api/signal");
    expect(args.type).toBe("tool_call");
  });
});

describe("mapHookToSignal", () => {
  it("maps PreToolUse to tool_call", () => {
    const signal = mapHookToSignal({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_use_id: "tu-1",
      tool_input: { command: "ls" },
      session_id: "sess-42",
    });

    expect(signal).not.toBeNull();
    expect(signal!.type).toBe("tool_call");
    expect(signal!.correlationId).toBe("sess-42");
    const payload = signal!.payload as {
      toolName: string;
      agentId: string;
      callId?: string;
      input?: Record<string, unknown>;
    };
    expect(payload.toolName).toBe("Bash");
    expect(payload.agentId).toBe("claude");
    expect(payload.callId).toBe("tu-1");
    expect(payload.input).toEqual({ command: "ls" });
  });

  it("maps PostToolUse to tool_result", () => {
    const signal = mapHookToSignal({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_use_id: "tu-2",
      tool_response: "file contents here",
    });

    expect(signal!.type).toBe("tool_result");
    const payload = signal!.payload as {
      toolName: string;
      success: boolean;
      output?: Record<string, unknown>;
    };
    expect(payload.toolName).toBe("Read");
    expect(payload.success).toBe(true);
    expect(payload.output).toEqual({ response: "file contents here" });
  });

  it("maps PostToolUseFailure to error", () => {
    const signal = mapHookToSignal({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      error: "Command failed with exit code 1",
    });

    expect(signal!.type).toBe("error");
    const payload = signal!.payload as {
      message: string;
      severity: string;
      code?: string;
    };
    expect(payload.message).toBe("Command failed with exit code 1");
    expect(payload.severity).toBe("error");
    expect(payload.code).toBe("Bash");
  });

  it("maps SubagentStart to task_dispatch", () => {
    const signal = mapHookToSignal({
      hook_event_name: "SubagentStart",
      agent_id: "agent-123",
      agent_type: "Explore",
    });

    expect(signal!.type).toBe("task_dispatch");
    const payload = signal!.payload as {
      taskId: string;
      from: string;
      to: string;
    };
    expect(payload.taskId).toBe("agent-123");
    expect(payload.from).toBe("claude");
    expect(payload.to).toBe("Explore");
  });

  it("maps SubagentStop to completion", () => {
    const signal = mapHookToSignal({
      hook_event_name: "SubagentStop",
      agent_id: "agent-123",
      agent_type: "Explore",
    });

    expect(signal!.type).toBe("completion");
    const payload = signal!.payload as {
      taskId: string;
      agentId?: string;
      success: boolean;
    };
    expect(payload.taskId).toBe("agent-123");
    expect(payload.agentId).toBe("Explore");
    expect(payload.success).toBe(true);
  });

  it("maps Stop to agent_state_change (acting → done)", () => {
    const signal = mapHookToSignal({
      hook_event_name: "Stop",
    });

    expect(signal!.type).toBe("agent_state_change");
    const payload = signal!.payload as {
      agentId: string;
      from: string;
      to: string;
    };
    expect(payload.agentId).toBe("claude");
    expect(payload.from).toBe("acting");
    expect(payload.to).toBe("done");
  });

  it("maps SessionStart to agent_state_change (idle → thinking)", () => {
    const signal = mapHookToSignal({
      hook_event_name: "SessionStart",
    });

    expect(signal!.type).toBe("agent_state_change");
    const payload = signal!.payload as {
      agentId: string;
      from: string;
      to: string;
    };
    expect(payload.agentId).toBe("claude");
    expect(payload.from).toBe("idle");
    expect(payload.to).toBe("thinking");
  });

  it("returns null for unknown hook events", () => {
    const signal = mapHookToSignal({
      hook_event_name: "SomeFutureHook",
    });
    expect(signal).toBeNull();
  });
});
