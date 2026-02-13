/**
 * Composable scenario builders.
 *
 * Each builder returns ScenarioStep[] — concatenate them for composed scenarios.
 * Builders are parametric: configure agent IDs, tools, timing, etc.
 *
 * Adapted from tools/signal-simulator — uses local types instead of @sajou/schema.
 */

import type { SignalType } from "../types.js";
import type {
  ScenarioStep,
  SingleAgentConfig,
  MultiAgentConfig,
  ErrorRecoveryConfig,
  StressTestConfig,
} from "./types.js";

/** Apply jitter to a delay value. */
function jittered(baseMs: number, jitter: number): number {
  if (jitter <= 0) return baseMs;
  const variance = baseMs * jitter;
  return Math.round(baseMs + (Math.random() * 2 - 1) * variance);
}

/**
 * Single agent flow: task_dispatch → N tool calls → completion.
 *
 * Generates a realistic sequence: dispatch → thinking → tool_call → acting →
 * tool_result → thinking → ... → token_usage → done → completion.
 */
export function singleAgentFlow(config?: SingleAgentConfig): ScenarioStep[] {
  const agentId = config?.agentId ?? "agent-solver";
  const tools = config?.tools ?? ["web_search", "code_interpreter"];
  const toolCallCount = config?.toolCallCount ?? tools.length;
  const taskDescription = config?.taskDescription ?? "Analyze data and produce a summary report";
  const jitter = config?.jitter ?? 0.2;
  const correlationId = `flow-${agentId}-${Date.now()}`;

  const steps: ScenarioStep[] = [];

  // Task dispatch
  steps.push({
    delayMs: 0,
    type: "task_dispatch",
    correlationId,
    payload: {
      taskId: `task-${agentId}`,
      from: "orchestrator",
      to: agentId,
      description: taskDescription,
    },
  });

  // Agent wakes up
  steps.push({
    delayMs: jittered(100, jitter),
    type: "agent_state_change",
    correlationId,
    payload: { agentId, from: "idle", to: "thinking", reason: "received task" },
  });

  // Tool call/result cycles
  for (let i = 0; i < toolCallCount; i++) {
    const toolName = tools[i % tools.length] ?? "unknown_tool";
    const callId = `call-${String(i + 1).padStart(3, "0")}`;

    // Thinking → tool call
    steps.push({
      delayMs: jittered(1500, jitter),
      type: "tool_call",
      correlationId,
      payload: {
        toolName,
        agentId,
        callId,
        input: { query: `${toolName} request #${i + 1}` },
      },
    });

    // State → acting
    steps.push({
      delayMs: jittered(100, jitter),
      type: "agent_state_change",
      correlationId,
      payload: { agentId, from: "thinking", to: "acting", reason: `tool call: ${toolName}` },
    });

    // Tool result
    steps.push({
      delayMs: jittered(2200, jitter),
      type: "tool_result",
      correlationId,
      payload: {
        toolName,
        agentId,
        callId,
        success: true,
        output: { result: `${toolName} completed successfully` },
      },
    });

    // State → thinking
    steps.push({
      delayMs: jittered(150, jitter),
      type: "agent_state_change",
      correlationId,
      payload: { agentId, from: "acting", to: "thinking", reason: `processing ${toolName} results` },
    });

    // Token usage after each LLM round
    steps.push({
      delayMs: jittered(300, jitter),
      type: "token_usage",
      correlationId,
      payload: {
        agentId,
        promptTokens: 1200 + i * 400,
        completionTokens: 300 + i * 100,
        model: "claude-sonnet-4-5-20250929",
        cost: 0.015 + i * 0.005,
      },
    });
  }

  // Agent finishes
  steps.push({
    delayMs: jittered(1200, jitter),
    type: "agent_state_change",
    correlationId,
    payload: { agentId, from: "thinking", to: "done", reason: "task complete" },
  });

  steps.push({
    delayMs: jittered(200, jitter),
    type: "completion",
    correlationId,
    payload: {
      taskId: `task-${agentId}`,
      agentId,
      success: true,
      result: "Task completed successfully.",
    },
  });

  return steps;
}

/**
 * Multi-agent flow: N agents working in parallel with interleaved signals.
 *
 * Each agent gets a task_dispatch, then tool calls are interleaved
 * to simulate parallel work.
 */
export function multiAgentFlow(config: MultiAgentConfig): ScenarioStep[] {
  const agents = config.agents;
  const tools = config.tools ?? ["web_search", "file_read"];
  const jitter = config.jitter ?? 0.2;

  const steps: ScenarioStep[] = [];
  const correlationId = `multi-flow-${Date.now()}`;

  // Dispatch all agents
  for (const agent of agents) {
    steps.push({
      delayMs: jittered(200, jitter),
      type: "task_dispatch",
      correlationId,
      payload: {
        taskId: `task-${agent.id}`,
        from: "orchestrator",
        to: agent.id,
        description: agent.task,
      },
    });
  }

  // All agents start thinking
  for (const agent of agents) {
    steps.push({
      delayMs: jittered(100, jitter),
      type: "agent_state_change",
      correlationId,
      payload: { agentId: agent.id, from: "idle", to: "thinking", reason: "received task" },
    });
  }

  // Interleaved tool calls — each agent does one tool call
  for (let toolIdx = 0; toolIdx < tools.length; toolIdx++) {
    const toolName = tools[toolIdx] ?? "unknown_tool";

    for (const agent of agents) {
      const callId = `call-${agent.id}-${String(toolIdx + 1).padStart(3, "0")}`;

      steps.push({
        delayMs: jittered(1200, jitter),
        type: "tool_call",
        correlationId,
        payload: { toolName, agentId: agent.id, callId },
      });

      steps.push({
        delayMs: jittered(100, jitter),
        type: "agent_state_change",
        correlationId,
        payload: { agentId: agent.id, from: "thinking", to: "acting", reason: `tool call: ${toolName}` },
      });

      steps.push({
        delayMs: jittered(1800, jitter),
        type: "tool_result",
        correlationId,
        payload: {
          toolName,
          agentId: agent.id,
          callId,
          success: true,
          output: { result: `${toolName} result for ${agent.id}` },
        },
      });

      steps.push({
        delayMs: jittered(150, jitter),
        type: "agent_state_change",
        correlationId,
        payload: { agentId: agent.id, from: "acting", to: "thinking", reason: `processing ${toolName} results` },
      });
    }
  }

  // Token usage for each agent
  for (const agent of agents) {
    steps.push({
      delayMs: jittered(300, jitter),
      type: "token_usage",
      correlationId,
      payload: {
        agentId: agent.id,
        promptTokens: 2400,
        completionTokens: 680,
        model: "claude-sonnet-4-5-20250929",
        cost: 0.032,
      },
    });
  }

  // All agents complete
  for (const agent of agents) {
    steps.push({
      delayMs: jittered(800, jitter),
      type: "agent_state_change",
      correlationId,
      payload: { agentId: agent.id, from: "thinking", to: "done", reason: "task complete" },
    });

    steps.push({
      delayMs: jittered(200, jitter),
      type: "completion",
      correlationId,
      payload: {
        taskId: `task-${agent.id}`,
        agentId: agent.id,
        success: true,
        result: `${agent.task} — completed.`,
      },
    });
  }

  return steps;
}

/**
 * Error recovery flow: tool fails → error → retry → success.
 *
 * Simulates a tool timeout/failure, an error signal, the agent retrying
 * with a fallback approach, and eventually succeeding.
 */
export function errorRecoveryFlow(config?: ErrorRecoveryConfig): ScenarioStep[] {
  const agentId = config?.agentId ?? "agent-solver";
  const errorTool = config?.errorTool ?? "api_call";
  const severity = config?.severity ?? "error";
  const jitter = config?.jitter ?? 0.2;
  const correlationId = `error-flow-${agentId}-${Date.now()}`;

  const steps: ScenarioStep[] = [];

  // Task dispatch
  steps.push({
    delayMs: 0,
    type: "task_dispatch",
    correlationId,
    payload: {
      taskId: `task-${agentId}`,
      from: "orchestrator",
      to: agentId,
      description: "Fetch data from external API and process results",
    },
  });

  steps.push({
    delayMs: jittered(100, jitter),
    type: "agent_state_change",
    correlationId,
    payload: { agentId, from: "idle", to: "thinking", reason: "received task" },
  });

  // First tool call — will fail
  steps.push({
    delayMs: jittered(1200, jitter),
    type: "tool_call",
    correlationId,
    payload: {
      toolName: errorTool,
      agentId,
      callId: "call-fail-001",
      input: { endpoint: "/api/data", timeout: 5000 },
    },
  });

  steps.push({
    delayMs: jittered(100, jitter),
    type: "agent_state_change",
    correlationId,
    payload: { agentId, from: "thinking", to: "acting", reason: `tool call: ${errorTool}` },
  });

  // Tool fails
  steps.push({
    delayMs: jittered(3000, jitter),
    type: "tool_result",
    correlationId,
    payload: {
      toolName: errorTool,
      agentId,
      callId: "call-fail-001",
      success: false,
      output: { error: "Connection timeout after 5000ms" },
    },
  });

  // Error signal
  steps.push({
    delayMs: jittered(200, jitter),
    type: "error",
    correlationId,
    payload: {
      agentId,
      code: "TOOL_TIMEOUT",
      message: `${errorTool} timed out — retrying with fallback`,
      severity,
    },
  });

  steps.push({
    delayMs: jittered(150, jitter),
    type: "agent_state_change",
    correlationId,
    payload: { agentId, from: "acting", to: "thinking", reason: "error recovery — planning retry" },
  });

  // Retry with different tool
  steps.push({
    delayMs: jittered(1500, jitter),
    type: "tool_call",
    correlationId,
    payload: {
      toolName: "web_search",
      agentId,
      callId: "call-retry-001",
      input: { query: "fallback data source" },
    },
  });

  steps.push({
    delayMs: jittered(100, jitter),
    type: "agent_state_change",
    correlationId,
    payload: { agentId, from: "thinking", to: "acting", reason: "tool call: web_search (fallback)" },
  });

  // Retry succeeds
  steps.push({
    delayMs: jittered(2000, jitter),
    type: "tool_result",
    correlationId,
    payload: {
      toolName: "web_search",
      agentId,
      callId: "call-retry-001",
      success: true,
      output: { result: "Fallback data retrieved successfully" },
    },
  });

  steps.push({
    delayMs: jittered(150, jitter),
    type: "agent_state_change",
    correlationId,
    payload: { agentId, from: "acting", to: "thinking", reason: "processing fallback results" },
  });

  // Token usage
  steps.push({
    delayMs: jittered(300, jitter),
    type: "token_usage",
    correlationId,
    payload: {
      agentId,
      promptTokens: 3200,
      completionTokens: 890,
      model: "claude-sonnet-4-5-20250929",
      cost: 0.041,
    },
  });

  // Success
  steps.push({
    delayMs: jittered(1000, jitter),
    type: "agent_state_change",
    correlationId,
    payload: { agentId, from: "thinking", to: "done", reason: "task complete after recovery" },
  });

  steps.push({
    delayMs: jittered(200, jitter),
    type: "completion",
    correlationId,
    payload: {
      taskId: `task-${agentId}`,
      agentId,
      success: true,
      result: "Data retrieved via fallback after initial timeout.",
    },
  });

  return steps;
}

/**
 * Stress test: rapid burst of random signals.
 *
 * Emits a configurable number of signals at short intervals,
 * useful for testing rendering performance.
 */
export function stressTest(config?: StressTestConfig): ScenarioStep[] {
  const signalCount = config?.signalCount ?? 20;
  const intervalMs = config?.intervalMs ?? 100;
  const agentId = config?.agentId ?? "agent-stress";
  const types: readonly SignalType[] = config?.types ?? [
    "task_dispatch",
    "tool_call",
    "tool_result",
    "token_usage",
    "agent_state_change",
    "error",
    "completion",
  ];
  const correlationId = `stress-${Date.now()}`;

  const steps: ScenarioStep[] = [];
  let callCounter = 0;

  for (let i = 0; i < signalCount; i++) {
    const type = types[i % types.length] as SignalType;
    const delay = i === 0 ? 0 : intervalMs;

    steps.push({
      delayMs: delay,
      type,
      correlationId,
      payload: makePayload(type, agentId, ++callCounter),
    });
  }

  return steps;
}

/** Generate a payload for any signal type. */
function makePayload(type: SignalType, agentId: string, counter: number): Record<string, unknown> {
  switch (type) {
    case "task_dispatch":
      return { taskId: `stress-task-${counter}`, from: "orchestrator", to: agentId, description: `Stress task #${counter}` };
    case "tool_call":
      return { toolName: "stress_tool", agentId, callId: `stress-call-${counter}` };
    case "tool_result":
      return { toolName: "stress_tool", agentId, callId: `stress-call-${counter}`, success: true };
    case "token_usage":
      return { agentId, promptTokens: 100 * counter, completionTokens: 50 * counter, model: "claude-sonnet-4-5-20250929" };
    case "agent_state_change":
      return { agentId, from: "thinking", to: "acting", reason: `stress transition #${counter}` };
    case "error":
      return { agentId, message: `Stress error #${counter}`, severity: "warning" };
    case "completion":
      return { taskId: `stress-task-${counter}`, agentId, success: true };
    default:
      return { agentId, data: `signal #${counter}` };
  }
}
