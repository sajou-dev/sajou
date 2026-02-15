/**
 * Composable scenario builders.
 *
 * Each builder returns ScenarioStep[] — concatenate them for composed scenarios.
 * Builders are parametric: configure agent IDs, tools, timing, etc.
 *
 * Includes LLM-specific profiles for realistic streaming simulation.
 */

import type { SignalType } from "../types.js";
import type {
  ScenarioStep,
  SingleAgentConfig,
  MultiAgentConfig,
  ErrorRecoveryConfig,
  StressTestConfig,
  LLMProfile,
  StreamingFlowConfig,
} from "./types.js";

// ---------------------------------------------------------------------------
// LLM profiles — realistic timing for each model family
// ---------------------------------------------------------------------------

/** Claude Sonnet 4.5 — fast, no thinking, tool use. */
export const CLAUDE_SONNET: LLMProfile = {
  model: "claude-sonnet-4-5-20250929",
  displayName: "Claude Sonnet",
  tokenIntervalMs: 35,
  hasThinking: false,
  hasToolUse: true,
};

/** Claude Opus 4.6 — slower, extended thinking, tool use. */
export const CLAUDE_OPUS: LLMProfile = {
  model: "claude-opus-4-6",
  displayName: "Claude Opus",
  tokenIntervalMs: 55,
  hasThinking: true,
  thinkingIntervalMs: 25,
  thinkingChunks: 40,
  hasToolUse: true,
};

/** GPT-4o — fast streaming, no thinking, tool use. */
export const GPT_4O: LLMProfile = {
  model: "gpt-4o-2025-01-06",
  displayName: "GPT-4o",
  tokenIntervalMs: 18,
  hasThinking: false,
  hasToolUse: true,
};

/** GPT-o3 — thinking model, tool use. */
export const GPT_O3: LLMProfile = {
  model: "o3-2025-04-16",
  displayName: "GPT o3",
  tokenIntervalMs: 40,
  hasThinking: true,
  thinkingIntervalMs: 30,
  thinkingChunks: 25,
  hasToolUse: true,
};

/** DeepSeek R1 — long thinking, then text. */
export const DEEPSEEK_R1: LLMProfile = {
  model: "deepseek-reasoner",
  displayName: "DeepSeek R1",
  tokenIntervalMs: 28,
  hasThinking: true,
  thinkingIntervalMs: 18,
  thinkingChunks: 60,
  hasToolUse: false,
};

/** GLM-4 (Zhipu) — thinking via reasoning_content, fast tokens. */
export const GLM_4: LLMProfile = {
  model: "glm-4-plus",
  displayName: "GLM-4",
  tokenIntervalMs: 22,
  hasThinking: true,
  thinkingIntervalMs: 15,
  thinkingChunks: 35,
  hasToolUse: false,
};

/** Llama 3.3 70B via Ollama — local, slower, no thinking. */
export const LLAMA_LOCAL: LLMProfile = {
  model: "llama3.3:70b",
  displayName: "Llama 3.3 (local)",
  tokenIntervalMs: 65,
  hasThinking: false,
  hasToolUse: false,
};

/** All profiles indexed by display name. */
export const LLM_PROFILES: ReadonlyMap<string, LLMProfile> = new Map([
  [CLAUDE_SONNET.displayName, CLAUDE_SONNET],
  [CLAUDE_OPUS.displayName, CLAUDE_OPUS],
  [GPT_4O.displayName, GPT_4O],
  [GPT_O3.displayName, GPT_O3],
  [DEEPSEEK_R1.displayName, DEEPSEEK_R1],
  [GLM_4.displayName, GLM_4],
  [LLAMA_LOCAL.displayName, LLAMA_LOCAL],
]);

// ---------------------------------------------------------------------------
// Sample text content for streaming
// ---------------------------------------------------------------------------

const SAMPLE_TEXT =
  "Based on the analysis, the data shows three key trends. " +
  "First, adoption rates have increased significantly across all segments. " +
  "Second, the cost per unit has decreased by approximately 30% year-over-year. " +
  "Third, user satisfaction scores are consistently above the 90th percentile. " +
  "These findings suggest that the current strategy is working well " +
  "and should be continued with minor adjustments to targeting.";

const SAMPLE_THINKING =
  "Let me break this down step by step. " +
  "The user is asking about data trends, so I need to analyze the three dimensions. " +
  "For adoption rates, I should look at the growth curve across Q1-Q4. " +
  "The cost reduction is interesting — it's likely driven by economies of scale. " +
  "I should also check if satisfaction correlates with the pricing changes. " +
  "Now, how to structure the response... " +
  "I'll lead with the headline finding, then detail each trend with supporting data. " +
  "The conclusion should tie back to actionable recommendations.";

const SAMPLE_CODE_RESPONSE =
  "Here's the implementation:\n\n```typescript\n" +
  "export function analyzeTrends(data: DataPoint[]): TrendReport {\n" +
  "  const adoption = data.map(d => d.adoptionRate);\n" +
  "  const growth = calculateGrowthRate(adoption);\n" +
  "  const costDelta = computeCostDelta(data);\n" +
  "  return {\n" +
  "    adoptionGrowth: growth,\n" +
  "    costReduction: costDelta,\n" +
  "    satisfaction: aggregateSatisfaction(data),\n" +
  "  };\n" +
  "}\n```\n\n" +
  "This function processes the raw data points and returns a structured report.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Apply jitter to a delay value. */
function jittered(baseMs: number, jitter: number): number {
  if (jitter <= 0) return baseMs;
  const variance = baseMs * jitter;
  return Math.round(baseMs + (Math.random() * 2 - 1) * variance);
}

/** Split text into word-level chunks for realistic token streaming. */
function tokenize(text: string): string[] {
  // Split on spaces but keep punctuation with the preceding word.
  // This gives roughly word-sized chunks like a real LLM tokenizer output.
  const words = text.split(/(?<=\s)/);
  return words.filter(w => w.length > 0);
}

// ---------------------------------------------------------------------------
// Streaming flow — the main LLM simulation builder
// ---------------------------------------------------------------------------

/**
 * LLM streaming flow: simulates a complete model response.
 *
 * Sequence:
 *   1. task_dispatch (prompt sent)
 *   2. agent_state_change (idle → acting)
 *   3. [if thinking model] N thinking chunks
 *   4. [if tools] tool_call → tool_result cycles
 *   5. text_delta stream (word by word)
 *   6. token_usage
 *   7. completion
 */
export function streamingFlow(config?: StreamingFlowConfig): ScenarioStep[] {
  const profile = config?.profile ?? CLAUDE_SONNET;
  const text = config?.text ?? SAMPLE_TEXT;
  const thinkingText = config?.thinkingText ?? SAMPLE_THINKING;
  const tools = config?.tools ?? [];
  const jitter = config?.jitter ?? 0.15;
  const taskDescription = config?.taskDescription ?? "Analyze the provided data and summarize findings";

  const agentId = profile.model;
  const correlationId = `stream-${profile.displayName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const steps: ScenarioStep[] = [];

  // 1. Task dispatch
  steps.push({
    delayMs: 0,
    type: "task_dispatch",
    correlationId,
    payload: {
      taskId: `task-${agentId}`,
      from: "user",
      to: agentId,
      description: taskDescription,
    },
  });

  // 2. Agent wakes up
  steps.push({
    delayMs: jittered(150, jitter),
    type: "agent_state_change",
    correlationId,
    payload: { agentId, from: "idle", to: "acting", reason: "processing request" },
  });

  // 3. Thinking phase (if applicable)
  if (profile.hasThinking) {
    const thinkingTokens = tokenize(thinkingText);
    const chunkCount = profile.thinkingChunks ?? thinkingTokens.length;
    const tokensPerChunk = Math.max(1, Math.ceil(thinkingTokens.length / chunkCount));

    for (let i = 0; i < chunkCount && i * tokensPerChunk < thinkingTokens.length; i++) {
      const chunk = thinkingTokens.slice(i * tokensPerChunk, (i + 1) * tokensPerChunk).join("");
      steps.push({
        delayMs: jittered(profile.thinkingIntervalMs ?? 25, jitter),
        type: "thinking",
        correlationId,
        payload: { agentId, content: chunk },
      });
    }
  }

  // 4. Tool use cycles (if tools provided and profile supports it)
  if (profile.hasToolUse && tools.length > 0) {
    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i]!;
      const callId = `call-${String(i + 1).padStart(3, "0")}`;

      steps.push({
        delayMs: jittered(200, jitter),
        type: "tool_call",
        correlationId,
        payload: {
          toolName: tool.name,
          agentId,
          callId,
          input: tool.input ?? {},
        },
      });

      steps.push({
        delayMs: jittered(1500, jitter),
        type: "tool_result",
        correlationId,
        payload: {
          toolName: tool.name,
          agentId,
          callId,
          success: true,
          output: tool.output ?? { result: `${tool.name} completed` },
        },
      });
    }
  }

  // 5. Text delta stream
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i++) {
    steps.push({
      delayMs: i === 0
        ? jittered(profile.hasThinking ? 300 : 500, jitter) // first token delay (TTFT)
        : jittered(profile.tokenIntervalMs, jitter),
      type: "text_delta",
      correlationId,
      payload: {
        agentId,
        content: tokens[i]!,
        contentType: text.includes("```") ? "code" : "text",
        index: i,
      },
    });
  }

  // 6. Token usage
  const promptTokens = Math.round(taskDescription.length * 1.3);
  const completionTokens = tokens.length;
  steps.push({
    delayMs: jittered(50, jitter),
    type: "token_usage",
    correlationId,
    payload: {
      agentId,
      promptTokens,
      completionTokens,
      model: profile.model,
    },
  });

  // 7. Completion
  steps.push({
    delayMs: jittered(30, jitter),
    type: "completion",
    correlationId,
    payload: {
      agentId,
      success: true,
      result: `Stream completed (${tokens.length} tokens)`,
    },
  });

  return steps;
}

// ---------------------------------------------------------------------------
// Existing builders (unchanged logic, improved where noted)
// ---------------------------------------------------------------------------

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

  steps.push({
    delayMs: jittered(100, jitter),
    type: "agent_state_change",
    correlationId,
    payload: { agentId, from: "idle", to: "thinking", reason: "received task" },
  });

  for (let i = 0; i < toolCallCount; i++) {
    const toolName = tools[i % tools.length] ?? "unknown_tool";
    const callId = `call-${String(i + 1).padStart(3, "0")}`;

    steps.push({
      delayMs: jittered(1500, jitter),
      type: "tool_call",
      correlationId,
      payload: { toolName, agentId, callId, input: { query: `${toolName} request #${i + 1}` } },
    });

    steps.push({
      delayMs: jittered(100, jitter),
      type: "agent_state_change",
      correlationId,
      payload: { agentId, from: "thinking", to: "acting", reason: `tool call: ${toolName}` },
    });

    steps.push({
      delayMs: jittered(2200, jitter),
      type: "tool_result",
      correlationId,
      payload: { toolName, agentId, callId, success: true, output: { result: `${toolName} completed successfully` } },
    });

    steps.push({
      delayMs: jittered(150, jitter),
      type: "agent_state_change",
      correlationId,
      payload: { agentId, from: "acting", to: "thinking", reason: `processing ${toolName} results` },
    });

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
    payload: { taskId: `task-${agentId}`, agentId, success: true, result: "Task completed successfully." },
  });

  return steps;
}

/**
 * Multi-agent flow: N agents working in parallel with interleaved signals.
 */
export function multiAgentFlow(config: MultiAgentConfig): ScenarioStep[] {
  const agents = config.agents;
  const tools = config.tools ?? ["web_search", "file_read"];
  const jitter = config.jitter ?? 0.2;

  const steps: ScenarioStep[] = [];
  const correlationId = `multi-flow-${Date.now()}`;

  for (const agent of agents) {
    steps.push({
      delayMs: jittered(200, jitter),
      type: "task_dispatch",
      correlationId,
      payload: { taskId: `task-${agent.id}`, from: "orchestrator", to: agent.id, description: agent.task },
    });
  }

  for (const agent of agents) {
    steps.push({
      delayMs: jittered(100, jitter),
      type: "agent_state_change",
      correlationId,
      payload: { agentId: agent.id, from: "idle", to: "thinking", reason: "received task" },
    });
  }

  for (let toolIdx = 0; toolIdx < tools.length; toolIdx++) {
    const toolName = tools[toolIdx] ?? "unknown_tool";
    for (const agent of agents) {
      const callId = `call-${agent.id}-${String(toolIdx + 1).padStart(3, "0")}`;
      steps.push({ delayMs: jittered(1200, jitter), type: "tool_call", correlationId, payload: { toolName, agentId: agent.id, callId } });
      steps.push({ delayMs: jittered(100, jitter), type: "agent_state_change", correlationId, payload: { agentId: agent.id, from: "thinking", to: "acting", reason: `tool call: ${toolName}` } });
      steps.push({ delayMs: jittered(1800, jitter), type: "tool_result", correlationId, payload: { toolName, agentId: agent.id, callId, success: true, output: { result: `${toolName} result for ${agent.id}` } } });
      steps.push({ delayMs: jittered(150, jitter), type: "agent_state_change", correlationId, payload: { agentId: agent.id, from: "acting", to: "thinking", reason: `processing ${toolName} results` } });
    }
  }

  for (const agent of agents) {
    steps.push({ delayMs: jittered(300, jitter), type: "token_usage", correlationId, payload: { agentId: agent.id, promptTokens: 2400, completionTokens: 680, model: "claude-sonnet-4-5-20250929", cost: 0.032 } });
  }

  for (const agent of agents) {
    steps.push({ delayMs: jittered(800, jitter), type: "agent_state_change", correlationId, payload: { agentId: agent.id, from: "thinking", to: "done", reason: "task complete" } });
    steps.push({ delayMs: jittered(200, jitter), type: "completion", correlationId, payload: { taskId: `task-${agent.id}`, agentId: agent.id, success: true, result: `${agent.task} — completed.` } });
  }

  return steps;
}

/**
 * Error recovery flow: tool fails → error → retry → success.
 */
export function errorRecoveryFlow(config?: ErrorRecoveryConfig): ScenarioStep[] {
  const agentId = config?.agentId ?? "agent-solver";
  const errorTool = config?.errorTool ?? "api_call";
  const severity = config?.severity ?? "error";
  const jitter = config?.jitter ?? 0.2;
  const correlationId = `error-flow-${agentId}-${Date.now()}`;

  const steps: ScenarioStep[] = [];

  steps.push({ delayMs: 0, type: "task_dispatch", correlationId, payload: { taskId: `task-${agentId}`, from: "orchestrator", to: agentId, description: "Fetch data from external API and process results" } });
  steps.push({ delayMs: jittered(100, jitter), type: "agent_state_change", correlationId, payload: { agentId, from: "idle", to: "thinking", reason: "received task" } });
  steps.push({ delayMs: jittered(1200, jitter), type: "tool_call", correlationId, payload: { toolName: errorTool, agentId, callId: "call-fail-001", input: { endpoint: "/api/data", timeout: 5000 } } });
  steps.push({ delayMs: jittered(100, jitter), type: "agent_state_change", correlationId, payload: { agentId, from: "thinking", to: "acting", reason: `tool call: ${errorTool}` } });
  steps.push({ delayMs: jittered(3000, jitter), type: "tool_result", correlationId, payload: { toolName: errorTool, agentId, callId: "call-fail-001", success: false, output: { error: "Connection timeout after 5000ms" } } });
  steps.push({ delayMs: jittered(200, jitter), type: "error", correlationId, payload: { agentId, code: "TOOL_TIMEOUT", message: `${errorTool} timed out — retrying with fallback`, severity } });
  steps.push({ delayMs: jittered(150, jitter), type: "agent_state_change", correlationId, payload: { agentId, from: "acting", to: "thinking", reason: "error recovery — planning retry" } });
  steps.push({ delayMs: jittered(1500, jitter), type: "tool_call", correlationId, payload: { toolName: "web_search", agentId, callId: "call-retry-001", input: { query: "fallback data source" } } });
  steps.push({ delayMs: jittered(100, jitter), type: "agent_state_change", correlationId, payload: { agentId, from: "thinking", to: "acting", reason: "tool call: web_search (fallback)" } });
  steps.push({ delayMs: jittered(2000, jitter), type: "tool_result", correlationId, payload: { toolName: "web_search", agentId, callId: "call-retry-001", success: true, output: { result: "Fallback data retrieved successfully" } } });
  steps.push({ delayMs: jittered(150, jitter), type: "agent_state_change", correlationId, payload: { agentId, from: "acting", to: "thinking", reason: "processing fallback results" } });
  steps.push({ delayMs: jittered(300, jitter), type: "token_usage", correlationId, payload: { agentId, promptTokens: 3200, completionTokens: 890, model: "claude-sonnet-4-5-20250929", cost: 0.041 } });
  steps.push({ delayMs: jittered(1000, jitter), type: "agent_state_change", correlationId, payload: { agentId, from: "thinking", to: "done", reason: "task complete after recovery" } });
  steps.push({ delayMs: jittered(200, jitter), type: "completion", correlationId, payload: { taskId: `task-${agentId}`, agentId, success: true, result: "Data retrieved via fallback after initial timeout." } });

  return steps;
}

/**
 * Stress test: rapid burst of random signals.
 */
export function stressTest(config?: StressTestConfig): ScenarioStep[] {
  const signalCount = config?.signalCount ?? 20;
  const intervalMs = config?.intervalMs ?? 100;
  const agentId = config?.agentId ?? "agent-stress";
  const types: readonly SignalType[] = config?.types ?? [
    "task_dispatch", "tool_call", "tool_result", "token_usage",
    "agent_state_change", "error", "completion", "text_delta", "thinking",
  ];
  const correlationId = `stress-${Date.now()}`;

  const steps: ScenarioStep[] = [];
  let callCounter = 0;

  for (let i = 0; i < signalCount; i++) {
    const type = types[i % types.length] as SignalType;
    const delay = i === 0 ? 0 : intervalMs;
    steps.push({ delayMs: delay, type, correlationId, payload: makePayload(type, agentId, ++callCounter) });
  }

  return steps;
}

/** Generate a valid payload for any signal type. */
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
    case "text_delta":
      return { agentId, content: `chunk-${counter} `, contentType: "text", index: counter - 1 };
    case "thinking":
      return { agentId, content: `thought step ${counter}...` };
    default:
      return { agentId, data: `signal #${counter}` };
  }
}

// Re-export sample texts for use in presets
export { SAMPLE_TEXT, SAMPLE_THINKING, SAMPLE_CODE_RESPONSE };
