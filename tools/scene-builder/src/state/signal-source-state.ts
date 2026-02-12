/**
 * Signal source state store (V2 multi-source).
 *
 * Manages N independent signal sources. Each source has its own
 * connection, protocol, status, and event rate.
 * Pub/sub pattern — subscribe to get notified on every change.
 */

import type { SignalSource, SignalSourcesState, TransportProtocol } from "../types.js";

// ---------------------------------------------------------------------------
// Source identity palette
// ---------------------------------------------------------------------------

/**
 * Rotating palette of visually distinct identity colors for sources.
 * These are NOT status colors — they identify which source a signal came from.
 */
const SOURCE_PALETTE: string[] = [
  "#5B8DEF",  // blue
  "#E8A851",  // amber
  "#4EC9B0",  // teal
  "#C586C0",  // purple
  "#6A9955",  // green
  "#F44747",  // red
  "#D4A0E0",  // lavender
  "#4DC9F6",  // cyan
];

/** Track how many sources have been created to cycle through the palette. */
let sourceCounter = 0;

/** Get the next identity color from the palette. */
function nextSourceColor(): string {
  const color = SOURCE_PALETTE[sourceCounter % SOURCE_PALETTE.length]!;
  sourceCounter++;
  return color;
}

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

/** Create a new empty source with a unique ID. */
export function createSource(name?: string): SignalSource {
  const id = crypto.randomUUID();
  return {
    id,
    name: name ?? `source-${id.slice(0, 4)}`,
    color: nextSourceColor(),
    protocol: "websocket",
    url: "ws://localhost:9100",
    apiKey: "",
    status: "disconnected",
    error: null,
    eventsPerSecond: 0,
    availableModels: [],
    selectedModel: "",
    streaming: false,
  };
}

function createDefault(): SignalSourcesState {
  return {
    sources: [createSource("default")],
    selectedSourceId: null,
    expanded: true,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: SignalSourcesState = createDefault();
const listeners: Listener[] = [];

/** Get current signal sources state. */
export function getSignalSourcesState(): SignalSourcesState {
  return state;
}

/** Replace entire state and notify. */
export function setSignalSourcesState(next: SignalSourcesState): void {
  state = next;
  notify();
}

/** Partially update state (shallow merge) and notify. */
export function updateSignalSourcesState(partial: Partial<SignalSourcesState>): void {
  state = { ...state, ...partial };
  notify();
}

/** Add a new source. Returns its ID. */
export function addSource(name?: string): string {
  const source = createSource(name);
  state = { ...state, sources: [...state.sources, source] };
  notify();
  return source.id;
}

/** Remove a source by ID. */
export function removeSource(id: string): void {
  state = {
    ...state,
    sources: state.sources.filter((s) => s.id !== id),
    selectedSourceId: state.selectedSourceId === id ? null : state.selectedSourceId,
  };
  notify();
}

/** Update a single source by ID (shallow merge). */
export function updateSource(id: string, partial: Partial<SignalSource>): void {
  state = {
    ...state,
    sources: state.sources.map((s) => (s.id === id ? { ...s, ...partial } : s)),
  };
  notify();
}

/** Select a source for editing. */
export function selectSource(id: string | null): void {
  state = { ...state, selectedSourceId: id };
  notify();
}

/** Toggle expanded/compact mode for the signal zone. */
export function toggleSignalZoneExpanded(): void {
  state = { ...state, expanded: !state.expanded };
  notify();
}

/** Set expanded/compact mode. */
export function setSignalZoneExpanded(expanded: boolean): void {
  state = { ...state, expanded };
  notify();
}

/** Get a source by ID. */
export function getSource(id: string): SignalSource | undefined {
  return state.sources.find((s) => s.id === id);
}

/** Detect protocol from URL. */
export function detectProtocol(url: string): TransportProtocol {
  const lower = url.trim().toLowerCase();
  if (lower.startsWith("ws://") || lower.startsWith("wss://")) return "websocket";
  return "sse";
}

/** Subscribe to signal sources state changes. Returns unsubscribe function. */
export function subscribeSignalSources(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/** Reset to defaults. */
export function resetSignalSources(): void {
  state = createDefault();
  notify();
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function notify(): void {
  for (const fn of listeners) fn();
}
