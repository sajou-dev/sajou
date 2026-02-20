/**
 * Scheduler — the choreographer's frame loop and performance manager.
 *
 * Manages active performances (running choreography instances), advances
 * them each frame, emits commands via the CommandSink, and handles
 * interruptions.
 */

import type { CancelHandle, Clock } from "./clock.js";
import type { CommandSink } from "./commands.js";
import { getEasing, linear } from "./easing.js";
import { resolveEntityRef, resolveParams } from "./resolver.js";
import type {
  ActionStep,
  ChoreographyDefinition,
  ChoreographyStep,
  OnArriveStep,
  OnInterruptStep,
  ParallelStep,
  Performance,
  PerformanceSignal,
  StepCursor,
} from "./types.js";

/** Internal counter for generating unique performance IDs. */
let performanceIdCounter = 0;

/** Actions that are instant (no duration, no frame updates). */
const INSTANT_ACTIONS = new Set(["spawn", "destroy", "playSound", "setAnimation"]);

/**
 * Creates a unique performance ID.
 * Uses a simple counter — no UUID dependency needed.
 */
function nextPerformanceId(): string {
  return `perf-${++performanceIdCounter}`;
}

/**
 * Reset the performance ID counter.
 * Only for tests — ensures deterministic IDs.
 */
export function resetPerformanceIdCounter(): void {
  performanceIdCounter = 0;
}

/**
 * The scheduler manages the frame loop and active performances.
 *
 * It does not own the registry or know about signal types — it receives
 * pre-matched choreography definitions and their triggering signals.
 */
export class Scheduler {
  private readonly clock: Clock;
  private readonly sink: CommandSink;
  private readonly performances = new Map<string, Performance>();
  private frameHandle: CancelHandle | null = null;
  private running = false;

  constructor(clock: Clock, sink: CommandSink) {
    this.clock = clock;
    this.sink = sink;
  }

  /**
   * Start a new performance for a choreography definition triggered by a signal.
   */
  startPerformance(
    definition: ChoreographyDefinition,
    signal: PerformanceSignal,
    correlationId: string | undefined,
  ): Performance {
    const interruptSteps = extractInterruptSteps(definition.steps);
    const executableSteps = filterExecutableSteps(definition.steps);

    const performance: Performance = {
      id: nextPerformanceId(),
      definition,
      signal,
      correlationId,
      interruptSteps,
      state: {
        cursor: createCursor(executableSteps),
        interrupted: false,
        done: false,
      },
    };

    this.performances.set(performance.id, performance);
    this.ensureRunning();
    return performance;
  }

  /**
   * Interrupt all active performances with the given correlationId.
   * Fires their onInterrupt handlers and emits interrupt commands.
   */
  interruptByCorrelationId(correlationId: string, interruptedBy: string): void {
    for (const performance of this.performances.values()) {
      if (performance.correlationId === correlationId && !performance.state.done) {
        this.interruptPerformance(performance, correlationId, interruptedBy);
      }
    }
  }

  /** Number of currently active (non-done) performances. */
  get activeCount(): number {
    return this.performances.size;
  }

  /** Stop the frame loop and clear all performances. */
  dispose(): void {
    this.performances.clear();
    this.stopLoop();
  }

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------

  private ensureRunning(): void {
    if (!this.running) {
      this.running = true;
      this.scheduleFrame();
    }
  }

  private scheduleFrame(): void {
    this.frameHandle = this.clock.requestFrame((timestamp) => {
      this.tick(timestamp);
    });
  }

  private stopLoop(): void {
    this.running = false;
    if (this.frameHandle) {
      this.frameHandle.cancel();
      this.frameHandle = null;
    }
  }

  private tick(timestamp: number): void {
    // Advance all active performances
    for (const performance of this.performances.values()) {
      if (!performance.state.done) {
        this.advancePerformance(performance, timestamp);
      }
    }

    // Clean up completed performances
    for (const [id, performance] of this.performances) {
      if (performance.state.done) {
        this.performances.delete(id);
      }
    }

    // Continue loop if there are still active performances
    if (this.performances.size > 0) {
      this.scheduleFrame();
    } else {
      this.stopLoop();
    }
  }

  // ---------------------------------------------------------------------------
  // Performance advancement
  // ---------------------------------------------------------------------------

  private advancePerformance(performance: Performance, timestamp: number): void {
    const { state, signal } = performance;
    this.advanceCursor(performance.id, state.cursor, signal, timestamp);

    // Check if cursor is done
    if (isCursorDone(state.cursor)) {
      state.done = true;
    }
  }

  private advanceCursor(
    performanceId: string,
    cursor: StepCursor,
    signal: PerformanceSignal,
    timestamp: number,
  ): void {
    // If we're past the end, nothing to do
    if (cursor.index >= cursor.steps.length) {
      return;
    }

    // If there's a parallel group active, advance its children
    if (cursor.children) {
      let allDone = true;
      for (const child of cursor.children) {
        this.advanceCursor(performanceId, child, signal, timestamp);
        if (!isCursorDone(child)) {
          allDone = false;
        }
      }
      if (allDone) {
        cursor.children = null;
        cursor.index++;
        // Try to advance to the next step immediately
        this.advanceCursor(performanceId, cursor, signal, timestamp);
      }
      return;
    }

    const step = cursor.steps[cursor.index];
    if (!step) {
      return;
    }

    // Handle structural steps
    if (step.action === "parallel") {
      const parallelStep = step as ParallelStep;
      cursor.children = parallelStep.steps.map((s) => createCursor([s]));
      // Advance children immediately in this tick
      this.advanceCursor(performanceId, cursor, signal, timestamp);
      return;
    }

    if (step.action === "wait") {
      // Wait is an animated action internally — uses duration but emits no commands
      if (!cursor.activeAction) {
        const duration = typeof step.duration === "number" ? step.duration : 0;
        cursor.activeAction = {
          step: step as ActionStep,
          entityRef: "",
          params: {},
          startTime: timestamp,
          duration,
          easing: "linear",
          started: true,
        };
      }
      const elapsed = timestamp - cursor.activeAction.startTime;
      if (elapsed >= cursor.activeAction.duration) {
        cursor.activeAction = null;
        cursor.index++;
        this.advanceCursor(performanceId, cursor, signal, timestamp);
      }
      return;
    }

    if (step.action === "onArrive") {
      // onArrive is a continuation — flatten its steps into the cursor
      const arriveStep = step as OnArriveStep;
      const remaining = cursor.steps.slice(cursor.index + 1);
      cursor.steps = [...arriveStep.steps, ...remaining];
      cursor.index = 0;
      cursor.activeAction = null;
      cursor.children = null;
      this.advanceCursor(performanceId, cursor, signal, timestamp);
      return;
    }

    // Regular action step
    const actionStep = step as ActionStep;

    // Handle delay — wait before starting the action
    const delayMs = typeof actionStep.delay === "number" ? actionStep.delay : 0;
    if (delayMs > 0) {
      if (cursor.delayUntil === null) {
        // Start the delay timer
        cursor.delayUntil = timestamp + delayMs;
        return;
      }
      if (timestamp < cursor.delayUntil) {
        // Still waiting
        return;
      }
      // Delay expired — clear and proceed to action
      cursor.delayUntil = null;
    }

    const isInstant = INSTANT_ACTIONS.has(actionStep.action) || actionStep.duration === undefined;

    if (isInstant) {
      this.executeInstantAction(performanceId, actionStep, signal);
      cursor.index++;
      // Try to advance to the next step immediately
      this.advanceCursor(performanceId, cursor, signal, timestamp);
      return;
    }

    // Animated action
    this.advanceAnimatedAction(performanceId, cursor, actionStep, signal, timestamp);
  }

  // ---------------------------------------------------------------------------
  // Action execution
  // ---------------------------------------------------------------------------

  private executeInstantAction(
    performanceId: string,
    step: ActionStep,
    signal: PerformanceSignal,
  ): void {
    const entityRef = resolveEntityRef(step.entity ?? step.target, signal);
    const params = resolveStepParams(step, signal);

    this.sink.onActionExecute({
      performanceId,
      action: step.action,
      entityRef,
      params,
    });
  }

  private advanceAnimatedAction(
    performanceId: string,
    cursor: StepCursor,
    step: ActionStep,
    signal: PerformanceSignal,
    timestamp: number,
  ): void {
    // Initialize active action if not yet started
    if (!cursor.activeAction) {
      const entityRef = resolveEntityRef(step.entity ?? step.target, signal);
      const params = resolveStepParams(step, signal);
      const easingName = typeof step.easing === "string" ? step.easing : "linear";
      const duration = typeof step.duration === "number" ? step.duration : 0;

      cursor.activeAction = {
        step,
        entityRef,
        params,
        startTime: timestamp,
        duration,
        easing: easingName,
        started: false,
      };
    }

    const active = cursor.activeAction;

    // Emit start command on first frame
    if (!active.started) {
      active.started = true;
      this.sink.onActionStart({
        performanceId,
        action: active.step.action,
        entityRef: active.entityRef,
        params: active.params,
        duration: active.duration,
        easing: active.easing,
      });
    }

    // Compute progress
    const elapsed = timestamp - active.startTime;
    const rawProgress = active.duration > 0
      ? Math.min(elapsed / active.duration, 1)
      : 1;
    const easingFn = getEasing(active.easing) ?? linear;
    const progress = easingFn(rawProgress);

    if (rawProgress < 1) {
      // Still animating — emit update
      this.sink.onActionUpdate({
        performanceId,
        action: active.step.action,
        entityRef: active.entityRef,
        params: active.params,
        progress,
        elapsed,
      });
    } else {
      // Action complete
      this.sink.onActionComplete({
        performanceId,
        action: active.step.action,
        entityRef: active.entityRef,
        params: active.params,
      });
      cursor.activeAction = null;
      cursor.index++;
      // Try to advance to the next step immediately
      this.advanceCursor(performanceId, cursor, signal, timestamp);
    }
  }

  // ---------------------------------------------------------------------------
  // Interruption
  // ---------------------------------------------------------------------------

  private interruptPerformance(
    performance: Performance,
    correlationId: string,
    interruptedBy: string,
  ): void {
    performance.state.interrupted = true;
    performance.state.done = true;

    this.sink.onInterrupt({
      performanceId: performance.id,
      correlationId,
      interruptedBy,
    });

    // Run onInterrupt steps as a new mini-performance
    if (performance.interruptSteps.length > 0) {
      const interruptPerf: Performance = {
        id: nextPerformanceId(),
        definition: performance.definition,
        signal: performance.signal,
        correlationId: undefined, // Interrupt handlers can't be interrupted
        interruptSteps: [],
        state: {
          cursor: createCursor(performance.interruptSteps),
          interrupted: false,
          done: false,
        },
      };
      this.performances.set(interruptPerf.id, interruptPerf);
      this.ensureRunning();
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh step cursor for a list of steps. */
function createCursor(steps: readonly ChoreographyStep[]): StepCursor {
  return {
    // Copy to mutable array since onArrive may splice
    steps: [...steps],
    index: 0,
    activeAction: null,
    children: null,
    delayUntil: null,
  };
}

/** Check whether a cursor has finished executing all its steps. */
function isCursorDone(cursor: StepCursor): boolean {
  if (cursor.children) {
    return false; // Parallel group still running
  }
  return cursor.index >= cursor.steps.length;
}

/**
 * Extract onInterrupt steps from a choreography's top-level steps.
 * These are removed from the normal execution flow and stored separately.
 */
function extractInterruptSteps(
  steps: readonly ChoreographyStep[],
): readonly ChoreographyStep[] {
  const result: ChoreographyStep[] = [];
  for (const step of steps) {
    if (step.action === "onInterrupt") {
      result.push(...(step as OnInterruptStep).steps);
    }
  }
  return result;
}

/**
 * Filter out onInterrupt steps from the executable step list.
 * onInterrupt handlers are stored separately and only run on interruption.
 */
function filterExecutableSteps(
  steps: readonly ChoreographyStep[],
): readonly ChoreographyStep[] {
  return steps.filter((s) => s.action !== "onInterrupt");
}

/**
 * Extract resolved parameters from an action step, excluding structural fields.
 */
function resolveStepParams(
  step: ActionStep,
  signal: PerformanceSignal,
): Record<string, unknown> {
  const excluded = new Set(["action", "entity", "target", "delay", "duration", "easing", "steps"]);
  const raw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(step)) {
    if (!excluded.has(key)) {
      raw[key] = value;
    }
  }
  return resolveParams(raw, signal);
}

