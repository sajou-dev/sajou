/**
 * Compositor state store.
 *
 * The compositor sits between Signal sources and the Choreographer.
 * It provides declarative filtering, transformation, tagging, and routing.
 *
 * Each CompositorFilter:
 *   - Selects a source (signal source ID)
 *   - Optionally filters by signal type
 *   - Optionally applies a tag
 *   - Routes to a target choreography
 *
 * Pub/sub pattern — subscribe to get notified on every change.
 */

import type { SignalType } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single compositor filter/route rule. */
export interface CompositorFilter {
  /** Unique filter ID. */
  id: string;
  /** Source signal source ID (or "*" for all sources). */
  sourceId: string;
  /** Signal type filter (null = all types). */
  typeFilter: SignalType | null;
  /** Optional tag to apply to matching signals. */
  tag: string | null;
  /** Target choreography ID to route to (null = pass-through). */
  routeTo: string | null;
  /** Whether this filter is enabled. */
  enabled: boolean;
}

/** Full compositor state. */
export interface CompositorState {
  /** All filter rules. */
  filters: CompositorFilter[];
  /** Whether the compositor editor panel is visible. */
  editorVisible: boolean;
}

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

function createDefault(): CompositorState {
  return {
    filters: [],
    editorVisible: false,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: CompositorState = createDefault();
const listeners: Listener[] = [];

/** Get current compositor state (read-only reference). */
export function getCompositorState(): CompositorState {
  return state;
}

/** Partially update the compositor state (shallow merge) and notify. */
export function updateCompositorState(partial: Partial<CompositorState>): void {
  state = { ...state, ...partial };
  notify();
}

/** Reset to defaults. */
export function resetCompositorState(): void {
  state = createDefault();
  notify();
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Add a new filter rule. Returns the created filter. */
export function addCompositorFilter(filter: Omit<CompositorFilter, "id">): CompositorFilter {
  const id = crypto.randomUUID();
  const newFilter: CompositorFilter = { id, ...filter };
  state = { ...state, filters: [...state.filters, newFilter] };
  notify();
  return newFilter;
}

/** Remove a filter by ID. */
export function removeCompositorFilter(id: string): void {
  state = { ...state, filters: state.filters.filter((f) => f.id !== id) };
  notify();
}

/** Update a filter by ID. */
export function updateCompositorFilter(id: string, partial: Partial<CompositorFilter>): void {
  state = {
    ...state,
    filters: state.filters.map((f) => (f.id === id ? { ...f, ...partial } : f)),
  };
  notify();
}

/** Toggle a filter's enabled state. */
export function toggleCompositorFilter(id: string): void {
  state = {
    ...state,
    filters: state.filters.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)),
  };
  notify();
}

/** Toggle the compositor editor visibility. */
export function toggleCompositorEditor(): void {
  state = { ...state, editorVisible: !state.editorVisible };
  notify();
}

/** Get all active (enabled) filters for a given source. */
export function getActiveFilters(sourceId: string): CompositorFilter[] {
  return state.filters.filter(
    (f) => f.enabled && (f.sourceId === "*" || f.sourceId === sourceId),
  );
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/** Subscribe to compositor state changes. Returns unsubscribe function. */
export function subscribeCompositor(fn: Listener): () => void {
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
