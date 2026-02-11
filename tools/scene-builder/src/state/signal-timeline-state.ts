/**
 * Signal timeline state store.
 *
 * Holds the current scenario being edited: metadata, ordered steps, selection.
 * Pub/sub pattern — subscribe to get notified on every change.
 */

import type { SignalTimelineState } from "../types.js";

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

function createDefault(): SignalTimelineState {
  return {
    name: "untitled-scenario",
    description: "",
    steps: [],
    selectedStepId: null,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: SignalTimelineState = createDefault();
const listeners: Listener[] = [];

/** Get current signal timeline state (read-only reference). */
export function getSignalTimelineState(): SignalTimelineState {
  return state;
}

/** Replace the entire signal timeline state and notify listeners. */
export function setSignalTimelineState(next: SignalTimelineState): void {
  state = next;
  notify();
}

/** Partially update the signal timeline state (shallow merge) and notify. */
export function updateSignalTimelineState(partial: Partial<SignalTimelineState>): void {
  state = { ...state, ...partial };
  notify();
}

/** Reset to defaults. */
export function resetSignalTimeline(): void {
  state = createDefault();
  notify();
}

/** Select a step by ID (or null to deselect). */
export function selectTimelineStep(id: string | null): void {
  state = { ...state, selectedStepId: id };
  notify();
}

/** Subscribe to signal timeline state changes. Returns unsubscribe function. */
export function subscribeSignalTimeline(fn: Listener): () => void {
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
