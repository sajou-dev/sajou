/**
 * Types for signal simulator scenarios.
 *
 * Adapted from tools/signal-simulator — uses the scene-builder's local
 * SignalType instead of @sajou/schema.
 */

import type { SignalType } from "../types.js";

/**
 * A single step in a scenario timeline.
 *
 * `delayMs` is the pause *before* emitting this signal,
 * relative to the previous step (not absolute time).
 */
export interface ScenarioStep {
  /** Milliseconds to wait before emitting this signal. */
  readonly delayMs: number;
  /** The signal type. */
  readonly type: SignalType;
  /** The typed payload for this signal type. */
  readonly payload: Readonly<Record<string, unknown>>;
  /** Optional correlation ID override. */
  readonly correlationId?: string;
}

/** A named scenario with a sequence of timed signal steps. */
export interface Scenario {
  /** Human-readable name for this scenario. */
  readonly name: string;
  /** Description of what this scenario demonstrates. */
  readonly description: string;
  /** Tags for categorization in the UI. */
  readonly tags?: readonly string[];
  /** Ordered timeline of signal steps. */
  readonly steps: readonly ScenarioStep[];
}

/** Configuration for single-agent flow builder. */
export interface SingleAgentConfig {
  /** Agent identifier. Defaults to "agent-solver". */
  readonly agentId?: string;
  /** Tools the agent will call. Defaults to ["web_search", "code_interpreter"]. */
  readonly tools?: readonly string[];
  /** Number of tool calls to generate. Defaults to tools.length. */
  readonly toolCallCount?: number;
  /** Task description. */
  readonly taskDescription?: string;
  /** Timing jitter multiplier (0 = no jitter, 1 = full randomization). Defaults to 0.2. */
  readonly jitter?: number;
}

/** Configuration for multi-agent flow builder. */
export interface MultiAgentConfig {
  /** Agent definitions. Each gets their own correlation context. */
  readonly agents: readonly { readonly id: string; readonly task: string }[];
  /** Tools shared across agents. */
  readonly tools?: readonly string[];
  /** Timing jitter multiplier. Defaults to 0.2. */
  readonly jitter?: number;
}

/** Configuration for error recovery flow builder. */
export interface ErrorRecoveryConfig {
  /** Agent identifier. Defaults to "agent-solver". */
  readonly agentId?: string;
  /** Tool that triggers the error. Defaults to "api_call". */
  readonly errorTool?: string;
  /** Error severity. Defaults to "error". */
  readonly severity?: "warning" | "error" | "critical";
  /** Timing jitter multiplier. Defaults to 0.2. */
  readonly jitter?: number;
}

/** Configuration for stress test builder. */
export interface StressTestConfig {
  /** Number of signals to emit. Defaults to 20. */
  readonly signalCount?: number;
  /** Interval between signals in ms. Defaults to 100. */
  readonly intervalMs?: number;
  /** Signal types to randomly pick from. Defaults to all 7 types. */
  readonly types?: readonly SignalType[];
  /** Agent identifier. Defaults to "agent-stress". */
  readonly agentId?: string;
}
