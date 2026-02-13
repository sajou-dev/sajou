/**
 * Signal view — source blocks + raw log.
 *
 * Layout:
 *   - Top: source blocks (horizontal) — each manages its own connection
 *   - Bottom: raw log displaying all incoming signals and debug messages
 *
 * Each source block manages its own independent connection via
 * connectSource/disconnectSource (per-source architecture).
 * Prompt/test input is embedded per-source-block (when in OpenAI mode).
 * The raw log aggregates signals from all connected sources.
 *
 * Wiring between source badges and signal-type badges (on the connector
 * bar H) is handled by the global wiring system (wiring-state +
 * wiring-overlay + wiring-drag), not by this module.
 */

import {
  onSignal,
  onDebug,
} from "./signal-connection.js";
import type { ReceivedSignal } from "./signal-connection.js";
import {
  getSignalSourcesState,
  subscribeSignalSources,
  addSource,
} from "../state/signal-source-state.js";
import { createSourceBlock } from "./signal-source-block.js";
import { initRawLog, addLogEntry, addDebugEntry } from "./signal-raw-log.js";
import { createSimulatorBar } from "./simulator-bar.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

let zoneEl: HTMLElement | null = null;
let sourcesContainer: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let initialized = false;

/** Initialize the Signal view. Idempotent — only runs once. */
export function initSignalView(): void {
  if (initialized) return;
  initialized = true;

  zoneEl = document.getElementById("zone-signal");
  if (!zoneEl) return;

  // ── Sources container (horizontal blocks) ──
  const sourcesArea = document.createElement("div");
  sourcesArea.className = "sv-sources-area";

  sourcesContainer = document.createElement("div");
  sourcesContainer.className = "sv-sources-container";
  sourcesArea.appendChild(sourcesContainer);

  // Add source button
  const addBtn = document.createElement("button");
  addBtn.className = "sv-add-source-btn";
  addBtn.textContent = "+ Add Source";
  addBtn.addEventListener("click", () => addSource());
  sourcesArea.appendChild(addBtn);

  zoneEl.appendChild(sourcesArea);

  // ── Simulator bar (between sources and log) ──
  const simulatorBar = createSimulatorBar();
  zoneEl.appendChild(simulatorBar);

  // ── Lower area: raw log ──
  const lowerArea = document.createElement("div");
  lowerArea.className = "sv-lower-area";

  const logContainer = document.createElement("div");
  logContainer.className = "sv-log-container";

  // Init the raw log renderer into the log container
  initRawLog(logContainer);

  lowerArea.appendChild(logContainer);
  zoneEl.appendChild(lowerArea);

  // ── Render source blocks ──
  renderSourceBlocks();
  subscribeSignalSources(renderSourceBlocks);

  // ── Wire incoming signals from ALL sources → raw log ──
  onSignal((signal: ReceivedSignal, sourceId: string) => {
    addLogEntry(signal, sourceId);
  });

  onDebug((message: string, level: "info" | "warn" | "error", sourceId: string) => {
    addDebugEntry(message, level, sourceId);
  });
}

// ---------------------------------------------------------------------------
// Source blocks rendering
// ---------------------------------------------------------------------------

function renderSourceBlocks(): void {
  if (!sourcesContainer) return;
  sourcesContainer.innerHTML = "";

  const { sources } = getSignalSourcesState();
  for (const source of sources) {
    const block = createSourceBlock(source);
    sourcesContainer.appendChild(block);
  }
}
