/**
 * Clock abstraction for the choreographer runtime.
 *
 * Allows the choreographer to run in browser (requestAnimationFrame),
 * Node.js (setTimeout), or tests (manual time advancement).
 */

/** Handle returned by scheduling operations. Call `cancel()` to unschedule. */
export interface CancelHandle {
  cancel(): void;
}

/**
 * Time source and frame scheduler for the choreographer.
 *
 * The choreographer never calls `Date.now()` or `requestAnimationFrame` directly —
 * it always goes through a Clock. This makes the runtime environment-agnostic
 * and fully testable with deterministic time.
 */
export interface Clock {
  /** Current time in milliseconds (monotonic). */
  now(): number;

  /**
   * Request a callback on the next frame.
   * In browser: wraps requestAnimationFrame.
   * In tests: fires when time is manually advanced.
   *
   * @param callback - Receives the current timestamp in ms.
   * @returns A handle to cancel the scheduled callback.
   */
  requestFrame(callback: (timestamp: number) => void): CancelHandle;
}
