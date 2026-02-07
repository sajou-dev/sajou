/**
 * BrowserClock — real-time clock for running the choreographer in the browser.
 *
 * Uses `performance.now()` for timestamps and `requestAnimationFrame` for
 * frame scheduling. This is the production clock — see `TestClock` for tests.
 */

import type { CancelHandle, Clock } from "./clock.js";

/**
 * A clock backed by the browser's `performance.now()` and `requestAnimationFrame`.
 *
 * @example
 * ```ts
 * const clock = new BrowserClock();
 * const choreographer = new Choreographer({ clock, sink });
 * // choreographer now ticks at ~60fps via requestAnimationFrame
 * ```
 */
export class BrowserClock implements Clock {
  /** Current monotonic time in milliseconds. */
  now(): number {
    return performance.now();
  }

  /**
   * Schedule a callback on the next animation frame.
   *
   * @param callback - Receives the current timestamp in ms.
   * @returns A handle to cancel the scheduled callback.
   */
  requestFrame(callback: (timestamp: number) => void): CancelHandle {
    const id = requestAnimationFrame(callback);
    return { cancel: () => cancelAnimationFrame(id) };
  }
}
