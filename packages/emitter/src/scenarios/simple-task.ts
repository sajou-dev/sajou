/**
 * Scenario: Simple task completion.
 *
 * An orchestrator dispatches a task to a single agent.
 * The agent thinks, calls web_search, gets a result, calls code_interpreter,
 * gets a result, reports token usage, and completes successfully.
 *
 * Total duration: ~11.5s at 1x speed.
 */

import type { Scenario, ScenarioStep } from "./types.js";

const CORRELATION_ID = "simple-task-001";
const AGENT_ID = "agent-solver";

const steps: readonly ScenarioStep[] = [
  // Orchestrator dispatches a task
  {
    delayMs: 0,
    type: "task_dispatch",
    correlationId: CORRELATION_ID,
    payload: {
      taskId: "task-001",
      from: "orchestrator",
      to: AGENT_ID,
      description: "Research capuchin monkey behavior and summarize findings",
    },
  },
  // Agent wakes up
  {
    delayMs: 100,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: AGENT_ID, from: "idle", to: "thinking", reason: "received task" },
  },
  // Agent decides to search the web
  {
    delayMs: 1500,
    type: "tool_call",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "web_search",
      agentId: AGENT_ID,
      callId: "call-001",
      input: { query: "capuchin monkey behavior research 2026" },
    },
  },
  {
    delayMs: 100,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: AGENT_ID, from: "thinking", to: "acting", reason: "tool call: web_search" },
  },
  // Web search returns
  {
    delayMs: 2200,
    type: "tool_result",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "web_search",
      agentId: AGENT_ID,
      callId: "call-001",
      success: true,
      output: { resultCount: 12, topResult: "Capuchin monkeys use stone tools to crack nuts..." },
    },
  },
  {
    delayMs: 150,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: AGENT_ID, from: "acting", to: "thinking", reason: "processing web_search results" },
  },
  // Token usage from first LLM call
  {
    delayMs: 300,
    type: "token_usage",
    correlationId: CORRELATION_ID,
    payload: {
      agentId: AGENT_ID,
      promptTokens: 1450,
      completionTokens: 380,
      model: "claude-sonnet-4-5-20250929",
      cost: 0.018,
    },
  },
  // Agent decides to use code_interpreter for data analysis
  {
    delayMs: 1800,
    type: "tool_call",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "code_interpreter",
      agentId: AGENT_ID,
      callId: "call-002",
      input: { code: "import pandas as pd\n# Analyze behavior patterns..." },
    },
  },
  {
    delayMs: 100,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: AGENT_ID, from: "thinking", to: "acting", reason: "tool call: code_interpreter" },
  },
  // Code interpreter returns
  {
    delayMs: 2800,
    type: "tool_result",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "code_interpreter",
      agentId: AGENT_ID,
      callId: "call-002",
      success: true,
      output: { summary: "3 behavioral categories identified: foraging, social, tool-use" },
    },
  },
  {
    delayMs: 150,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: AGENT_ID, from: "acting", to: "thinking", reason: "processing code_interpreter results" },
  },
  // Token usage from second LLM call
  {
    delayMs: 300,
    type: "token_usage",
    correlationId: CORRELATION_ID,
    payload: {
      agentId: AGENT_ID,
      promptTokens: 2100,
      completionTokens: 520,
      model: "claude-sonnet-4-5-20250929",
      cost: 0.027,
    },
  },
  // Agent finishes
  {
    delayMs: 1200,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: AGENT_ID, from: "thinking", to: "done", reason: "task complete" },
  },
  {
    delayMs: 200,
    type: "completion",
    correlationId: CORRELATION_ID,
    payload: {
      taskId: "task-001",
      agentId: AGENT_ID,
      success: true,
      result: "Capuchin monkeys exhibit 3 primary behavioral categories: foraging (42%), social bonding (35%), and tool use (23%).",
    },
  },
];

/** Simple task scenario: one agent, two tools, successful completion. */
export const simpleTask: Scenario = {
  name: "simple-task",
  description: "Single agent receives a task, calls web_search and code_interpreter, completes successfully.",
  steps,
};
