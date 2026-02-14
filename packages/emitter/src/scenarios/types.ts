/**
 * Types for defining signal emission scenarios.
 *
 * A scenario is a timeline of signals with relative delays.
 * The emitter plays them back with realistic timing.
 */

import type { WellKnownSignalType, SignalPayloadMap } from "@sajou/schema";

/**
 * A single step in a scenario timeline.
 *
 * `delayMs` is the pause *before* emitting this signal,
 * relative to the previous step (not absolute time).
 */
export interface ScenarioStep<T extends WellKnownSignalType = WellKnownSignalType> {
  /** Milliseconds to wait before emitting this signal. */
  readonly delayMs: number;
  /** The signal type. */
  readonly type: T;
  /** The typed payload for this signal type. */
  readonly payload: SignalPayloadMap[T];
  /** Optional correlation ID override. */
  readonly correlationId?: string;
}

/** A named scenario with a sequence of timed signal steps. */
export interface Scenario {
  /** Human-readable name for this scenario. */
  readonly name: string;
  /** Description of what this scenario demonstrates. */
  readonly description: string;
  /** Ordered timeline of signal steps. */
  readonly steps: readonly ScenarioStep[];
}
