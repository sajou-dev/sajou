/**
 * TestClock — deterministic clock for choreographer tests.
 *
 * Allows manual time advancement. When `advance(ms)` is called,
 * all scheduled frame callbacks fire synchronously with the new timestamp.
 * No real timers are involved — tests are instant and deterministic.
 */

import type { CancelHandle, Clock } from "./clock.js";

/**
 * A clock that advances time only when explicitly told to.
 * Frame callbacks fire synchronously during `advance()`.
 *
 * @example
 * ```ts
 * const clock = new TestClock();
 * const choreographer = new Choreographer({ clock });
 *
 * choreographer.handleSignal(signal);
 * clock.advance(500); // jumps 500ms, fires all frame callbacks
 * // assert commands emitted so far
 * clock.advance(500); // jump another 500ms
 * // assert final state
 * ```
 */
export class TestClock implements Clock {
  private currentTime = 0;
  private nextId = 1;
  private scheduled = new Map<number, (timestamp: number) => void>();

  /** Current time in milliseconds. Starts at 0. */
  now(): number {
    return this.currentTime;
  }

  /** Schedule a callback for the next frame. */
  requestFrame(callback: (timestamp: number) => void): CancelHandle {
    const id = this.nextId++;
    this.scheduled.set(id, callback);
    return {
      cancel: () => {
        this.scheduled.delete(id);
      },
    };
  }

  /**
   * Advance time by the given number of milliseconds.
   *
   * All pending frame callbacks fire synchronously at the new timestamp.
   * Callbacks scheduled during execution are collected and fired in the
   * next `advance()` call (not re-entrant within the same advance).
   */
  advance(ms: number): void {
    this.currentTime += ms;
    // Snapshot current callbacks — new ones scheduled during execution
    // will fire on the next advance() call.
    const callbacks = new Map(this.scheduled);
    this.scheduled.clear();
    for (const callback of callbacks.values()) {
      callback(this.currentTime);
    }
  }

  /** Number of currently pending frame callbacks. */
  get pendingCount(): number {
    return this.scheduled.size;
  }
}
