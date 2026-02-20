/**
 * BrowserClock unit tests.
 *
 * Mocks `performance.now`, `requestAnimationFrame`, and `cancelAnimationFrame`
 * to verify the BrowserClock implementation without a real browser.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserClock } from "./browser-clock.js";

describe("BrowserClock", () => {
  let originalRaf: typeof globalThis.requestAnimationFrame;
  let originalCaf: typeof globalThis.cancelAnimationFrame;
  let originalPerformanceNow: typeof performance.now;

  beforeEach(() => {
    originalRaf = globalThis.requestAnimationFrame;
    originalCaf = globalThis.cancelAnimationFrame;
    originalPerformanceNow = performance.now;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
    performance.now = originalPerformanceNow;
  });

  it("now() returns performance.now()", () => {
    performance.now = vi.fn(() => 42.5);
    const clock = new BrowserClock();
    expect(clock.now()).toBe(42.5);
    expect(performance.now).toHaveBeenCalled();
  });

  it("requestFrame() calls requestAnimationFrame and returns a cancel handle", () => {
    const callback = vi.fn();
    globalThis.requestAnimationFrame = vi.fn(() => 7);
    globalThis.cancelAnimationFrame = vi.fn();

    const clock = new BrowserClock();
    const handle = clock.requestFrame(callback);

    expect(globalThis.requestAnimationFrame).toHaveBeenCalledWith(callback);
    expect(handle).toHaveProperty("cancel");

    handle.cancel();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(7);
  });

  it("cancel handle calls cancelAnimationFrame with the correct id", () => {
    globalThis.requestAnimationFrame = vi.fn(() => 99);
    globalThis.cancelAnimationFrame = vi.fn();

    const clock = new BrowserClock();
    const handle = clock.requestFrame(() => {});

    handle.cancel();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(99);
  });
});
