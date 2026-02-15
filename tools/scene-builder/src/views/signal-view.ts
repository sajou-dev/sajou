/**
 * Signal view — source chips + raw log.
 *
 * Layout:
 *   - Top: compact chip bar — one pill per source, "+" to add
 *   - Middle: simulator bar
 *   - Bottom: raw log displaying all incoming signals and debug messages
 *
 * Each source chip opens a popover for configuration (signal-source-popover).
 * The raw log aggregates signals from all connected sources.
 *
 * Wiring between source badges and signal-type badges (on the connector
 * bar H) is handled by the global wiring system (wiring-state +
 * wiring-overlay + wiring-drag), not by this module.
 */

import {
  onSignal,
  onDebug,
  connectLocalSSE,
} from "./signal-connection.js";
import type { ReceivedSignal } from "./signal-connection.js";
import {
  getSignalSourcesState,
  subscribeSignalSources,
  addSource,
} from "../state/signal-source-state.js";
import {
  openSourcePopover,
  getOpenSourceId,
} from "./signal-source-popover.js";
import { initRawLog, addLogEntry, addDebugEntry } from "./signal-raw-log.js";
import { createSimulatorBar } from "./simulator-bar.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

let zoneEl: HTMLElement | null = null;
let chipBar: HTMLElement | null = null;

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

  // ── Chip bar (compact row of source chips) ──
  chipBar = document.createElement("div");
  chipBar.className = "sv-chip-bar";

  // Add-source "+" button (always last)
  const addBtn = document.createElement("button");
  addBtn.className = "sv-add-chip";
  addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  addBtn.title = "Add source";
  addBtn.addEventListener("click", () => {
    const id = addSource();
    // Open popover for the newly created source after render
    requestAnimationFrame(() => {
      const newChip = chipBar?.querySelector<HTMLElement>(
        `.sv-source-chip[data-source-id="${id}"]`,
      );
      if (newChip) openSourcePopover(id, newChip);
    });
  });
  chipBar.appendChild(addBtn);

  zoneEl.appendChild(chipBar);

  // ── Simulator bar (between chips and log) ──
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

  // ── Render source chips ──
  renderSourceChips();
  subscribeSignalSources(renderSourceChips);

  // ── Wire incoming signals from ALL sources → raw log ──
  onSignal((signal: ReceivedSignal, sourceId: string) => {
    addLogEntry(signal, sourceId);
  });

  onDebug((message: string, level: "info" | "warn" | "error", sourceId: string) => {
    addDebugEntry(message, level, sourceId);
  });

  // ── Auto-connect to local signal stream (tap / emit signals) ──
  connectLocalSSE();
}

// ---------------------------------------------------------------------------
// Source chips rendering
// ---------------------------------------------------------------------------

function renderSourceChips(): void {
  if (!chipBar) return;

  // Remove existing chips (keep the "+" button)
  chipBar.querySelectorAll(".sv-source-chip").forEach((el) => el.remove());

  const { sources } = getSignalSourcesState();
  const addBtn = chipBar.querySelector(".sv-add-chip");
  const openId = getOpenSourceId();

  for (const source of sources) {
    const chip = document.createElement("button");
    chip.className = "sv-source-chip";
    if (source.id === openId) chip.classList.add("sv-source-chip--active");
    chip.dataset.sourceId = source.id;

    // Dot (identity color)
    const dot = document.createElement("span");
    dot.className = "sv-chip-dot";
    dot.style.background = source.color;
    chip.appendChild(dot);

    // Name
    const name = document.createElement("span");
    name.textContent = source.name;
    chip.appendChild(name);

    // Protocol badge
    const proto = document.createElement("span");
    proto.className = `sv-chip-proto source-block-proto--${source.protocol}`;
    proto.textContent = { websocket: "WS", sse: "SSE", openai: "AI" }[source.protocol] ?? source.protocol;
    chip.appendChild(proto);

    chip.addEventListener("click", () => openSourcePopover(source.id, chip));

    chipBar.insertBefore(chip, addBtn);
  }
}
