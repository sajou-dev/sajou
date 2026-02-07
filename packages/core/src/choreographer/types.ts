/**
 * Choreography definition types — the JSON format interpreted by the runtime.
 *
 * These types describe the shape of choreography JSON files.
 * A choreography triggers on a signal type and executes a sequence of steps.
 */

import type { EasingName } from "./easing.js";

/**
 * A choreography definition — a declarative description of visual actions
 * triggered by a signal type.
 *
 * @example
 * ```json
 * {
 *   "on": "task_dispatch",
 *   "steps": [
 *     { "action": "move", "entity": "agent", "to": "signal.to", "duration": 800 }
 *   ]
 * }
 * ```
 */
export interface ChoreographyDefinition {
  /** The signal type that triggers this choreography. */
  readonly on: string;
  /**
   * When true, this choreography interrupts all active performances
   * sharing the same correlationId as the incoming signal.
   */
  readonly interrupts?: boolean;
  /** The sequence of steps to execute when triggered. */
  readonly steps: readonly ChoreographyStep[];
}

/**
 * A single step in a choreography. Can be an action or a structural element
 * (parallel group, onArrive continuation, onInterrupt handler).
 */
export type ChoreographyStep =
  | ActionStep
  | ParallelStep
  | OnArriveStep
  | OnInterruptStep;

/** Base fields shared by all action steps. */
interface ActionStepBase {
  /** The action to perform. Must match a registered primitive. */
  readonly action: string;
  /** Logical entity reference. May contain signal.* references. */
  readonly entity?: string;
  /** Target entity reference (for actions like flash). */
  readonly target?: string;
}

/**
 * An animated or instant action step.
 *
 * Animated actions have a `duration` and optional `easing`.
 * Instant actions (spawn, destroy, playSound) have no duration.
 * Additional parameters are passed through as `[key: string]: unknown`.
 */
export interface ActionStep extends ActionStepBase {
  readonly action: Exclude<string, "parallel" | "onArrive" | "onInterrupt">;
  /** Duration in milliseconds. Absence means instant action. */
  readonly duration?: number;
  /** Easing function name. Defaults to "linear" if not specified. */
  readonly easing?: EasingName | string;
  /** Additional action-specific parameters (to, from, color, sound, etc.). */
  readonly [key: string]: unknown;
}

/** A group of steps that execute concurrently. Completes when all children complete. */
export interface ParallelStep {
  readonly action: "parallel";
  readonly steps: readonly ChoreographyStep[];
}

/**
 * Continuation steps that execute after the preceding animated action completes.
 * Functionally equivalent to appending steps after the animation, but reads
 * more clearly in JSON ("when the pigeon arrives, do X").
 */
export interface OnArriveStep {
  readonly action: "onArrive";
  readonly steps: readonly ChoreographyStep[];
}

/**
 * Handler steps that execute if the performance is interrupted.
 * Never runs on normal completion. Attached to the performance, not to a step.
 */
export interface OnInterruptStep {
  readonly action: "onInterrupt";
  readonly steps: readonly ChoreographyStep[];
}

/**
 * A running choreography instance — created when a signal matches a definition.
 * Tracks execution state: which step we're on, timing info, etc.
 */
export interface Performance {
  /** Unique ID for this performance instance. */
  readonly id: string;
  /** The choreography definition being executed. */
  readonly definition: ChoreographyDefinition;
  /** The signal that triggered this performance. */
  readonly signal: PerformanceSignal;
  /** The correlationId from the signal, if any. Used for interruption scoping. */
  readonly correlationId: string | undefined;
  /** Steps extracted from onInterrupt handlers, to run if interrupted. */
  readonly interruptSteps: readonly ChoreographyStep[];
  /** Mutable execution state. */
  state: PerformanceState;
}

/** Signal data attached to a performance for reference resolution. */
export interface PerformanceSignal {
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Execution state of a performance — mutated by the scheduler. */
export interface PerformanceState {
  /** Current step runner (handles sequencing within the step list). */
  cursor: StepCursor;
  /** Whether this performance has been interrupted. */
  interrupted: boolean;
  /** Whether this performance has completed (all steps done or interrupted). */
  done: boolean;
}

/**
 * Tracks progress through a list of steps.
 * Supports sequential and parallel execution.
 */
export interface StepCursor {
  /** The steps being executed. Mutable because onArrive flattens steps in place. */
  steps: ChoreographyStep[];
  /** Index of the current step. */
  index: number;
  /** State of the current animated action, if any. */
  activeAction: ActiveAction | null;
  /** For parallel steps: cursors for each child. */
  children: StepCursor[] | null;
}

/** Timing state for an in-progress animated action. */
export interface ActiveAction {
  /** The step being animated. */
  readonly step: ActionStep;
  /** Resolved entity reference. */
  readonly entityRef: string;
  /** Resolved action parameters. */
  readonly params: Readonly<Record<string, unknown>>;
  /** Timestamp (from clock) when this action started. */
  readonly startTime: number;
  /** Duration in milliseconds. */
  readonly duration: number;
  /** Name of the easing function. */
  readonly easing: string;
  /** Whether onActionStart has been emitted. */
  started: boolean;
}
