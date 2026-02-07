/**
 * Scenario: Error recovery.
 *
 * An agent receives a task, calls database_query which times out.
 * An error signal fires, the agent retries, succeeds on second attempt,
 * and completes the task.
 *
 * Demonstrates: error signals, tool retries, warning severity.
 * Total duration: ~10s at 1x speed.
 */

import type { Scenario, ScenarioStep } from "./types.js";

const CORRELATION_ID = "error-recovery-001";
const AGENT_ID = "agent-analyst";

const steps: readonly ScenarioStep[] = [
  // Task dispatch
  {
    delayMs: 0,
    type: "task_dispatch",
    correlationId: CORRELATION_ID,
    payload: {
      taskId: "task-002",
      from: "orchestrator",
      to: AGENT_ID,
      description: "Query sales database and generate monthly report",
    },
  },
  {
    delayMs: 80,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: AGENT_ID, from: "idle", to: "thinking", reason: "received task" },
  },
  // First tool call — will fail
  {
    delayMs: 1200,
    type: "tool_call",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "database_query",
      agentId: AGENT_ID,
      callId: "call-010",
      input: { sql: "SELECT * FROM sales WHERE month = '2026-01'" },
    },
  },
  {
    delayMs: 100,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: AGENT_ID, from: "thinking", to: "acting", reason: "tool call: database_query" },
  },
  // Tool times out — failure
  {
    delayMs: 3000,
    type: "tool_result",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "database_query",
      agentId: AGENT_ID,
      callId: "call-010",
      success: false,
      output: { error: "Connection timeout after 30s" },
    },
  },
  // Error signal
  {
    delayMs: 50,
    type: "error",
    correlationId: CORRELATION_ID,
    payload: {
      agentId: AGENT_ID,
      code: "TOOL_TIMEOUT",
      message: "database_query timed out after 30s — retrying with smaller query",
      severity: "warning",
    },
  },
  {
    delayMs: 150,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: AGENT_ID, from: "acting", to: "thinking", reason: "tool failed, planning retry" },
  },
  // Token usage for the reasoning step
  {
    delayMs: 300,
    type: "token_usage",
    correlationId: CORRELATION_ID,
    payload: {
      agentId: AGENT_ID,
      promptTokens: 980,
      completionTokens: 150,
      model: "claude-sonnet-4-5-20250929",
      cost: 0.009,
    },
  },
  // Retry with a narrower query
  {
    delayMs: 800,
    type: "tool_call",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "database_query",
      agentId: AGENT_ID,
      callId: "call-011",
      input: { sql: "SELECT product, SUM(amount) FROM sales WHERE month = '2026-01' GROUP BY product LIMIT 100" },
    },
  },
  {
    delayMs: 100,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: AGENT_ID, from: "thinking", to: "acting", reason: "tool call: database_query (retry)" },
  },
  // Second attempt succeeds
  {
    delayMs: 1800,
    type: "tool_result",
    correlationId: CORRELATION_ID,
    payload: {
      toolName: "database_query",
      agentId: AGENT_ID,
      callId: "call-011",
      success: true,
      output: { rowCount: 87, topProduct: "Widget Pro" },
    },
  },
  {
    delayMs: 150,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: AGENT_ID, from: "acting", to: "thinking", reason: "processing query results" },
  },
  // Final token usage
  {
    delayMs: 300,
    type: "token_usage",
    correlationId: CORRELATION_ID,
    payload: {
      agentId: AGENT_ID,
      promptTokens: 1800,
      completionTokens: 420,
      model: "claude-sonnet-4-5-20250929",
      cost: 0.021,
    },
  },
  // Done
  {
    delayMs: 1000,
    type: "agent_state_change",
    correlationId: CORRELATION_ID,
    payload: { agentId: AGENT_ID, from: "thinking", to: "done", reason: "report generated" },
  },
  {
    delayMs: 200,
    type: "completion",
    correlationId: CORRELATION_ID,
    payload: {
      taskId: "task-002",
      agentId: AGENT_ID,
      success: true,
      result: "Monthly report generated: 87 products, top seller Widget Pro ($142k).",
    },
  },
];

/** Error recovery scenario: tool failure, retry, successful completion. */
export const errorRecovery: Scenario = {
  name: "error-recovery",
  description: "Agent calls a tool that times out, retries with a narrower query, and succeeds.",
  steps,
};
