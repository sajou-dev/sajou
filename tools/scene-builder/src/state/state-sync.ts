/**
 * State sync — pushes client-side state to the Vite dev server.
 *
 * The scene-builder state lives in module-level stores (browser-only).
 * External tools (MCP server, CLI) need access via REST endpoints.
 * This module subscribes to all stores and pushes a snapshot to
 * `POST /api/state/push` on every change (debounced).
 */

import { getSceneState, subscribeScene } from "./scene-state.js";
import { getChoreographyState, subscribeChoreography } from "./choreography-state.js";
import { getWiringState, subscribeWiring } from "./wiring-state.js";
import { getBindingState, subscribeBindings } from "./binding-store.js";
import { getSignalSourcesState, subscribeSignalSources } from "./signal-source-state.js";
import { getEditorState, subscribeEditor } from "./editor-state.js";
import { getShaderState, subscribeShaders } from "../shader-editor/shader-state.js";
import { getSketchState, subscribeSketch } from "../sketch-editor/sketch-state.js";
import { getConnectionStatus, notifyServerContact, notifyServerLost } from "./server-connection.js";
import { serverUrl } from "./server-config.js";

/** Debounce interval in milliseconds. */
const DEBOUNCE_MS = 300;

/** Timer handle for debounced push. */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Collect a full state snapshot from all stores. */
function collectSnapshot(): Record<string, unknown> {
  return {
    scene: getSceneState(),
    choreographies: getChoreographyState(),
    wiring: getWiringState(),
    bindings: getBindingState(),
    signalSources: getSignalSourcesState(),
    editor: getEditorState(),
    shaders: getShaderState(),
    p5: getSketchState(),
  };
}

/** Push the snapshot to the dev server. Fire-and-forget. */
function pushState(): void {
  if (getConnectionStatus() !== "connected") return;

  const snapshot = collectSnapshot();

  fetch(serverUrl("/api/state/push"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  })
    .then((resp) => {
      if (resp.ok) notifyServerContact();
      else notifyServerLost();
    })
    .catch(() => {
      notifyServerLost();
    });
}

/** Schedule a debounced push. */
function schedulePush(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    pushState();
  }, DEBOUNCE_MS);
}

/**
 * Initialize state sync — subscribes to all stores and starts pushing.
 *
 * Call this AFTER all stores are initialized (typically at the end of
 * workspace init). Does an immediate push on first call.
 */
export function initStateSync(): void {
  // Subscribe to every store
  subscribeScene(schedulePush);
  subscribeChoreography(schedulePush);
  subscribeWiring(schedulePush);
  subscribeBindings(schedulePush);
  subscribeSignalSources(schedulePush);
  subscribeEditor(schedulePush);
  subscribeShaders(schedulePush);
  subscribeSketch(schedulePush);

  // Immediate push on init so server has state right away
  pushState();
}
