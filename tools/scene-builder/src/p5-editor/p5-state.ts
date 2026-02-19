/**
 * p5.js editor state store.
 *
 * Module-state pattern (same as shader-state, scene-state, etc.).
 * Holds sketch definitions, selection, and playback state.
 */

import type { P5EditorState, P5SketchDef } from "./p5-types.js";

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

function createDefault(): P5EditorState {
  return {
    sketches: [],
    selectedSketchId: null,
    playing: true,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: P5EditorState = createDefault();
const listeners: Listener[] = [];

/** Get current p5 editor state. */
export function getP5State(): P5EditorState {
  return state;
}

/** Replace the entire p5 state and notify listeners. */
export function setP5State(next: P5EditorState): void {
  state = next;
  notify();
}

/** Partially update p5 state (shallow merge) and notify. */
export function updateP5State(partial: Partial<P5EditorState>): void {
  state = { ...state, ...partial };
  notify();
}

/** Reset to defaults. */
export function resetP5State(): void {
  state = createDefault();
  notify();
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Add a new sketch definition. Returns the added sketch. */
export function addSketch(sketch: P5SketchDef): P5SketchDef {
  state = {
    ...state,
    sketches: [...state.sketches, sketch],
    selectedSketchId: sketch.id,
  };
  notify();
  return sketch;
}

/** Update an existing sketch by ID (shallow merge). */
export function updateSketch(id: string, partial: Partial<P5SketchDef>): void {
  state = {
    ...state,
    sketches: state.sketches.map((s) => (s.id === id ? { ...s, ...partial } : s)),
  };
  notify();
}

/** Remove a sketch by ID. Clears selection if it was selected. */
export function removeSketch(id: string): void {
  const newSketches = state.sketches.filter((s) => s.id !== id);
  state = {
    ...state,
    sketches: newSketches,
    selectedSketchId: state.selectedSketchId === id ? null : state.selectedSketchId,
  };
  notify();
}

/** Select a sketch by ID. */
export function selectSketch(id: string | null): void {
  if (state.selectedSketchId === id) return;
  state = { ...state, selectedSketchId: id };
  notify();
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/** Subscribe to p5 state changes. Returns unsubscribe function. */
export function subscribeP5(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function notify(): void {
  for (const fn of listeners) fn();
}
