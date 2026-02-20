/**
 * Choreography editor state store.
 *
 * Holds all choreography definitions being edited, selection state.
 * Pub/sub pattern — subscribe to get notified on every change.
 */

import type { ChoreographyEditorState } from "../types.js";
import { getWiringState, removeWire } from "./wiring-state.js";

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

function createDefault(): ChoreographyEditorState {
  return {
    choreographies: [],
    selectedChoreographyId: null,
    selectedStepId: null,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: ChoreographyEditorState = createDefault();
const listeners: Listener[] = [];

/** Get current choreography editor state (read-only reference). */
export function getChoreographyState(): ChoreographyEditorState {
  return state;
}

/** Replace the entire choreography editor state and notify listeners. */
export function setChoreographyState(next: ChoreographyEditorState): void {
  state = next;
  notify();
}

/** Partially update the choreography editor state (shallow merge) and notify. */
export function updateChoreographyState(partial: Partial<ChoreographyEditorState>): void {
  state = { ...state, ...partial };
  notify();
}

/** Reset to defaults. */
export function resetChoreographyState(): void {
  state = createDefault();
  notify();
}

/** Select a choreography by ID (or null to deselect). */
export function selectChoreography(id: string | null): void {
  state = { ...state, selectedChoreographyId: id, selectedStepId: null };
  notify();
}

/** Select a step by ID within the selected choreography (or null to deselect). */
export function selectChoreographyStep(id: string | null): void {
  state = { ...state, selectedStepId: id };
  notify();
}

/** Remove a choreography by ID. Also cleans up wires targeting it. */
export function removeChoreography(id: string): void {
  // Clean up wires referencing this choreography (signal-type→choreo, choreo→theme)
  const { wires } = getWiringState();
  for (const wire of wires) {
    if (
      (wire.toZone === "choreographer" && wire.toId === id) ||
      (wire.fromZone === "choreographer" && wire.fromId === id)
    ) {
      removeWire(wire.id);
    }
  }

  state = {
    ...state,
    choreographies: state.choreographies.filter((c) => c.id !== id),
    selectedChoreographyId: state.selectedChoreographyId === id ? null : state.selectedChoreographyId,
    selectedStepId: state.selectedChoreographyId === id ? null : state.selectedStepId,
  };
  notify();
}

/** Move a choreography node to a new position on the canvas. */
export function moveChoreographyNode(id: string, x: number, y: number): void {
  state = {
    ...state,
    choreographies: state.choreographies.map((c) =>
      c.id === id ? { ...c, nodeX: x, nodeY: y } : c,
    ),
  };
  notify();
}

/** Toggle the collapsed state of a choreography node. */
export function toggleNodeCollapsed(id: string): void {
  state = {
    ...state,
    choreographies: state.choreographies.map((c) =>
      c.id === id ? { ...c, collapsed: !c.collapsed } : c,
    ),
  };
  notify();
}

/** Subscribe to choreography editor state changes. Returns unsubscribe function. */
export function subscribeChoreography(fn: Listener): () => void {
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
