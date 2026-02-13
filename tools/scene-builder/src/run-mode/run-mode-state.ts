/**
 * Run mode state store.
 *
 * Tracks whether run mode is active, the entity snapshot taken at entry
 * (for restoring positions on stop), and signal processing stats.
 *
 * Pub/sub pattern — same as choreography-state.ts.
 */

import type { PlacedEntity } from "../types.js";

// ---------------------------------------------------------------------------
// Snapshot type
// ---------------------------------------------------------------------------

/** Minimal snapshot of a PlacedEntity's mutable transforms. */
export interface PlacedEntitySnapshot {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  visible: boolean;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface RunModeState {
  /** Whether run mode is currently active. */
  active: boolean;
  /** Entity transform snapshot saved when entering run mode. */
  snapshot: PlacedEntitySnapshot[] | null;
  /** Number of signals processed during this run session. */
  signalsProcessed: number;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: RunModeState = {
  active: false,
  snapshot: null,
  signalsProcessed: 0,
};

const listeners: Listener[] = [];

/** Get current run mode state (read-only reference). */
export function getRunModeState(): RunModeState {
  return state;
}

/** Convenience: is run mode currently active? */
export function isRunModeActive(): boolean {
  return state.active;
}

/** Set run mode active/inactive and notify listeners. */
export function setRunModeActive(active: boolean): void {
  state = { ...state, active };
  notify();
}

/** Save a snapshot of entity transforms. */
export function saveSnapshot(entities: readonly PlacedEntity[]): void {
  state = {
    ...state,
    snapshot: entities.map((e) => ({
      id: e.id,
      x: e.x,
      y: e.y,
      scale: e.scale,
      rotation: e.rotation,
      opacity: e.opacity,
      visible: e.visible,
    })),
  };
  notify();
}

/** Get the saved snapshot (null if not saved). */
export function getSnapshot(): PlacedEntitySnapshot[] | null {
  return state.snapshot;
}

/** Clear the snapshot. */
export function clearSnapshot(): void {
  state = { ...state, snapshot: null, signalsProcessed: 0 };
  notify();
}

/** Increment the signal counter. */
export function incrementSignalsProcessed(): void {
  state = { ...state, signalsProcessed: state.signalsProcessed + 1 };
  notify();
}

/** Subscribe to run mode state changes. Returns unsubscribe function. */
export function subscribeRunMode(fn: Listener): () => void {
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
