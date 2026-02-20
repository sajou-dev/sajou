/**
 * Scenario runner — plays a scenario's timeline with realistic delays.
 *
 * Decoupled from WebSocket: takes a callback for each emitted signal.
 * Supports loop mode for continuous replay.
 */

import type { SignalEvent } from "@sajou/schema";
import type { Scenario } from "./scenarios/types.js";
import { createSignal, resetCounter } from "./signal-factory.js";

/** Options for running a scenario. */
export interface RunnerOptions {
  /** If true, restart the scenario after completion. Defaults to false. */
  readonly loop?: boolean;
  /** Milliseconds to wait between loop iterations. Defaults to 3000. */
  readonly loopGapMs?: number;
  /** Speed multiplier. 1 = real-time, 2 = double speed, 0.5 = half speed. Defaults to 1. */
  readonly speed?: number;
}

/** Handle returned by `runScenario` to control playback. */
export interface RunnerHandle {
  /** Stops playback. Pending delays are cancelled. */
  stop: () => void;
  /** Promise that resolves when playback finishes (or never if looping). */
  done: Promise<void>;
}

/**
 * Runs a scenario, emitting signals via the provided callback.
 *
 * @param scenario - The scenario to play
 * @param onSignal - Called for each emitted signal
 * @param options - Playback options (loop, speed, etc.)
 * @returns A handle to stop playback and await completion
 */
export function runScenario(
  scenario: Scenario,
  onSignal: (signal: SignalEvent) => void,
  options?: RunnerOptions,
): RunnerHandle {
  const loop = options?.loop ?? false;
  const loopGapMs = options?.loopGapMs ?? 3000;
  const speed = options?.speed ?? 1;

  let stopped = false;
  let currentTimeout: ReturnType<typeof setTimeout> | undefined;
  let currentResolve: (() => void) | undefined;

  const stop = (): void => {
    stopped = true;
    if (currentTimeout !== undefined) {
      clearTimeout(currentTimeout);
      currentTimeout = undefined;
    }
    // Unblock any pending delay so the run loop can exit
    if (currentResolve) {
      currentResolve();
      currentResolve = undefined;
    }
  };

  const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      if (stopped) {
        resolve();
        return;
      }
      currentResolve = resolve;
      const adjusted = Math.round(ms / speed);
      currentTimeout = setTimeout(() => {
        currentTimeout = undefined;
        currentResolve = undefined;
        resolve();
      }, adjusted);
    });

  const playOnce = async (): Promise<void> => {
    resetCounter();
    for (const step of scenario.steps) {
      if (stopped) return;

      if (step.delayMs > 0) {
        await delay(step.delayMs);
        if (stopped) return;
      }

      const signal = createSignal(step.type, step.payload, {
        correlationId: step.correlationId,
      });
      onSignal(signal as SignalEvent);
    }
  };

  const run = async (): Promise<void> => {
    do {
      await playOnce();
      if (loop && !stopped) {
        await delay(loopGapMs);
      }
    } while (loop && !stopped);
  };

  const done = run();

  return { stop, done };
}
