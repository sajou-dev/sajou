/**
 * Entity store.
 *
 * Holds entity configurations (display properties + visual states).
 */

import type { EntityEntry } from "../types.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface EntityStoreState {
  entities: Record<string, EntityEntry>;
  selectedEntityId: string | null;
  selectedStateName: string | null;
}

type Listener = () => void;

let state: EntityStoreState = {
  entities: {},
  selectedEntityId: null,
  selectedStateName: null,
};

const listeners: Listener[] = [];

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

/** Get the full entity store state. */
export function getEntityStore(): EntityStoreState {
  return state;
}

/** Get the currently selected entity, or null. */
export function getSelectedEntity(): EntityEntry | null {
  if (!state.selectedEntityId) return null;
  return state.entities[state.selectedEntityId] ?? null;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Add or update an entity. */
export function setEntity(id: string, entry: EntityEntry): void {
  const entities = { ...state.entities, [id]: entry };
  state = { ...state, entities };
  notify();
}

/** Remove an entity by ID. */
export function removeEntity(id: string): void {
  const entities = { ...state.entities };
  delete entities[id];
  const selectedEntityId = state.selectedEntityId === id ? null : state.selectedEntityId;
  state = { ...state, entities, selectedEntityId };
  notify();
}

/** Select an entity by ID. */
export function selectEntity(id: string | null): void {
  state = { ...state, selectedEntityId: id };
  notify();
}

/** Select a visual state name within the selected entity. */
export function selectStateName(name: string | null): void {
  state = { ...state, selectedStateName: name };
  notify();
}

/** Clear all entity definitions and selection. */
export function resetEntities(): void {
  state = {
    entities: {},
    selectedEntityId: null,
    selectedStateName: null,
  };
  notify();
}

/** Subscribe to entity store changes. Returns unsubscribe function. */
export function subscribeEntities(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}
