/**
 * Signal source state store (V2 multi-source).
 *
 * Manages N independent signal sources. Each source has its own
 * connection, protocol, status, and event rate.
 * Pub/sub pattern — subscribe to get notified on every change.
 */

import type { SignalSource, SignalSourcesState, TransportProtocol } from "../types.js";
import { getWiringState, removeWire } from "./wiring-state.js";

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

/** Create a new empty remote source with a unique ID. */
export function createSource(name?: string): SignalSource {
  const id = crypto.randomUUID();
  return {
    id,
    name: name ?? `source-${id.slice(0, 4)}`,
    color: nextSourceColor(),
    protocol: "websocket",
    url: "wss://test.sajou.dev/signals",
    apiKey: "",
    status: "disconnected",
    error: null,
    eventsPerSecond: 0,
    availableModels: [],
    selectedModel: "",
    streaming: false,
    category: "remote",
  };
}

/** Descriptor for a locally discovered service. */
export interface DiscoveredService {
  id: string;
  label: string;
  protocol: TransportProtocol;
  url: string;
  available: boolean;
  needsApiKey?: boolean;
  models?: string[];
}

/** Create a local source from a discovered service descriptor. */
export function createLocalSource(service: DiscoveredService): SignalSource {
  return {
    id: service.id,
    name: service.label,
    color: nextSourceColor(),
    protocol: service.protocol,
    url: service.url,
    apiKey: "",
    status: service.available ? "disconnected" : "unavailable",
    error: null,
    eventsPerSecond: 0,
    availableModels: service.models ?? [],
    selectedModel: "",
    streaming: false,
    category: "local",
  };
}

function createDefault(): SignalSourcesState {
  return {
    sources: [],
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

/** Remove a source by ID. Local sources cannot be removed. Also cleans up wires. */
export function removeSource(id: string): void {
  const source = state.sources.find((s) => s.id === id);
  if (!source || source.category === "local") return;

  // Clean up orphaned wires: remove all signal→signal-type wires from this source
  const { wires } = getWiringState();
  for (const wire of wires) {
    if (wire.fromZone === "signal" && wire.fromId === id) {
      removeWire(wire.id);
    }
  }

  state = {
    ...state,
    sources: state.sources.filter((s) => s.id !== id),
    selectedSourceId: state.selectedSourceId === id ? null : state.selectedSourceId,
  };
  notify();
}

/** Get all local sources. */
export function getLocalSources(): SignalSource[] {
  return state.sources.filter((s) => s.category === "local");
}

/** Get all remote sources. */
export function getRemoteSources(): SignalSource[] {
  return state.sources.filter((s) => s.category === "remote");
}

/**
 * Synchronize local sources with a fresh list of discovered services.
 * - New services → create local source entries
 * - Existing available services → update models, mark disconnected if not connected
 * - Missing services → mark "unavailable"
 * - Connected sources are never touched (don't interrupt active connections)
 */
export function upsertLocalSources(services: DiscoveredService[]): void {
  const serviceIds = new Set(services.map((s) => s.id));
  const existingLocals = state.sources.filter((s) => s.category === "local");
  const existingLocalIds = new Set(existingLocals.map((s) => s.id));
  const remotes = state.sources.filter((s) => s.category === "remote");

  const updatedLocals: SignalSource[] = [];

  // Update or keep existing local sources
  for (const existing of existingLocals) {
    const service = services.find((s) => s.id === existing.id);
    if (service) {
      // Service still available — update models, don't touch connected sources
      if (existing.status === "connected" || existing.status === "connecting") {
        updatedLocals.push({ ...existing, availableModels: service.models ?? existing.availableModels });
      } else {
        updatedLocals.push({
          ...existing,
          status: service.available ? "disconnected" : "unavailable",
          availableModels: service.models ?? existing.availableModels,
          error: service.available ? null : existing.error,
        });
      }
    } else {
      // Service disappeared — mark unavailable unless actively connected
      if (existing.status === "connected" || existing.status === "connecting") {
        updatedLocals.push(existing);
      } else {
        updatedLocals.push({ ...existing, status: "unavailable", error: null });
      }
    }
  }

  // Add newly discovered services
  for (const service of services) {
    if (!existingLocalIds.has(service.id)) {
      updatedLocals.push(createLocalSource(service));
    }
  }

  state = {
    ...state,
    sources: [...updatedLocals, ...remotes],
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
  if (lower.includes("18789") || lower.includes("openclaw")) return "openclaw";
  if (lower.startsWith("ws://") || lower.startsWith("wss://")) return "websocket";
  if (lower.includes("anthropic")) return "anthropic";
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
