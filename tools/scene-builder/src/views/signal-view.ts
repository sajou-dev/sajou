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
} from "./signal-connection.js";
import type { ReceivedSignal } from "./signal-connection.js";
import {
  getSignalSourcesState,
  subscribeSignalSources,
  addSource,
  getLocalSources,
  getRemoteSources,
} from "../state/signal-source-state.js";
import {
  openSourcePopover,
  getOpenSourceId,
} from "./signal-source-popover.js";
import { initRawLog, addLogEntry, addDebugEntry } from "./signal-raw-log.js";
import { createSimulatorBar } from "./simulator-bar.js";
import { scanAndSyncLocal } from "../state/local-discovery.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

let zoneEl: HTMLElement | null = null;
let chipBar: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let initialized = false;
let rescanBtn: HTMLButtonElement | null = null;

/** Initialize the Signal view. Idempotent — only runs once. */
export function initSignalView(): void {
  if (initialized) return;
  initialized = true;

  zoneEl = document.getElementById("zone-signal");
  if (!zoneEl) return;

  // ── Chip bar (compact row of source chips) ──
  chipBar = document.createElement("div");
  chipBar.className = "sv-chip-bar";

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

  // ── Auto-discover local services (replaces connectLocalSSE) ──
  scanAndSyncLocal();
}

// ---------------------------------------------------------------------------
// Source chips rendering
// ---------------------------------------------------------------------------

/** Rescan icon SVG (Lucide rotate-cw, 14x14). */
const RESCAN_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;

/** Add icon SVG (plus, 14x14). */
const ADD_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

/** Protocol label map for chip badges. */
const PROTO_LABELS: Record<string, string> = {
  websocket: "WS",
  sse: "SSE",
  openai: "AI",
  anthropic: "ANTH",
  openclaw: "CLAW",
  midi: "MIDI",
};

function renderSourceChips(): void {
  if (!chipBar) return;
  chipBar.innerHTML = "";

  const localSources = getLocalSources();
  const remoteSources = getRemoteSources();
  const openId = getOpenSourceId();

  // ── LOCAL section ──
  const localSection = document.createElement("div");
  localSection.className = "sv-chip-section sv-chip-section--local";

  const localHeader = document.createElement("span");
  localHeader.className = "sv-chip-section-header";
  localHeader.textContent = "LOCAL";
  localSection.appendChild(localHeader);

  // Rescan button
  rescanBtn = document.createElement("button");
  rescanBtn.className = "sv-rescan-btn";
  rescanBtn.innerHTML = RESCAN_ICON;
  rescanBtn.title = "Rescan local services";
  rescanBtn.addEventListener("click", async () => {
    if (rescanBtn) {
      rescanBtn.classList.add("sv-rescan-btn--spinning");
    }
    await scanAndSyncLocal();
    // Remove spinner after a brief visual feedback
    setTimeout(() => {
      rescanBtn?.classList.remove("sv-rescan-btn--spinning");
    }, 400);
  });
  localSection.appendChild(rescanBtn);

  for (const source of localSources) {
    localSection.appendChild(createChipElement(source, openId));
  }

  chipBar.appendChild(localSection);

  // ── Separator ──
  const sep = document.createElement("div");
  sep.className = "sv-chip-separator";
  chipBar.appendChild(sep);

  // ── REMOTE section ──
  const remoteSection = document.createElement("div");
  remoteSection.className = "sv-chip-section sv-chip-section--remote";

  const remoteHeader = document.createElement("span");
  remoteHeader.className = "sv-chip-section-header";
  remoteHeader.textContent = "REMOTE";
  remoteSection.appendChild(remoteHeader);

  for (const source of remoteSources) {
    remoteSection.appendChild(createChipElement(source, openId));
  }

  // Add-source "+" button (only in remote section)
  const addBtn = document.createElement("button");
  addBtn.className = "sv-add-chip";
  addBtn.innerHTML = ADD_ICON;
  addBtn.title = "Add remote source";
  addBtn.addEventListener("click", () => {
    const id = addSource();
    requestAnimationFrame(() => {
      const newChip = chipBar?.querySelector<HTMLElement>(
        `.sv-source-chip[data-source-id="${id}"]`,
      );
      if (newChip) openSourcePopover(id, newChip);
    });
  });
  remoteSection.appendChild(addBtn);

  chipBar.appendChild(remoteSection);
}

/** Create a single chip element for a source. */
function createChipElement(source: { id: string; name: string; color: string; protocol: string; status: string }, openId: string | null): HTMLButtonElement {
  const chip = document.createElement("button");
  chip.className = "sv-source-chip";
  if (source.id === openId) chip.classList.add("sv-source-chip--active");
  if (source.status === "unavailable") chip.classList.add("sv-source-chip--unavailable");
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
  proto.textContent = PROTO_LABELS[source.protocol] ?? source.protocol;
  chip.appendChild(proto);

  if (source.status !== "unavailable") {
    chip.addEventListener("click", () => openSourcePopover(source.id, chip));
  }

  return chip;
}
