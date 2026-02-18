/**
 * Unit tests for binding transition animations.
 *
 * Tests the easing functions, property read/write helpers,
 * and the tick-based animation engine (tickAnims).
 */

import { describe, it, expect, vi } from "vitest";
import type { DisplayObjectHandle } from "../canvas/render-adapter.js";
import { __test__ } from "./run-mode-bindings.js";

const { EASING_FNS, resolveEasing, readHandleProp, writeHandleProp, tickAnims, extractNumericValue, applyMapping } = __test__;

// ---------------------------------------------------------------------------
// Mock handle factory
// ---------------------------------------------------------------------------

function createMockHandle(overrides?: Partial<DisplayObjectHandle>): DisplayObjectHandle {
  let scaleX = 1;
  let scaleY = 1;
  return {
    x: 0,
    y: 0,
    visible: true,
    alpha: 1,
    tint: 0xffffff,
    rotation: 0,
    scale: {
      get x() { return scaleX; },
      set x(v: number) { scaleX = v; },
      get y() { return scaleY; },
      set y(v: number) { scaleY = v; },
      set(x: number, y?: number) {
        scaleX = x;
        scaleY = y ?? x;
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Easing functions
// ---------------------------------------------------------------------------

describe("easing functions", () => {
  it("linear returns identity", () => {
    expect(EASING_FNS["linear"]!(0)).toBe(0);
    expect(EASING_FNS["linear"]!(0.5)).toBe(0.5);
    expect(EASING_FNS["linear"]!(1)).toBe(1);
  });

  it("easeIn starts slow", () => {
    const fn = EASING_FNS["easeIn"]!;
    expect(fn(0)).toBe(0);
    expect(fn(0.5)).toBeLessThan(0.5);
    expect(fn(1)).toBe(1);
  });

  it("easeOut starts fast", () => {
    const fn = EASING_FNS["easeOut"]!;
    expect(fn(0)).toBe(0);
    expect(fn(0.5)).toBeGreaterThan(0.5);
    expect(fn(1)).toBe(1);
  });

  it("easeInOut is symmetric", () => {
    const fn = EASING_FNS["easeInOut"]!;
    expect(fn(0)).toBe(0);
    expect(fn(0.5)).toBe(0.5);
    expect(fn(1)).toBe(1);
    // First half should be slower than linear
    expect(fn(0.25)).toBeLessThan(0.25);
    // Second half should be faster than linear
    expect(fn(0.75)).toBeGreaterThan(0.75);
  });

  it("arc peaks at midpoint and returns to 0", () => {
    const fn = EASING_FNS["arc"]!;
    expect(fn(0)).toBeCloseTo(0, 5);
    expect(fn(0.5)).toBeCloseTo(1, 5);
    expect(fn(1)).toBeCloseTo(0, 5);
  });

  it("resolveEasing falls back to linear for unknown names", () => {
    const fn = resolveEasing("nonexistent");
    expect(fn(0.5)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Property read/write helpers
// ---------------------------------------------------------------------------

describe("readHandleProp / writeHandleProp", () => {
  it("reads and writes alpha", () => {
    const h = createMockHandle({ alpha: 0.7 });
    expect(readHandleProp(h, "alpha")).toBe(0.7);
    writeHandleProp(h, "alpha", 0.3);
    expect(h.alpha).toBe(0.3);
  });

  it("reads and writes rotation", () => {
    const h = createMockHandle({ rotation: 1.5 });
    expect(readHandleProp(h, "rotation")).toBe(1.5);
    writeHandleProp(h, "rotation", 3.0);
    expect(h.rotation).toBe(3.0);
  });

  it("reads and writes scale via scale.x / scale.set", () => {
    const h = createMockHandle();
    h.scale.set(2);
    expect(readHandleProp(h, "scale")).toBe(2);
    writeHandleProp(h, "scale", 3);
    expect(h.scale.x).toBe(3);
    expect(h.scale.y).toBe(3);
  });

  it("reads and writes x", () => {
    const h = createMockHandle({ x: 100 });
    expect(readHandleProp(h, "x")).toBe(100);
    writeHandleProp(h, "x", 200);
    expect(h.x).toBe(200);
  });

  it("reads and writes y", () => {
    const h = createMockHandle({ y: 50 });
    expect(readHandleProp(h, "y")).toBe(50);
    writeHandleProp(h, "y", 75);
    expect(h.y).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// tickAnims — core animation engine
// ---------------------------------------------------------------------------

describe("tickAnims", () => {
  it("interpolates a value over time with linear easing", () => {
    const handle = createMockHandle({ alpha: 1.0 });
    const anims = new Map<string, InstanceType<typeof Object>>();
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const noop = () => {};

    anims.set("ent1:alpha", {
      handle,
      prop: "alpha" as const,
      fromValue: 1.0,
      toValue: 0.0,
      durationMs: 100,
      easingFn: EASING_FNS["linear"]!,
      elapsed: 0,
    });

    // Advance 50ms (halfway)
    tickAnims(50, anims as never, timeouts, {} as never, noop);
    expect(handle.alpha).toBeCloseTo(0.5, 2);
    expect(anims.size).toBe(1);

    // Advance another 50ms (complete)
    tickAnims(50, anims as never, timeouts, {} as never, noop);
    expect(handle.alpha).toBe(0.0);
    expect(anims.size).toBe(0);
  });

  it("applies easeOut curve", () => {
    const handle = createMockHandle();
    handle.scale.set(1);
    const anims = new Map();
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const noop = () => {};

    anims.set("ent1:scale", {
      handle,
      prop: "scale",
      fromValue: 1.0,
      toValue: 2.0,
      durationMs: 200,
      easingFn: EASING_FNS["easeOut"]!,
      elapsed: 0,
    });

    // Advance 100ms (halfway through time)
    tickAnims(100, anims, timeouts, {} as never, noop);
    // easeOut at t=0.5: 1 - (1-0.5)^2 = 0.75, so value = 1 + 0.75 * 1 = 1.75
    expect(handle.scale.x).toBeCloseTo(1.75, 2);
  });

  it("interrupts an existing animation on the same key", () => {
    const handle = createMockHandle({ alpha: 1.0 });
    const anims = new Map();
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const noop = () => {};

    // First animation: alpha 1→0 over 200ms
    anims.set("ent1:alpha", {
      handle,
      prop: "alpha",
      fromValue: 1.0,
      toValue: 0.0,
      durationMs: 200,
      easingFn: EASING_FNS["linear"]!,
      elapsed: 0,
    });

    // Tick 100ms → alpha = 0.5
    tickAnims(100, anims, timeouts, {} as never, noop);
    expect(handle.alpha).toBeCloseTo(0.5, 2);

    // Interrupt with new animation: alpha from current (0.5) → 1.0
    anims.set("ent1:alpha", {
      handle,
      prop: "alpha",
      fromValue: 0.5,
      toValue: 1.0,
      durationMs: 100,
      easingFn: EASING_FNS["linear"]!,
      elapsed: 0,
    });

    // Tick 50ms → halfway through new animation: 0.5 + 0.5 * 0.5 = 0.75
    tickAnims(50, anims, timeouts, {} as never, noop);
    expect(handle.alpha).toBeCloseTo(0.75, 2);
  });

  it("schedules revert animation after completion", () => {
    vi.useFakeTimers();

    const handle = createMockHandle({ alpha: 1.0 });
    const anims = new Map();
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const ensureTicking = vi.fn();

    anims.set("ent1:alpha", {
      handle,
      prop: "alpha",
      fromValue: 1.0,
      toValue: 0.0,
      durationMs: 100,
      easingFn: EASING_FNS["linear"]!,
      elapsed: 0,
      revert: { delayMs: 50, originalValue: 1.0 },
    });

    // Complete the animation
    tickAnims(100, anims, timeouts, {} as never, ensureTicking);
    expect(handle.alpha).toBe(0.0);
    expect(anims.size).toBe(0);
    expect(timeouts.size).toBe(1);

    // Wait for revert delay
    vi.advanceTimersByTime(50);

    // Revert animation should now be queued
    expect(anims.size).toBe(1);
    expect(ensureTicking).toHaveBeenCalled();

    const revertAnim = anims.get("ent1:alpha");
    expect(revertAnim).toBeDefined();
    expect(revertAnim.fromValue).toBe(0.0);
    expect(revertAnim.toValue).toBe(1.0);

    // Run the revert animation
    tickAnims(100, anims, timeouts, {} as never, ensureTicking);
    expect(handle.alpha).toBe(1.0);
    expect(anims.size).toBe(0);

    vi.useRealTimers();
  });

  it("snaps to final value on overshoot", () => {
    const handle = createMockHandle({ x: 0 });
    const anims = new Map();
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const noop = () => {};

    anims.set("ent1:x", {
      handle,
      prop: "x",
      fromValue: 0,
      toValue: 100,
      durationMs: 50,
      easingFn: EASING_FNS["linear"]!,
      elapsed: 0,
    });

    // Overshoot: pass 200ms for a 50ms animation
    tickAnims(200, anims, timeouts, {} as never, noop);
    expect(handle.x).toBe(100);
    expect(anims.size).toBe(0);
  });

  it("handles multiple simultaneous animations on different properties", () => {
    const handle = createMockHandle({ alpha: 1.0, rotation: 0 });
    const anims = new Map();
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const noop = () => {};

    anims.set("ent1:alpha", {
      handle,
      prop: "alpha",
      fromValue: 1.0,
      toValue: 0.5,
      durationMs: 100,
      easingFn: EASING_FNS["linear"]!,
      elapsed: 0,
    });

    anims.set("ent1:rotation", {
      handle,
      prop: "rotation",
      fromValue: 0,
      toValue: Math.PI,
      durationMs: 200,
      easingFn: EASING_FNS["linear"]!,
      elapsed: 0,
    });

    tickAnims(100, anims, timeouts, {} as never, noop);

    // Alpha should be done (100/100)
    expect(handle.alpha).toBe(0.5);
    // Rotation should be halfway (100/200)
    expect(handle.rotation).toBeCloseTo(Math.PI / 2, 5);
    // Alpha animation removed, rotation still running
    expect(anims.size).toBe(1);

    tickAnims(100, anims, timeouts, {} as never, noop);
    expect(handle.rotation).toBeCloseTo(Math.PI, 5);
    expect(anims.size).toBe(0);
  });

  it("handles zero-duration animation as instant snap", () => {
    const handle = createMockHandle({ alpha: 1.0 });
    const anims = new Map();
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const noop = () => {};

    anims.set("ent1:alpha", {
      handle,
      prop: "alpha",
      fromValue: 1.0,
      toValue: 0.0,
      durationMs: 16,
      easingFn: EASING_FNS["linear"]!,
      elapsed: 0,
    });

    tickAnims(16, anims, timeouts, {} as never, noop);
    expect(handle.alpha).toBe(0.0);
    expect(anims.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// extractNumericValue
// ---------------------------------------------------------------------------

describe("extractNumericValue", () => {
  it("strategy 0: explicit sourceField", () => {
    expect(extractNumericValue({ velocity: 100, note: 60 }, "opacity", "velocity")).toBe(100);
  });

  it("strategy 1: binding property last segment", () => {
    expect(extractNumericValue({ x: 42 }, "position.x")).toBe(42);
  });

  it("strategy 2: conventional 'value' field", () => {
    expect(extractNumericValue({ value: 64, channel: 1 }, "opacity")).toBe(64);
  });

  it("strategy 3: first numeric field in payload", () => {
    expect(extractNumericValue({ label: "hello", amount: 77 }, "opacity")).toBe(77);
  });

  it("returns null when payload has no numeric values", () => {
    expect(extractNumericValue({ label: "hello" }, "opacity")).toBeNull();
  });

  it("sourceField miss falls through to subsequent strategies", () => {
    // sourceField "missing" is not in payload, but "value" is → strategy 2
    expect(extractNumericValue({ value: 50 }, "opacity", "missing")).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// applyMapping
// ---------------------------------------------------------------------------

describe("applyMapping", () => {
  it("lerp maps input range to output range", () => {
    const result = applyMapping(64, { fn: "lerp", inputRange: [0, 127], outputRange: [0, 1] });
    expect(result).toBeCloseTo(64 / 127, 4);
  });

  it("clamp keeps value within output range", () => {
    expect(applyMapping(200, { fn: "clamp", inputRange: [0, 127], outputRange: [0, 1] })).toBe(1);
    expect(applyMapping(-10, { fn: "clamp", inputRange: [0, 127], outputRange: [0, 1] })).toBe(0);
  });

  it("step snaps to min or max at midpoint", () => {
    expect(applyMapping(63, { fn: "step", inputRange: [0, 127], outputRange: [0, 1] })).toBe(0);
    expect(applyMapping(64, { fn: "step", inputRange: [0, 127], outputRange: [0, 1] })).toBe(1);
  });

  it("smoothstep produces S-curve interpolation", () => {
    const mid = applyMapping(63.5, { fn: "smoothstep", inputRange: [0, 127], outputRange: [0, 1] });
    expect(mid).toBeCloseTo(0.5, 1);
    // smoothstep should be near 0.5 at midpoint
  });

  it("zero input range returns outMin", () => {
    expect(applyMapping(5, { fn: "lerp", inputRange: [5, 5], outputRange: [0, 1] })).toBe(0);
  });
});
