/**
 * Browser-based signal simulator runner.
 *
 * Plays back ScenarioStep[] by dispatching signals through the scene-builder's
 * signal pipeline via `dispatchSignal()`. No WebSocket — pure local dispatch.
 */

import type { Scenario, ScenarioStep } from "./types.js";
import { dispatchSignal } from "../views/signal-connection.js";
import type { ReceivedSignal } from "../views/signal-connection.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Playback state. */
export type SimulatorState = "idle" | "playing" | "paused";

/** Progress info emitted on each step. */
export interface SimulatorProgress {
  readonly state: SimulatorState;
  readonly stepIndex: number;
  readonly totalSteps: number;
  readonly scenarioName: string;
}

/** Listener for state/progress changes. */
export type SimulatorListener = (progress: SimulatorProgress) => void;

// ---------------------------------------------------------------------------
// Source identifier for signals injected by the simulator
// ---------------------------------------------------------------------------

const SIMULATOR_SOURCE_ID = "simulator";

// ---------------------------------------------------------------------------
// Runner state
// ---------------------------------------------------------------------------

let state: SimulatorState = "idle";
let currentScenario: Scenario | null = null;
let stepIndex = 0;
let speed = 1;
let timerId: ReturnType<typeof setTimeout> | null = null;
let pauseResolve: (() => void) | null = null;

const listeners: Set<SimulatorListener> = new Set();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Subscribe to progress/state changes. Returns unsubscribe function. */
export function onSimulatorProgress(fn: SimulatorListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Get current progress snapshot. */
export function getSimulatorProgress(): SimulatorProgress {
  return {
    state,
    stepIndex,
    totalSteps: currentScenario?.steps.length ?? 0,
    scenarioName: currentScenario?.name ?? "",
  };
}

/** Start playing a scenario from the beginning. */
export function play(scenario: Scenario): void {
  if (state === "playing") stop();
  currentScenario = scenario;
  stepIndex = 0;
  state = "playing";
  notify();
  runLoop();
}

/** Pause playback. */
export function pause(): void {
  if (state !== "playing") return;
  state = "paused";
  // Clear pending delay timer
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
  notify();
}

/** Resume from paused state. */
export function resume(): void {
  if (state !== "paused") return;
  state = "playing";
  notify();
  // If we were waiting in a pause, resolve the promise to continue the loop
  if (pauseResolve) {
    const resolve = pauseResolve;
    pauseResolve = null;
    resolve();
  }
  runLoop();
}

/** Stop playback and reset. */
export function stop(): void {
  state = "idle";
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
  // Unblock any pending pause wait
  if (pauseResolve) {
    const resolve = pauseResolve;
    pauseResolve = null;
    resolve();
  }
  stepIndex = 0;
  notify();
}

/** Set playback speed multiplier (0.25 – 4). */
export function setSpeed(newSpeed: number): void {
  speed = Math.max(0.25, Math.min(4, newSpeed));
}

/** Get current speed. */
export function getSpeed(): number {
  return speed;
}

// ---------------------------------------------------------------------------
// Internal playback loop
// ---------------------------------------------------------------------------

async function runLoop(): Promise<void> {
  if (!currentScenario) return;
  const scenario = currentScenario;

  while (stepIndex < scenario.steps.length) {
    // Check if we were stopped or paused
    if (state !== "playing") return;

    const step = scenario.steps[stepIndex] as ScenarioStep;

    // Wait for the step's delay (scaled by speed)
    if (step.delayMs > 0) {
      const scaledDelay = Math.round(step.delayMs / speed);
      const shouldContinue = await waitDelay(scaledDelay);
      if (!shouldContinue) return;
    }

    // Double-check state after the delay
    if (state !== "playing") return;

    // Build a ReceivedSignal and dispatch it
    const signal = stepToSignal(step);
    dispatchSignal(signal, SIMULATOR_SOURCE_ID);

    stepIndex++;
    notify();
  }

  // Scenario complete
  state = "idle";
  notify();
}

/** Wait for `ms` milliseconds. Returns false if playback was stopped. */
function waitDelay(ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    timerId = setTimeout(() => {
      timerId = null;
      if (state === "paused") {
        // Park until resume() or stop() is called
        pauseResolve = () => resolve(state === "playing");
      } else if (state === "playing") {
        resolve(true);
      } else {
        // Stopped
        resolve(false);
      }
    }, ms);
  });
}

/** Convert a ScenarioStep to a ReceivedSignal for dispatch. */
function stepToSignal(step: ScenarioStep): ReceivedSignal {
  const id = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload = step.payload as Record<string, unknown>;

  const envelope: Record<string, unknown> = {
    id,
    type: step.type,
    timestamp: Date.now(),
    source: SIMULATOR_SOURCE_ID,
    payload,
  };
  if (step.correlationId) {
    envelope["correlationId"] = step.correlationId;
  }

  return {
    id,
    type: step.type,
    timestamp: Date.now(),
    source: SIMULATOR_SOURCE_ID,
    correlationId: step.correlationId,
    payload,
    raw: JSON.stringify(envelope),
  };
}

/** Notify all listeners of current progress. */
function notify(): void {
  const progress = getSimulatorProgress();
  for (const fn of listeners) fn(progress);
}
