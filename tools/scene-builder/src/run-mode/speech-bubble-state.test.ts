/**
 * Unit tests for speech bubble state + lifecycle.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  appendSpeechText,
  setSpeechText,
  clearSpeechBubble,
  clearAllSpeechBubbles,
  getSpeechBubbles,
  tickSpeechBubbles,
  __test__,
} from "./speech-bubble-state.js";

const {
  CHARS_PER_SEC,
  STREAM_END_IDLE_MS,
  STREAM_BOUNDARY_MS,
  AUTO_DISMISS_MS,
  FADE_DURATION_MS,
  MAX_CHARS,
} = __test__;

beforeEach(() => {
  clearAllSpeechBubbles();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Append / Replace
// ---------------------------------------------------------------------------

describe("appendSpeechText", () => {
  it("creates a new entry on first append", () => {
    appendSpeechText("ent1", "Hello");
    const bubbles = getSpeechBubbles();
    expect(bubbles.size).toBe(1);
    const entry = bubbles.get("ent1")!;
    expect(entry.text).toBe("Hello");
    expect(entry.displayLength).toBe(0);
    expect(entry.phase).toBe("typing");
    expect(entry.opacity).toBe(1);
  });

  it("accumulates text on subsequent appends", () => {
    appendSpeechText("ent1", "Hello ");
    appendSpeechText("ent1", "world");
    const entry = getSpeechBubbles().get("ent1")!;
    expect(entry.text).toBe("Hello world");
  });

  it("respects maxChars truncation", () => {
    const longText = "a".repeat(300);
    appendSpeechText("ent1", longText);
    const entry = getSpeechBubbles().get("ent1")!;
    expect(entry.text.length).toBe(MAX_CHARS);
  });

  it("skips empty deltas", () => {
    appendSpeechText("ent1", "");
    expect(getSpeechBubbles().size).toBe(0);
  });
});

describe("setSpeechText", () => {
  it("replaces existing text", () => {
    appendSpeechText("ent1", "old text");
    setSpeechText("ent1", "new text");
    const entry = getSpeechBubbles().get("ent1")!;
    expect(entry.text).toBe("new text");
    expect(entry.displayLength).toBe(0);
    expect(entry.phase).toBe("typing");
  });

  it("creates entry if none exists", () => {
    setSpeechText("ent2", "hello");
    expect(getSpeechBubbles().has("ent2")).toBe(true);
  });

  it("skips empty text", () => {
    setSpeechText("ent1", "");
    expect(getSpeechBubbles().size).toBe(0);
  });

  it("truncates to maxChars", () => {
    setSpeechText("ent1", "x".repeat(300));
    expect(getSpeechBubbles().get("ent1")!.text.length).toBe(MAX_CHARS);
  });
});

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------

describe("clear", () => {
  it("clearSpeechBubble removes a single entry", () => {
    appendSpeechText("ent1", "a");
    appendSpeechText("ent2", "b");
    clearSpeechBubble("ent1");
    expect(getSpeechBubbles().size).toBe(1);
    expect(getSpeechBubbles().has("ent2")).toBe(true);
  });

  it("clearAllSpeechBubbles empties the map", () => {
    appendSpeechText("ent1", "a");
    appendSpeechText("ent2", "b");
    clearAllSpeechBubbles();
    expect(getSpeechBubbles().size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tick — typewriter
// ---------------------------------------------------------------------------

describe("tickSpeechBubbles — typewriter", () => {
  it("advances displayLength over time", () => {
    appendSpeechText("ent1", "Hello world");

    // Advance 1 second → should display ~30 chars (more than "Hello world")
    const active = tickSpeechBubbles(1000);
    expect(active).toBe(true);
    const entry = getSpeechBubbles().get("ent1")!;
    expect(entry.displayLength).toBeGreaterThanOrEqual("Hello world".length);
  });

  it("does not exceed text length", () => {
    appendSpeechText("ent1", "Hi");

    // Advance more than enough time
    tickSpeechBubbles(5000);
    const entry = getSpeechBubbles().get("ent1")!;
    expect(entry.displayLength).toBeLessThanOrEqual(entry.text.length);
  });

  it("returns false when no bubbles exist", () => {
    expect(tickSpeechBubbles(16)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tick — stream end detection
// ---------------------------------------------------------------------------

describe("tickSpeechBubbles — stream end", () => {
  it("transitions to visible after idle period + display caught up", () => {
    const now = performance.now();
    vi.spyOn(performance, "now").mockReturnValue(now);

    appendSpeechText("ent1", "Hi");

    // Let typewriter catch up
    tickSpeechBubbles(1000);

    // Simulate idle time past STREAM_END_IDLE_MS
    vi.spyOn(performance, "now").mockReturnValue(now + STREAM_END_IDLE_MS + 100);
    tickSpeechBubbles(16);

    const entry = getSpeechBubbles().get("ent1")!;
    expect(entry.phase).toBe("visible");
  });
});

// ---------------------------------------------------------------------------
// Tick — auto-dismiss + fade
// ---------------------------------------------------------------------------

describe("tickSpeechBubbles — auto-dismiss and fade", () => {
  it("transitions visible → fading after autoDismissMs", () => {
    // Create and fast-forward to visible phase
    setSpeechText("ent1", "Hi");
    const entry = getSpeechBubbles().get("ent1")!;

    // Force to visible phase
    entry.phase = "visible";
    entry.phaseElapsed = 0;

    // Advance past auto-dismiss
    tickSpeechBubbles(AUTO_DISMISS_MS + 1);

    expect(entry.phase).toBe("fading");
  });

  it("decreases opacity during fading", () => {
    setSpeechText("ent1", "Hi");
    const entry = getSpeechBubbles().get("ent1")!;
    entry.phase = "fading";
    entry.phaseElapsed = 0;
    entry.opacity = 1;

    tickSpeechBubbles(FADE_DURATION_MS / 2);
    expect(entry.opacity).toBeCloseTo(0.5, 1);
  });

  it("removes entry after fade completes", () => {
    setSpeechText("ent1", "Hi");
    const entry = getSpeechBubbles().get("ent1")!;
    entry.phase = "fading";
    entry.phaseElapsed = 0;
    entry.opacity = 1;

    tickSpeechBubbles(FADE_DURATION_MS + 100);
    expect(getSpeechBubbles().size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Stream boundary detection
// ---------------------------------------------------------------------------

describe("stream boundary", () => {
  it("clears buffer on gap > STREAM_BOUNDARY_MS between appends", () => {
    const now = performance.now();
    vi.spyOn(performance, "now").mockReturnValue(now);

    appendSpeechText("ent1", "first message ");

    // Simulate a big gap
    vi.spyOn(performance, "now").mockReturnValue(now + STREAM_BOUNDARY_MS + 100);
    appendSpeechText("ent1", "second message");

    const entry = getSpeechBubbles().get("ent1")!;
    // Should have started fresh — only "second message"
    expect(entry.text).toBe("second message");
  });
});

// ---------------------------------------------------------------------------
// Config overrides (SpeechBubbleOptions)
// ---------------------------------------------------------------------------

describe("SpeechBubbleOptions overrides", () => {
  it("appendSpeechText respects custom maxChars", () => {
    appendSpeechText("ent1", "a".repeat(100), { maxChars: 50 });
    const entry = getSpeechBubbles().get("ent1")!;
    expect(entry.text.length).toBe(50);
    expect(entry.maxChars).toBe(50);
  });

  it("appendSpeechText respects custom retentionMs", () => {
    appendSpeechText("ent1", "hello", { retentionMs: 10000 });
    const entry = getSpeechBubbles().get("ent1")!;
    expect(entry.autoDismissMs).toBe(10000);
  });

  it("setSpeechText respects custom maxChars", () => {
    setSpeechText("ent1", "b".repeat(100), { maxChars: 30 });
    const entry = getSpeechBubbles().get("ent1")!;
    expect(entry.text.length).toBe(30);
    expect(entry.maxChars).toBe(30);
  });

  it("setSpeechText respects custom retentionMs", () => {
    setSpeechText("ent1", "test", { retentionMs: 2000 });
    const entry = getSpeechBubbles().get("ent1")!;
    expect(entry.autoDismissMs).toBe(2000);
  });

  it("uses defaults when options are undefined", () => {
    appendSpeechText("ent1", "hello");
    const entry = getSpeechBubbles().get("ent1")!;
    expect(entry.maxChars).toBe(MAX_CHARS);
    expect(entry.autoDismissMs).toBe(AUTO_DISMISS_MS);
  });

  it("custom retentionMs affects visible→fading transition timing", () => {
    setSpeechText("ent1", "Hi", { retentionMs: 1000 });
    const entry = getSpeechBubbles().get("ent1")!;

    // Force to visible phase
    entry.phase = "visible";
    entry.phaseElapsed = 0;

    // Advance 1001ms — should transition to fading with 1000ms retention
    tickSpeechBubbles(1001);
    expect(entry.phase).toBe("fading");
  });
});

// ---------------------------------------------------------------------------
// Multiple entities
// ---------------------------------------------------------------------------

describe("multiple entities", () => {
  it("maintains independent bubbles per entity", () => {
    appendSpeechText("ent1", "Alpha");
    appendSpeechText("ent2", "Beta");

    const bubbles = getSpeechBubbles();
    expect(bubbles.size).toBe(2);
    expect(bubbles.get("ent1")!.text).toBe("Alpha");
    expect(bubbles.get("ent2")!.text).toBe("Beta");
  });

  it("tick advances all entries independently", () => {
    appendSpeechText("ent1", "Short");
    appendSpeechText("ent2", "A much longer text for testing");

    tickSpeechBubbles(200);

    const e1 = getSpeechBubbles().get("ent1")!;
    const e2 = getSpeechBubbles().get("ent2")!;

    // Both should have advanced
    expect(e1.displayLength).toBeGreaterThan(0);
    expect(e2.displayLength).toBeGreaterThan(0);
  });
});
