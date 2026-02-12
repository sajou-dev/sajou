/**
 * Wiring state store.
 *
 * Holds all wire connections between zones in the TouchDesigner-style patch bay.
 * Three wire layers flow through the connector bar H as a hub:
 *   1. signal → signal-type : "this source feeds this channel"
 *   2. signal-type → choreographer : "this channel triggers this choreography"
 *   3. choreographer → theme : "this choreography outputs to the theme"
 *
 * Each wire has a source zone+id and destination zone+id, plus optional mapping.
 * Pub/sub pattern — subscribe to get notified on every change.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A zone that can be a wire endpoint. */
export type WireZone = "signal" | "signal-type" | "choreographer" | "theme";

/** A single wire connection between two zone endpoints. */
export interface WireConnection {
  /** Unique wire ID. */
  id: string;
  /** Source zone. */
  fromZone: "signal" | "signal-type" | "choreographer";
  /** Source endpoint ID (signal source ID, signal type name, or choreography ID). */
  fromId: string;
  /** Destination zone. */
  toZone: "signal-type" | "choreographer" | "theme";
  /** Destination endpoint ID (signal type name, choreography ID, or theme slot). */
  toId: string;
  /** Optional mapping function applied to routed data. */
  mapping?: { fn: string; args: number[] };
}

/** Full wiring state. */
export interface WiringState {
  /** All wire connections. */
  wires: WireConnection[];
  /** Wire currently being dragged (null = no drag in progress). */
  draggingWireId: string | null;
}

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

function createDefault(): WiringState {
  return {
    wires: [],
    draggingWireId: null,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: WiringState = createDefault();
const listeners: Listener[] = [];

/** Get current wiring state (read-only reference). */
export function getWiringState(): WiringState {
  return state;
}

/** Replace the entire wiring state and notify listeners. */
export function setWiringState(next: WiringState): void {
  state = next;
  notify();
}

/** Partially update the wiring state (shallow merge) and notify. */
export function updateWiringState(partial: Partial<WiringState>): void {
  state = { ...state, ...partial };
  notify();
}

/** Reset to defaults. */
export function resetWiringState(): void {
  state = createDefault();
  notify();
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Add a new wire connection. */
export function addWire(wire: Omit<WireConnection, "id">): WireConnection {
  const id = crypto.randomUUID();
  const newWire: WireConnection = { id, ...wire };
  state = { ...state, wires: [...state.wires, newWire] };
  notify();
  return newWire;
}

/** Remove a wire connection by ID. */
export function removeWire(id: string): void {
  state = { ...state, wires: state.wires.filter((w) => w.id !== id) };
  notify();
}

/** Update a wire's mapping. */
export function updateWireMapping(id: string, mapping: WireConnection["mapping"]): void {
  state = {
    ...state,
    wires: state.wires.map((w) => (w.id === id ? { ...w, mapping } : w)),
  };
  notify();
}

/** Get all wires from a specific zone. */
export function getWiresFrom(zone: WireZone): WireConnection[] {
  return state.wires.filter((w) => w.fromZone === zone);
}

/** Get all wires to a specific zone. */
export function getWiresTo(zone: WireZone): WireConnection[] {
  return state.wires.filter((w) => w.toZone === zone);
}

/** Get all wires between two zones. */
export function getWiresBetween(from: WireZone, to: WireZone): WireConnection[] {
  return state.wires.filter((w) => w.fromZone === from && w.toZone === to);
}

/** Check if a specific connection already exists. */
export function hasWire(fromZone: WireZone, fromId: string, toZone: WireZone, toId: string): boolean {
  return state.wires.some(
    (w) => w.fromZone === fromZone && w.fromId === fromId && w.toZone === toZone && w.toId === toId,
  );
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/** Subscribe to wiring state changes. Returns unsubscribe function. */
export function subscribeWiring(fn: Listener): () => void {
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
