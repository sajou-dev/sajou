/**
 * Signal connector bar — compact mode representation of the signal zone.
 *
 * Shows a row of badge chips: [●name rate] for each active source.
 * Clicking a badge expands the signal zone and focuses that source.
 * "+" button adds a new source.
 *
 * Height: ~40px. Replaces the full signal zone in compact mode.
 */

import {
  getSignalSourcesState,
  subscribeSignalSources,
  setSignalZoneExpanded,
  selectSource,
  addSource,
} from "../state/signal-source-state.js";

// ---------------------------------------------------------------------------
// Status colors for badge dots
// ---------------------------------------------------------------------------

const STATUS_DOT_COLORS: Record<string, string> = {
  disconnected: "#6E6E8A",
  connecting: "#E8A851",
  connected: "#4A9E6E",
  error: "#C44040",
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let barEl: HTMLElement | null = null;

/** Initialize the connector bar inside the given parent element. */
export function initSignalConnectorBar(parent: HTMLElement): void {
  barEl = document.createElement("div");
  barEl.className = "connector-bar connector-bar--signal";
  parent.appendChild(barEl);

  subscribeSignalSources(render);
  render();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  if (!barEl) return;
  barEl.innerHTML = "";

  const { sources } = getSignalSourcesState();

  for (const source of sources) {
    const badge = document.createElement("button");
    badge.className = "connector-badge";
    badge.title = `${source.name} — click to expand`;

    // Status dot
    const dot = document.createElement("span");
    dot.className = "connector-badge-dot";
    dot.style.background = STATUS_DOT_COLORS[source.status] ?? STATUS_DOT_COLORS.disconnected;
    badge.appendChild(dot);

    // Name
    const nameSpan = document.createElement("span");
    nameSpan.className = "connector-badge-name";
    const protoPrefix = source.protocol === "midi" ? "midi" : source.protocol === "websocket" ? "ws" : source.protocol === "openai" ? "ai" : source.protocol === "openclaw" ? "claw" : "sse";
    nameSpan.textContent = `${protoPrefix}:${source.name}`;
    badge.appendChild(nameSpan);

    // Rate
    if (source.eventsPerSecond > 0) {
      const rateSpan = document.createElement("span");
      rateSpan.className = "connector-badge-rate";
      rateSpan.textContent = `${source.eventsPerSecond}/s`;
      badge.appendChild(rateSpan);
    }

    badge.addEventListener("click", () => {
      selectSource(source.id);
      setSignalZoneExpanded(true);
    });

    barEl.appendChild(badge);
  }

  // Add button
  const addBtn = document.createElement("button");
  addBtn.className = "connector-badge connector-badge--add";
  addBtn.textContent = "+";
  addBtn.title = "Add source";
  addBtn.addEventListener("click", () => {
    addSource();
    setSignalZoneExpanded(true);
  });
  barEl.appendChild(addBtn);
}
