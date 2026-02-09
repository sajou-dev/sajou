/**
 * Scene data state.
 *
 * Holds the persistent scene data (placed entities, positions, routes, background).
 * Pub/sub pattern — subscribe to get notified on every change.
 */

import type { SceneState } from "../types.js";

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

function createDefault(): SceneState {
  return {
    dimensions: { width: 960, height: 640 },
    background: { type: "solid", color: "#1a1a2e" },
    entities: [],
    positions: [],
    routes: [],
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: SceneState = createDefault();
const listeners: Listener[] = [];

/** Get current scene state (read-only reference). */
export function getSceneState(): SceneState {
  return state;
}

/** Replace the entire scene state and notify listeners. */
export function setSceneState(next: SceneState): void {
  state = next;
  notify();
}

/** Partially update the scene state (shallow merge) and notify listeners. */
export function updateSceneState(partial: Partial<SceneState>): void {
  state = { ...state, ...partial };
  notify();
}

/** Reset scene state to defaults. */
export function resetSceneState(): void {
  state = createDefault();
  notify();
}

/** Subscribe to scene state changes. Returns unsubscribe function. */
export function subscribeScene(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}
