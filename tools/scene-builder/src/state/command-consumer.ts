/**
 * Command consumer — receives state changes from the sajou server via SSE.
 *
 * The server broadcasts `event: state-change` with `{ version }` whenever
 * its state is mutated (via MCP tools or REST API). This module listens on
 * that SSE stream and re-fetches the full state to apply it locally.
 *
 * Falls back to polling GET /api/state/full if SSE fails to connect.
 *
 * This is the reverse channel of state-sync.ts: state-sync pushes state OUT,
 * command-consumer pulls state changes IN.
 */

import { notifyServerContact, notifyServerLost } from "./server-connection.js";
import { serverUrl } from "./server-config.js";
import { setSceneState } from "./scene-state.js";
import { setChoreographyState } from "./choreography-state.js";
import { setWiringState } from "./wiring-state.js";
import { setBindingState } from "./binding-store.js";
import { setShaderState } from "../shader-editor/shader-state.js";
import { setSketchState } from "../sketch-editor/sketch-state.js";
import type { SceneState, ChoreographyEditorState } from "../types.js";
import type { WiringState } from "./wiring-state.js";
import type { BindingState } from "./binding-store.js";
import type { ShaderEditorState } from "../shader-editor/shader-types.js";
import type { SketchEditorState } from "../sketch-editor/sketch-types.js";

/** Poll interval in milliseconds (fallback only). */
const POLL_MS = 2000;

/** Timer handle for the fallback poll loop. */
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Active EventSource connection. */
let eventSource: EventSource | null = null;

/** Whether the SSE stream is currently connected. */
let sseConnected = false;

/** Last known server state version (to skip redundant fetches). */
let lastKnownVersion = 0;

/** Whether a fetch is currently in-flight (prevent concurrent fetches). */
let fetchInFlight = false;

/**
 * Whether we are currently applying server state to local stores.
 * When true, state-sync should NOT push — it would echo the same state
 * back to the server, creating a feedback loop.
 */
let applyingServerState = false;

/** Check if we're in the middle of applying server state. Used by state-sync. */
export function isApplyingServerState(): boolean {
  return applyingServerState;
}

// ---------------------------------------------------------------------------
// State application
// ---------------------------------------------------------------------------

/**
 * Apply server state to local stores.
 * Only updates sections that are present in the response.
 * Preserves local-only fields (selections, playing state).
 */
function applyServerState(data: Record<string, unknown>): void {
  if (data["scene"]) setSceneState(data["scene"] as SceneState);
  if (data["choreographies"]) {
    const c = data["choreographies"] as ChoreographyEditorState;
    setChoreographyState({ ...c, selectedChoreographyId: null, selectedStepId: null });
  }
  if (data["wiring"]) {
    const w = data["wiring"] as WiringState;
    setWiringState({ ...w, draggingWireId: null });
  }
  if (data["bindings"]) setBindingState(data["bindings"] as BindingState);
  if (data["shaders"]) {
    const s = data["shaders"] as ShaderEditorState;
    setShaderState({ ...s, selectedShaderId: null, playing: true });
  }
  if (data["p5"]) {
    const p = data["p5"] as SketchEditorState;
    setSketchState({ ...p, selectedSketchId: null, playing: true });
  }
}

/** Fetch the full server state and apply it locally. */
async function fetchAndApplyState(): Promise<void> {
  if (fetchInFlight) return;
  fetchInFlight = true;

  try {
    const resp = await fetch(serverUrl("/api/state/full"), {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return;

    const body = (await resp.json()) as {
      ok: boolean;
      lastPushAt: number | null;
      data: Record<string, unknown>;
    };

    if (!body.ok || !body.data) return;

    applyingServerState = true;
    try {
      applyServerState(body.data);
    } finally {
      applyingServerState = false;
    }
    notifyServerContact();
  } catch {
    // Fetch failed — connection may be lost, handled by SSE error
  } finally {
    fetchInFlight = false;
  }
}

// ---------------------------------------------------------------------------
// SSE stream
// ---------------------------------------------------------------------------

/** Connect to the state-change SSE stream. */
function connectSSE(): void {
  const es = new EventSource(serverUrl("/__commands__/stream"));
  eventSource = es;

  // Server sends `event: state-change` with `{ version }` on every mutation
  es.addEventListener("state-change", (event: MessageEvent) => {
    try {
      const payload = JSON.parse(event.data as string) as { version: number };
      if (payload.version <= lastKnownVersion) return; // Already have this version
      lastKnownVersion = payload.version;
      fetchAndApplyState();
    } catch {
      // Malformed event — still try to fetch
      fetchAndApplyState();
    }
  });

  es.addEventListener("open", () => {
    if (!sseConnected) {
      console.log("[command-consumer] SSE connected — real-time state streaming active");
      sseConnected = true;
    }
    notifyServerContact();
    // Stop fallback polling when SSE is connected
    stopPolling();
  });

  es.addEventListener("error", () => {
    if (sseConnected) {
      console.warn("[command-consumer] SSE disconnected — falling back to polling");
      sseConnected = false;
      notifyServerLost();
    }
    // EventSource will auto-reconnect, but start polling as fallback in the meantime
    startPolling();
  });
}

// ---------------------------------------------------------------------------
// Fallback poll loop
// ---------------------------------------------------------------------------

/** Poll the server for state changes. */
async function pollState(): Promise<void> {
  await fetchAndApplyState();
}

/** Start the fallback polling loop (if not already running). */
function startPolling(): void {
  if (pollTimer !== null) return;
  pollTimer = setInterval(() => { pollState(); }, POLL_MS);
  pollState();
}

/** Stop the fallback polling loop. */
function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the command consumer — connects via SSE with polling fallback.
 *
 * Call this AFTER all stores are initialized (alongside initStateSync).
 */
export function initCommandConsumer(): void {
  if (eventSource !== null || pollTimer !== null) return; // Already running
  connectSSE();
}

/**
 * Stop the command consumer (SSE + polling).
 */
export function stopCommandConsumer(): void {
  if (eventSource !== null) {
    eventSource.close();
    eventSource = null;
    sseConnected = false;
  }
  stopPolling();
}
