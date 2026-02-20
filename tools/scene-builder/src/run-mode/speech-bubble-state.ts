/**
 * Speech bubble state store + tick logic.
 *
 * Manages per-entity speech bubble entries: text accumulation (append/replace),
 * typewriter display progression, auto-dismiss with fade-out.
 *
 * Phase lifecycle:  typing → visible → fading → (removed)
 *
 * Driven by `tickSpeechBubbles(dtMs)` called every frame from the render loop.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Lifecycle phase of a speech bubble. */
export type SpeechBubblePhase = "typing" | "visible" | "fading";

/** A single speech bubble entry attached to a placed entity. */
export interface SpeechBubbleEntry {
  /** Full accumulated text buffer. */
  text: string;
  /** Number of characters currently displayed (typewriter progress). */
  displayLength: number;
  /** Current opacity (1.0 = fully visible, fades to 0). */
  opacity: number;
  /** Current lifecycle phase. */
  phase: SpeechBubblePhase;
  /** Timestamp (ms) when the bubble was created or last replaced. */
  createdAt: number;
  /** Timestamp (ms) of the last append (for stream boundary detection). */
  lastDeltaAt: number;
  /** Auto-dismiss delay in ms after typing completes. */
  autoDismissMs: number;
  /** Maximum characters before truncation. */
  maxChars: number;
  /** Elapsed time in current phase (ms). */
  phaseElapsed: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Typewriter speed: characters per second. */
const CHARS_PER_SEC = 30;

/** Time (ms) of inactivity after last delta before transitioning typing → visible. */
const STREAM_END_IDLE_MS = 1500;

/** Gap (ms) between deltas that triggers a new message (clear buffer first). */
const STREAM_BOUNDARY_MS = 3000;

/** Default auto-dismiss delay (ms) after entering "visible" phase. */
const AUTO_DISMISS_MS = 5000;

/** Fade-out duration (ms). */
const FADE_DURATION_MS = 400;

/** Maximum characters in a speech bubble. */
const MAX_CHARS = 200;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Optional overrides for speech bubble behavior (from entity config). */
export interface SpeechBubbleOptions {
  maxChars?: number;
  retentionMs?: number;
}

/** Map of placedId → SpeechBubbleEntry. */
const bubbles = new Map<string, SpeechBubbleEntry>();

// ---------------------------------------------------------------------------
// Public API — write
// ---------------------------------------------------------------------------

/** Append text to a speech bubble (streaming mode — text_delta, thinking). */
export function appendSpeechText(placedId: string, delta: string, options?: SpeechBubbleOptions): void {
  if (!delta) return;

  const effectiveMaxChars = options?.maxChars ?? MAX_CHARS;
  const effectiveRetention = options?.retentionMs ?? AUTO_DISMISS_MS;

  const now = performance.now();
  const existing = bubbles.get(placedId);

  // Stream boundary: if gap > STREAM_BOUNDARY_MS, start a new message
  if (existing && (now - existing.lastDeltaAt) > STREAM_BOUNDARY_MS) {
    bubbles.delete(placedId);
  }

  const entry = bubbles.get(placedId);

  if (entry) {
    // Append to existing buffer (respect maxChars)
    const newText = (entry.text + delta).slice(0, entry.maxChars);
    entry.text = newText;
    entry.lastDeltaAt = now;
    // Stay in / return to typing phase
    if (entry.phase !== "typing") {
      entry.phase = "typing";
      entry.opacity = 1;
      entry.phaseElapsed = 0;
    }
  } else {
    // Create new entry
    bubbles.set(placedId, {
      text: delta.slice(0, effectiveMaxChars),
      displayLength: 0,
      opacity: 1,
      phase: "typing",
      createdAt: now,
      lastDeltaAt: now,
      autoDismissMs: effectiveRetention,
      maxChars: effectiveMaxChars,
      phaseElapsed: 0,
    });
  }
}

/** Set (replace) the full speech bubble text (non-streaming signals). */
export function setSpeechText(placedId: string, text: string, options?: SpeechBubbleOptions): void {
  if (!text) return;

  const effectiveMaxChars = options?.maxChars ?? MAX_CHARS;
  const effectiveRetention = options?.retentionMs ?? AUTO_DISMISS_MS;

  const now = performance.now();
  const truncated = text.slice(0, effectiveMaxChars);

  bubbles.set(placedId, {
    text: truncated,
    displayLength: 0,
    opacity: 1,
    phase: "typing",
    createdAt: now,
    lastDeltaAt: now,
    autoDismissMs: effectiveRetention,
    maxChars: effectiveMaxChars,
    phaseElapsed: 0,
  });
}

/** Clear a single entity's speech bubble. */
export function clearSpeechBubble(placedId: string): void {
  bubbles.delete(placedId);
}

/** Clear all speech bubbles. */
export function clearAllSpeechBubbles(): void {
  bubbles.clear();
}

// ---------------------------------------------------------------------------
// Public API — read
// ---------------------------------------------------------------------------

/** Get all active speech bubbles (read-only iteration). */
export function getSpeechBubbles(): ReadonlyMap<string, SpeechBubbleEntry> {
  return bubbles;
}

// ---------------------------------------------------------------------------
// Tick — called every frame from the render loop
// ---------------------------------------------------------------------------

/**
 * Advance all speech bubbles by dtMs milliseconds.
 *
 * - Typing phase: advance displayLength at CHARS_PER_SEC.
 *   Detect stream end (idle > STREAM_END_IDLE_MS) → transition to visible.
 * - Visible phase: wait for autoDismissMs → transition to fading.
 * - Fading phase: decrease opacity over FADE_DURATION_MS → remove.
 *
 * @returns `true` if any bubbles are active (signals the renderer to redraw).
 */
export function tickSpeechBubbles(dtMs: number): boolean {
  if (bubbles.size === 0) return false;

  const now = performance.now();
  const charsThisTick = (CHARS_PER_SEC * dtMs) / 1000;
  const toRemove: string[] = [];

  for (const [placedId, entry] of bubbles) {
    switch (entry.phase) {
      case "typing": {
        // Advance typewriter
        entry.displayLength = Math.min(
          entry.text.length,
          entry.displayLength + charsThisTick,
        );

        // Check stream end: if idle long enough AND display caught up
        const idle = now - entry.lastDeltaAt;
        if (idle >= STREAM_END_IDLE_MS && entry.displayLength >= entry.text.length) {
          entry.phase = "visible";
          entry.phaseElapsed = 0;
        }
        break;
      }

      case "visible": {
        entry.phaseElapsed += dtMs;
        if (entry.phaseElapsed >= entry.autoDismissMs) {
          entry.phase = "fading";
          entry.phaseElapsed = 0;
        }
        break;
      }

      case "fading": {
        entry.phaseElapsed += dtMs;
        entry.opacity = Math.max(0, 1 - entry.phaseElapsed / FADE_DURATION_MS);
        if (entry.opacity <= 0) {
          toRemove.push(placedId);
        }
        break;
      }
    }
  }

  for (const id of toRemove) {
    bubbles.delete(id);
  }

  return bubbles.size > 0;
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

export const __test__ = {
  CHARS_PER_SEC,
  STREAM_END_IDLE_MS,
  STREAM_BOUNDARY_MS,
  AUTO_DISMISS_MS,
  FADE_DURATION_MS,
  MAX_CHARS,
} as const;
