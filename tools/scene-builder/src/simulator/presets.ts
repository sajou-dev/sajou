/**
 * Pre-built scenarios ready to play.
 *
 * Each preset uses builders with specific configurations
 * to produce a realistic signal timeline.
 */

import type { Scenario } from "./types.js";
import {
  singleAgentFlow,
  multiAgentFlow,
  errorRecoveryFlow,
  stressTest,
} from "./builders.js";

/** Code review: 1 agent, 3 tools (search, lint, analyze), success. */
export const codeReview: Scenario = {
  name: "code-review",
  description: "Single agent reviews code using search, lint, and static analysis tools.",
  tags: ["single-agent", "tools"],
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
  tags: ["multi-agent", "parallel"],
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
  tags: ["error", "recovery"],
  steps: errorRecoveryFlow({
    agentId: "agent-fetcher",
    errorTool: "api_call",
    severity: "error",
    jitter: 0,
  }),
};

/** Rapid burst: 20 signals in ~2 seconds. */
export const rapidBurst: Scenario = {
  name: "rapid-burst",
  description: "Rapid-fire burst of 20 signals in 2 seconds — stress test for rendering.",
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
    // Phase 1: Initial dispatch and tools
    ...singleAgentFlow({
      agentId: "agent-primary",
      tools: ["web_search", "code_interpreter"],
      toolCallCount: 2,
      taskDescription: "Analyze market data and generate insights report",
      jitter: 0,
    }),
    // Phase 2: Error and recovery
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

/** All presets indexed by name. */
export const SCENARIOS: ReadonlyMap<string, Scenario> = new Map([
  [codeReview.name, codeReview],
  [multiAgentResearch.name, multiAgentResearch],
  [errorRecovery.name, errorRecovery],
  [rapidBurst.name, rapidBurst],
  [fullPipeline.name, fullPipeline],
]);
