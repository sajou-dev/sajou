/**
 * Scenario: Multi-agent collaboration.
 *
 * The orchestrator dispatches tasks to two agents working in parallel:
 * - agent-researcher does web research
 * - agent-writer generates an outline
 * Both complete independently. Signals interleave realistically.
 *
 * Demonstrates: concurrent agents, interleaved signals, multiple correlations.
 * Total duration: ~13s at 1x speed.
 */

import type { Scenario, ScenarioStep } from "./types.js";

const CORRELATION_ID = "multi-agent-001";
const RESEARCHER = "agent-researcher";
const WRITER = "agent-writer";

const steps: readonly ScenarioStep[] = [
  // Dispatch to researcher
  {
    delayMs: 0,
    type: "task_dispatch",
    correlationId: CORRELATION_ID,
    payload: {
      taskId: "task-010",
      from: "orchestrator",
      to: RESEARCHER,
      description: "Research latest advances in quantum computing",
    },
  },
  {
    delayMs: 80,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: RESEARCHER, from: "idle", to: "thinking", reason: "received task" },
  },
  // Dispatch to writer shortly after
  {
    delayMs: 250,
    type: "task_dispatch",
    correlationId: CORRELATION_ID,
    payload: {
      taskId: "task-011",
      from: "orchestrator",
      to: WRITER,
      description: "Draft article outline on quantum computing",
    },
  },
  {
    delayMs: 80,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: WRITER, from: "idle", to: "thinking", reason: "received task" },
  },
  // Researcher starts web search
  {
    delayMs: 900,
    type: "tool_call",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "web_search",
      agentId: RESEARCHER,
      callId: "call-020",
      input: { query: "quantum computing breakthroughs 2026" },
    },
  },
  {
    delayMs: 80,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: RESEARCHER, from: "thinking", to: "acting", reason: "tool call: web_search" },
  },
  // Writer starts outline generation
  {
    delayMs: 600,
    type: "tool_call",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "outline_generator",
      agentId: WRITER,
      callId: "call-021",
      input: { topic: "quantum computing", sections: 5 },
    },
  },
  {
    delayMs: 80,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: WRITER, from: "thinking", to: "acting", reason: "tool call: outline_generator" },
  },
  // Researcher's search completes first
  {
    delayMs: 1800,
    type: "tool_result",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "web_search",
      agentId: RESEARCHER,
      callId: "call-020",
      success: true,
      output: { resultCount: 24, topResult: "Google achieves 1000-qubit milestone..." },
    },
  },
  {
    delayMs: 120,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: RESEARCHER, from: "acting", to: "thinking", reason: "processing web_search results" },
  },
  // Researcher token usage
  {
    delayMs: 250,
    type: "token_usage",
    correlationId: CORRELATION_ID,
    payload: {
      agentId: RESEARCHER,
      promptTokens: 2200,
      completionTokens: 600,
      model: "claude-sonnet-4-5-20250929",
      cost: 0.028,
    },
  },
  // Writer's outline completes
  {
    delayMs: 800,
    type: "tool_result",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "outline_generator",
      agentId: WRITER,
      callId: "call-021",
      success: true,
      output: { sections: ["Intro", "History", "Current State", "Challenges", "Future"] },
    },
  },
  {
    delayMs: 120,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: WRITER, from: "acting", to: "thinking", reason: "processing outline results" },
  },
  // Writer token usage
  {
    delayMs: 250,
    type: "token_usage",
    correlationId: CORRELATION_ID,
    payload: {
      agentId: WRITER,
      promptTokens: 1600,
      completionTokens: 450,
      model: "claude-sonnet-4-5-20250929",
      cost: 0.019,
    },
  },
  // Researcher does a second search
  {
    delayMs: 1200,
    type: "tool_call",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "web_search",
      agentId: RESEARCHER,
      callId: "call-022",
      input: { query: "quantum error correction 2026 papers" },
    },
  },
  {
    delayMs: 80,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: RESEARCHER, from: "thinking", to: "acting", reason: "tool call: web_search" },
  },
  // Writer finishes first (just needs to compose outline)
  {
    delayMs: 1000,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: WRITER, from: "thinking", to: "done", reason: "outline finalized" },
  },
  {
    delayMs: 200,
    type: "completion",
    correlationId: CORRELATION_ID,
    payload: {
      taskId: "task-011",
      agentId: WRITER,
      success: true,
      result: "Article outline with 5 sections ready for review.",
    },
  },
  // Researcher's second search returns
  {
    delayMs: 1200,
    type: "tool_result",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "web_search",
      agentId: RESEARCHER,
      callId: "call-022",
      success: true,
      output: { resultCount: 8, topResult: "New surface codes achieve 99.9% fidelity..." },
    },
  },
  {
    delayMs: 120,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: RESEARCHER, from: "acting", to: "thinking", reason: "processing final results" },
  },
  // Researcher final token usage
  {
    delayMs: 300,
    type: "token_usage",
    correlationId: CORRELATION_ID,
    payload: {
      agentId: RESEARCHER,
      promptTokens: 3100,
      completionTokens: 800,
      model: "claude-sonnet-4-5-20250929",
      cost: 0.039,
    },
  },
  // Researcher completes
  {
    delayMs: 1500,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: RESEARCHER, from: "thinking", to: "done", reason: "research complete" },
  },
  {
    delayMs: 200,
    type: "completion",
    correlationId: CORRELATION_ID,
    payload: {
      taskId: "task-010",
      agentId: RESEARCHER,
      success: true,
      result: "Research compiled: 32 sources, 2 key breakthroughs identified.",
    },
  },
];

/** Multi-agent scenario: two agents working in parallel with interleaved signals. */
export const multiAgent: Scenario = {
  name: "multi-agent",
  description: "Orchestrator dispatches tasks to researcher and writer agents working in parallel.",
  steps,
};
