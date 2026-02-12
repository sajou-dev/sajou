/**
 * Binding store.
 *
 * Holds all Level 2 dynamic bindings (Choreographer → Entity property).
 * Each binding connects a choreographer output to a specific property
 * on a placed entity (identified by its semanticId / actor name).
 *
 * Pub/sub pattern — subscribe to get notified on every change.
 */

import type { EntityBinding, BindablePropertyDef, BindingValueType } from "../types.js";

// ---------------------------------------------------------------------------
// Bindable property registry
// ---------------------------------------------------------------------------

/**
 * Static registry of all properties an entity can expose for binding.
 * Filtered at runtime by entity capabilities (topology, visual type, etc.).
 */
export const BINDABLE_PROPERTIES: readonly BindablePropertyDef[] = [
  // Spatial
  { key: "position", label: "Position", category: "spatial", acceptsTypes: ["point2D"] },
  { key: "position.x", label: "Position X", category: "spatial", acceptsTypes: ["float", "int"] },
  { key: "position.y", label: "Position Y", category: "spatial", acceptsTypes: ["float", "int"] },
  { key: "rotation", label: "Rotation", category: "spatial", acceptsTypes: ["float", "int"] },
  { key: "scale", label: "Scale", category: "spatial", acceptsTypes: ["float"] },
  { key: "scale.x", label: "Scale X", category: "spatial", acceptsTypes: ["float"] },
  { key: "scale.y", label: "Scale Y", category: "spatial", acceptsTypes: ["float"] },

  // Visual
  { key: "opacity", label: "Opacity", category: "visual", acceptsTypes: ["float"] },
  { key: "visible", label: "Visible", category: "visual", acceptsTypes: ["bool"] },
  { key: "tint", label: "Tint", category: "visual", acceptsTypes: ["color"] },
  { key: "animation.state", label: "Animation State", category: "visual", acceptsTypes: ["enum", "event", "int"] },
  { key: "animation.speed", label: "Animation Speed", category: "visual", acceptsTypes: ["float"] },
  { key: "zIndex", label: "Z-Index", category: "visual", acceptsTypes: ["int", "float"] },

  // Topological (only available if entity has topology)
  { key: "moveTo:waypoint", label: "Move To", category: "topological", acceptsTypes: ["enum", "event"] },
  { key: "followRoute", label: "Follow Route", category: "topological", acceptsTypes: ["enum", "event"] },
  { key: "teleportTo", label: "Teleport To", category: "topological", acceptsTypes: ["enum", "event"] },
];

/**
 * Get bindable properties compatible with a given source output type.
 * Optionally filter by whether entity has topology (for topological props).
 */
export function getCompatibleProperties(
  sourceType: BindingValueType,
  hasTopology: boolean,
): BindablePropertyDef[] {
  return BINDABLE_PROPERTIES.filter((prop) => {
    // Filter out topological properties if entity has no topology
    if (prop.category === "topological" && !hasTopology) return false;
    return prop.acceptsTypes.includes(sourceType);
  });
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Full binding state. */
export interface BindingState {
  /** All entity bindings. */
  bindings: EntityBinding[];
}

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

function createDefault(): BindingState {
  return { bindings: [] };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: BindingState = createDefault();
const listeners: Listener[] = [];

/** Get current binding state (read-only reference). */
export function getBindingState(): BindingState {
  return state;
}

/** Replace the entire binding state and notify listeners. */
export function setBindingState(next: BindingState): void {
  state = next;
  notify();
}

/** Reset to defaults. */
export function resetBindingState(): void {
  state = createDefault();
  notify();
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Add a new entity binding. Returns the binding with generated ID. */
export function addBinding(binding: Omit<EntityBinding, "id">): EntityBinding {
  const id = crypto.randomUUID();
  const newBinding: EntityBinding = { id, ...binding };
  state = { ...state, bindings: [...state.bindings, newBinding] };
  notify();
  return newBinding;
}

/** Remove a binding by ID. */
export function removeBinding(id: string): void {
  state = { ...state, bindings: state.bindings.filter((b) => b.id !== id) };
  notify();
}

/** Update a binding's mapping. */
export function updateBindingMapping(id: string, mapping: EntityBinding["mapping"]): void {
  state = {
    ...state,
    bindings: state.bindings.map((b) => (b.id === id ? { ...b, mapping } : b)),
  };
  notify();
}

/** Update a binding's action config. */
export function updateBindingAction(id: string, action: EntityBinding["action"]): void {
  state = {
    ...state,
    bindings: state.bindings.map((b) => (b.id === id ? { ...b, action } : b)),
  };
  notify();
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Get all bindings targeting a specific entity (by semanticId). */
export function getBindingsForEntity(semanticId: string): EntityBinding[] {
  return state.bindings.filter((b) => b.targetEntityId === semanticId);
}

/** Get all bindings sourced from a specific choreography. */
export function getBindingsFromChoreography(choreographyId: string): EntityBinding[] {
  return state.bindings.filter((b) => b.sourceChoreographyId === choreographyId);
}

/** Check if a specific binding already exists (same source + target + property). */
export function hasBinding(
  sourceChoreographyId: string,
  targetEntityId: string,
  property: string,
): boolean {
  return state.bindings.some(
    (b) =>
      b.sourceChoreographyId === sourceChoreographyId &&
      b.targetEntityId === targetEntityId &&
      b.property === property,
  );
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/** Subscribe to binding state changes. Returns unsubscribe function. */
export function subscribeBindings(fn: Listener): () => void {
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
