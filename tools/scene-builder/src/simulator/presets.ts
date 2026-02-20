/**
 * Pre-built scenarios ready to play.
 *
 * Each preset uses builders with specific configurations
 * to produce a realistic signal timeline.
 *
 * Organized in three categories:
 *   - LLM streaming: model-specific streaming simulations
 *   - Agent flows: orchestrator + tool use patterns
 *   - Stress / debug: performance and edge-case testing
 */

import type { Scenario } from "./types.js";
import {
  streamingFlow,
  singleAgentFlow,
  multiAgentFlow,
  errorRecoveryFlow,
  stressTest,
  CLAUDE_SONNET,
  CLAUDE_OPUS,
  GPT_4O,
  GPT_O3,
  DEEPSEEK_R1,
  GLM_4,
  LLAMA_LOCAL,
  SAMPLE_CODE_RESPONSE,
} from "./builders.js";

// ---------------------------------------------------------------------------
// LLM streaming presets
// ---------------------------------------------------------------------------

/** Claude Sonnet — fast text stream, no thinking. */
export const claudeSonnet: Scenario = {
  name: "claude-sonnet",
  description: "Claude Sonnet 4.5 — fast streaming response, ~35ms/token.",
  tags: ["llm", "streaming", "claude"],
  steps: streamingFlow({
    profile: CLAUDE_SONNET,
    taskDescription: "Summarize the key findings from the quarterly report",
    jitter: 0,
  }),
};

/** Claude Sonnet with tool use — text + tool calls mid-stream. */
export const claudeSonnetTools: Scenario = {
  name: "claude-sonnet-tools",
  description: "Claude Sonnet with tool use — reads a file, searches, then responds.",
  tags: ["llm", "streaming", "claude", "tools"],
  steps: streamingFlow({
    profile: CLAUDE_SONNET,
    taskDescription: "Find the bug in the authentication module and suggest a fix",
    tools: [
      { name: "Read", input: { path: "src/auth/login.ts" }, output: { content: "export function login(user: string, pass: string) { ... }" } },
      { name: "Grep", input: { pattern: "validateToken", path: "src/" }, output: { matches: ["src/auth/token.ts:42", "src/middleware/auth.ts:15"] } },
    ],
    text: SAMPLE_CODE_RESPONSE,
    jitter: 0,
  }),
};

/** Claude Opus — extended thinking, then text + tools. */
export const claudeOpus: Scenario = {
  name: "claude-opus",
  description: "Claude Opus 4.6 — extended thinking phase, then text response with tool use.",
  tags: ["llm", "streaming", "claude", "thinking"],
  steps: streamingFlow({
    profile: CLAUDE_OPUS,
    taskDescription: "Analyze the architecture and propose a migration strategy to microservices",
    tools: [
      { name: "Read", input: { path: "ARCHITECTURE.md" }, output: { content: "Monolith with 12 modules..." } },
    ],
    jitter: 0,
  }),
};

/** GPT-4o — very fast streaming, no thinking. */
export const gpt4o: Scenario = {
  name: "gpt-4o",
  description: "GPT-4o — very fast token stream, ~18ms/token.",
  tags: ["llm", "streaming", "openai"],
  steps: streamingFlow({
    profile: GPT_4O,
    taskDescription: "Write a brief analysis of current market trends",
    jitter: 0,
  }),
};

/** GPT o3 — thinking model with tool use. */
export const gptO3: Scenario = {
  name: "gpt-o3",
  description: "GPT o3 — reasoning model with thinking phase, then text.",
  tags: ["llm", "streaming", "openai", "thinking"],
  steps: streamingFlow({
    profile: GPT_O3,
    taskDescription: "Solve this optimization problem step by step",
    tools: [
      { name: "code_interpreter", input: { code: "import numpy as np; np.linalg.solve(A, b)" }, output: { result: "[1.5, -0.3, 2.7]" } },
    ],
    jitter: 0,
  }),
};

/** DeepSeek R1 — long thinking chain, then text response. */
export const deepseekR1: Scenario = {
  name: "deepseek-r1",
  description: "DeepSeek R1 — long chain-of-thought reasoning (60 chunks), then answer.",
  tags: ["llm", "streaming", "deepseek", "thinking"],
  steps: streamingFlow({
    profile: DEEPSEEK_R1,
    taskDescription: "Prove that the sum of the first n odd numbers equals n squared",
    thinkingText:
      "I need to prove that 1 + 3 + 5 + ... + (2n-1) = n². " +
      "Let me try mathematical induction. " +
      "Base case: n=1, sum = 1 = 1². True. " +
      "Inductive step: assume it holds for k, so 1 + 3 + ... + (2k-1) = k². " +
      "Now for k+1: 1 + 3 + ... + (2k-1) + (2(k+1)-1) = k² + 2k + 1. " +
      "And k² + 2k + 1 = (k+1)². " +
      "Therefore by induction, the statement holds for all n ≥ 1. " +
      "I can also provide a visual proof: arrange dots in an L-shape around each layer of a square. " +
      "Each layer adds 2n-1 dots, building an n×n square progressively. " +
      "Both approaches confirm the result. Let me write a clean proof now.",
    text:
      "**Proof by mathematical induction:**\n\n" +
      "**Claim:** For all n ≥ 1, ∑(2i-1) from i=1 to n equals n².\n\n" +
      "**Base case:** n = 1. The sum is 1 = 1². ✓\n\n" +
      "**Inductive step:** Assume the claim holds for some k ≥ 1. " +
      "Then for k+1: ∑(2i-1) from i=1 to k+1 = k² + (2k+1) = (k+1)². ✓\n\n" +
      "By the principle of mathematical induction, the claim holds for all n ≥ 1. ∎",
    jitter: 0,
  }),
};

/** GLM-4 — thinking (reasoning_content), fast tokens. */
export const glm4: Scenario = {
  name: "glm-4",
  description: "GLM-4 (Zhipu) — thinking via reasoning_content, then fast text.",
  tags: ["llm", "streaming", "glm", "thinking"],
  steps: streamingFlow({
    profile: GLM_4,
    taskDescription: "Explain the difference between concurrency and parallelism",
    jitter: 0,
  }),
};

/** Llama 3.3 local — slower tokens, no thinking, no tools. */
export const llamaLocal: Scenario = {
  name: "llama-local",
  description: "Llama 3.3 70B via Ollama — local inference, ~65ms/token, no tool use.",
  tags: ["llm", "streaming", "local", "ollama"],
  steps: streamingFlow({
    profile: LLAMA_LOCAL,
    taskDescription: "Explain how a transformer attention mechanism works",
    jitter: 0,
  }),
};

// ---------------------------------------------------------------------------
// Agent flow presets (existing, unchanged)
// ---------------------------------------------------------------------------

/** Code review: 1 agent, 3 tools (search, lint, analyze), success. */
export const codeReview: Scenario = {
  name: "code-review",
  description: "Single agent reviews code using search, lint, and static analysis tools.",
  tags: ["agent", "single-agent", "tools"],
  steps: singleAgentFlow({
    agentId: "agent-reviewer",
    tools: ["code_search", "linter", "static_analyzer"],
    toolCallCount: 3,
    taskDescription: "Review pull request #42 for security issues and code style",
    jitter: 0,
  }),
};

/** Multi-agent research: 2 agents (researcher + writer) in parallel. */
export const multiAgentResearch: Scenario = {
  name: "multi-agent-research",
  description: "Two agents work in parallel — researcher gathers data, writer drafts the report.",
  tags: ["agent", "multi-agent", "parallel"],
  steps: multiAgentFlow({
    agents: [
      { id: "agent-researcher", task: "Research capuchin monkey tool use behavior" },
      { id: "agent-writer", task: "Draft a summary report from research findings" },
    ],
    tools: ["web_search", "file_read"],
    jitter: 0,
  }),
};

/** Error recovery: tool timeout, retry with fallback, success. */
export const errorRecovery: Scenario = {
  name: "error-recovery",
  description: "Agent encounters a tool timeout, recovers with a fallback strategy.",
  tags: ["agent", "error", "recovery"],
  steps: errorRecoveryFlow({
    agentId: "agent-fetcher",
    errorTool: "api_call",
    severity: "error",
    jitter: 0,
  }),
};

// ---------------------------------------------------------------------------
// Stress / debug presets
// ---------------------------------------------------------------------------

/** Rapid burst: 20 signals (all 9 types) in ~2 seconds. */
export const rapidBurst: Scenario = {
  name: "rapid-burst",
  description: "Rapid-fire burst of 20 signals (all 9 types) in 2 seconds — stress test for rendering.",
  tags: ["stress", "performance"],
  steps: stressTest({
    signalCount: 20,
    intervalMs: 100,
    agentId: "agent-stress",
  }),
};

/** Full pipeline: dispatch → multi-tool → errors → recovery → completion (~30s). */
export const fullPipeline: Scenario = {
  name: "full-pipeline",
  description: "Complete pipeline: task dispatch, multiple tools, error + recovery, final completion.",
  tags: ["full", "demo"],
  steps: [
    ...singleAgentFlow({
      agentId: "agent-primary",
      tools: ["web_search", "code_interpreter"],
      toolCallCount: 2,
      taskDescription: "Analyze market data and generate insights report",
      jitter: 0,
    }),
    { delayMs: 1000, type: "task_dispatch" as const, correlationId: "pipeline-phase-2", payload: { taskId: "task-validator", from: "orchestrator", to: "agent-validator", description: "Validate generated report against sources" } },
    { delayMs: 100, type: "agent_state_change" as const, correlationId: "pipeline-phase-2", payload: { agentId: "agent-validator", from: "idle", to: "thinking", reason: "received validation task" } },
    { delayMs: 1200, type: "tool_call" as const, correlationId: "pipeline-phase-2", payload: { toolName: "fact_checker", agentId: "agent-validator", callId: "call-validate-001" } },
    { delayMs: 100, type: "agent_state_change" as const, correlationId: "pipeline-phase-2", payload: { agentId: "agent-validator", from: "thinking", to: "acting", reason: "tool call: fact_checker" } },
    { delayMs: 2500, type: "tool_result" as const, correlationId: "pipeline-phase-2", payload: { toolName: "fact_checker", agentId: "agent-validator", callId: "call-validate-001", success: false, output: { error: "Source verification failed for 2 claims" } } },
    { delayMs: 200, type: "error" as const, correlationId: "pipeline-phase-2", payload: { agentId: "agent-validator", code: "VALIDATION_FAILED", message: "2 claims could not be verified — requesting source correction", severity: "warning" } },
    { delayMs: 150, type: "agent_state_change" as const, correlationId: "pipeline-phase-2", payload: { agentId: "agent-validator", from: "acting", to: "thinking", reason: "re-checking with web search" } },
    { delayMs: 1500, type: "tool_call" as const, correlationId: "pipeline-phase-2", payload: { toolName: "web_search", agentId: "agent-validator", callId: "call-recheck-001", input: { query: "verify market data claims 2026" } } },
    { delayMs: 100, type: "agent_state_change" as const, correlationId: "pipeline-phase-2", payload: { agentId: "agent-validator", from: "thinking", to: "acting", reason: "tool call: web_search" } },
    { delayMs: 2000, type: "tool_result" as const, correlationId: "pipeline-phase-2", payload: { toolName: "web_search", agentId: "agent-validator", callId: "call-recheck-001", success: true, output: { result: "Claims verified with updated sources" } } },
    { delayMs: 150, type: "agent_state_change" as const, correlationId: "pipeline-phase-2", payload: { agentId: "agent-validator", from: "acting", to: "thinking", reason: "processing verification results" } },
    { delayMs: 300, type: "token_usage" as const, correlationId: "pipeline-phase-2", payload: { agentId: "agent-validator", promptTokens: 4200, completionTokens: 1100, model: "claude-sonnet-4-5-20250929", cost: 0.053 } },
    { delayMs: 800, type: "agent_state_change" as const, correlationId: "pipeline-phase-2", payload: { agentId: "agent-validator", from: "thinking", to: "done", reason: "validation complete" } },
    { delayMs: 200, type: "completion" as const, correlationId: "pipeline-phase-2", payload: { taskId: "task-validator", agentId: "agent-validator", success: true, result: "Report validated — all claims verified." } },
  ],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** All presets indexed by name. */
export const SCENARIOS: ReadonlyMap<string, Scenario> = new Map([
  // LLM streaming
  [claudeSonnet.name, claudeSonnet],
  [claudeSonnetTools.name, claudeSonnetTools],
  [claudeOpus.name, claudeOpus],
  [gpt4o.name, gpt4o],
  [gptO3.name, gptO3],
  [deepseekR1.name, deepseekR1],
  [glm4.name, glm4],
  [llamaLocal.name, llamaLocal],
  // Agent flows
  [codeReview.name, codeReview],
  [multiAgentResearch.name, multiAgentResearch],
  [errorRecovery.name, errorRecovery],
  // Stress / debug
  [rapidBurst.name, rapidBurst],
  [fullPipeline.name, fullPipeline],
]);
