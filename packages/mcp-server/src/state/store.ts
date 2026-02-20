/**
 * Server-authoritative in-memory state store.
 *
 * This is the single source of truth for the scene state. MCP tools read
 * and mutate this store directly — no HTTP round-trip to a browser needed.
 * Connected browsers receive updates via SSE.
 */

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

/** Full server state — same shape as the client state-sync snapshot. */
export interface ServerState {
  scene: Record<string, unknown>;
  choreographies: Record<string, unknown>;
  wiring: Record<string, unknown>;
  bindings: Record<string, unknown>;
  shaders: Record<string, unknown>;
  p5: Record<string, unknown>;
  signalSources: Record<string, unknown>;
  editor: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** The in-memory state. Initialised with empty sections. */
let state: ServerState = createEmptyState();

/** Monotonically increasing version counter. */
let stateVersion = 0;

/** Timestamp of last mutation. */
let lastMutationAt: number | null = null;

/** Subscriber callbacks notified on every mutation. */
const subscribers = new Set<(version: number) => void>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh empty state. */
function createEmptyState(): ServerState {
  return {
    scene: {
      dimensions: { width: 960, height: 640 },
      background: { color: "#1a1a2e" },
      layers: [
        { id: "background", name: "Background", order: 0, visible: true },
        { id: "midground", name: "Midground", order: 1, visible: true },
        { id: "foreground", name: "Foreground", order: 2, visible: true },
      ],
      entities: [],
      positions: [],
      routes: [],
      zoneTypes: [],
      lighting: null,
      particles: [],
    },
    choreographies: { choreographies: [] },
    wiring: { wires: [] },
    bindings: { bindings: [] },
    shaders: { shaders: [] },
    p5: { sketches: [] },
    signalSources: { sources: [] },
    editor: {},
  };
}

/** Increment version, update timestamp, notify subscribers. */
function notifyChange(): void {
  stateVersion++;
  lastMutationAt = Date.now();
  for (const fn of subscribers) {
    try {
      fn(stateVersion);
    } catch {
      // Subscriber errors must not crash the store.
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — reads
// ---------------------------------------------------------------------------

/** Get the current state version. */
export function getStateVersion(): number {
  return stateVersion;
}

/** Get the timestamp of the last mutation (or null if pristine). */
export function getLastMutationAt(): number | null {
  return lastMutationAt;
}

/** Get a full snapshot of the entire state. */
export function getFullState(): Readonly<ServerState> {
  return state;
}

/** Get the scene section. */
export function getSceneSnapshot(): Record<string, unknown> {
  return state.scene;
}

/** Get choreographies section. */
export function getChoreographies(): Record<string, unknown> {
  return state.choreographies;
}

/** Get wiring section. */
export function getWiring(): Record<string, unknown> {
  return state.wiring;
}

/** Get bindings section. */
export function getBindings(): Record<string, unknown> {
  return state.bindings;
}

/** Get shaders section. */
export function getShaders(): Record<string, unknown> {
  return state.shaders;
}

/** Get p5 section. */
export function getP5(): Record<string, unknown> {
  return state.p5;
}

/** Get signal sources section. */
export function getSignalSources(): Record<string, unknown> {
  return state.signalSources;
}

/** Get editor section. */
export function getEditor(): Record<string, unknown> {
  return state.editor;
}

// ---------------------------------------------------------------------------
// Public API — writes
// ---------------------------------------------------------------------------

/** Replace the entire state (used when the browser pushes a full snapshot). */
export function setFullState(snapshot: Record<string, unknown>): void {
  state = {
    scene: (snapshot["scene"] as Record<string, unknown>) ?? state.scene,
    choreographies: (snapshot["choreographies"] as Record<string, unknown>) ?? state.choreographies,
    wiring: (snapshot["wiring"] as Record<string, unknown>) ?? state.wiring,
    bindings: (snapshot["bindings"] as Record<string, unknown>) ?? state.bindings,
    shaders: (snapshot["shaders"] as Record<string, unknown>) ?? state.shaders,
    p5: (snapshot["p5"] as Record<string, unknown>) ?? state.p5,
    signalSources: (snapshot["signalSources"] as Record<string, unknown>) ?? state.signalSources,
    editor: (snapshot["editor"] as Record<string, unknown>) ?? state.editor,
  };
  notifyChange();
}

/** Replace a single section of the state. */
export function setSection(key: keyof ServerState, value: Record<string, unknown>): void {
  state[key] = value;
  notifyChange();
}

/** Mutate the state in-place and notify. Used by mutations.ts. */
export function mutate(fn: (s: ServerState) => void): void {
  fn(state);
  notifyChange();
}

/** Reset to empty state (e.g. "New scene"). */
export function resetState(): void {
  state = createEmptyState();
  notifyChange();
}

// ---------------------------------------------------------------------------
// Pub/sub
// ---------------------------------------------------------------------------

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribe(fn: (version: number) => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}
