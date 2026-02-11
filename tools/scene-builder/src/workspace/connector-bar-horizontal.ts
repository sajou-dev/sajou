/**
 * Horizontal connector bar — signal ↔ choreographer.
 *
 * Sits between `#zone-signal` and `#zone-lower` (24px strip).
 * Shows a badge per signal source that has an active wire to a choreography.
 * Each badge shows: [●source-name → choreo-name].
 * Clicking a badge focuses the wire endpoints.
 *
 * This bar is the visual representation of signal→choreographer connections.
 * Wiring (drag-connect) is Phase 4 — for now we show badges for all
 * signal sources as potential connection points.
 */

import {
  getSignalSourcesState,
  subscribeSignalSources,
  setSignalZoneExpanded,
} from "../state/signal-source-state.js";
import {
  getWiresBetween,
  subscribeWiring,
} from "../state/wiring-state.js";
import {
  getChoreographyState,
  subscribeChoreography,
} from "../state/choreography-state.js";

// ---------------------------------------------------------------------------
// Status colors (same as signal-connector-bar.ts)
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
let initialized = false;

/** Initialize the horizontal connector bar. */
export function initConnectorBarH(): void {
  if (initialized) return;
  initialized = true;

  const container = document.getElementById("connector-bar-h");
  if (!container) return;

  barEl = document.createElement("div");
  barEl.className = "connector-bar-h-inner";
  container.appendChild(barEl);

  // Label
  const label = document.createElement("span");
  label.className = "connector-bar-h-label";
  label.textContent = "signal → choreo";
  container.insertBefore(label, barEl);

  // React to source, wiring, and choreography changes
  subscribeSignalSources(render);
  subscribeWiring(render);
  subscribeChoreography(render);
  render();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  if (!barEl) return;
  barEl.innerHTML = "";

  const { sources } = getSignalSourcesState();
  const wires = getWiresBetween("signal", "choreographer");
  const { choreographies } = getChoreographyState();

  // Build a lookup: sourceId → list of choreo names connected
  const wireMap = new Map<string, string[]>();
  for (const wire of wires) {
    const choreo = choreographies.find((c) => c.id === wire.toId);
    const names = wireMap.get(wire.fromId) ?? [];
    names.push(choreo?.on ?? "?");
    wireMap.set(wire.fromId, names);
  }

  // Show badge for each source
  for (const source of sources) {
    const badge = document.createElement("button");
    badge.className = "connector-bar-h-badge";

    const connected = wireMap.has(source.id);
    if (connected) {
      badge.classList.add("connector-bar-h-badge--wired");
    }

    badge.title = connected
      ? `${source.name} → ${wireMap.get(source.id)!.join(", ")}`
      : `${source.name} (no wire)`;

    // Status dot
    const dot = document.createElement("span");
    dot.className = "connector-bar-h-dot";
    dot.style.background = STATUS_DOT_COLORS[source.status] ?? STATUS_DOT_COLORS.disconnected;
    badge.appendChild(dot);

    // Source name
    const nameSpan = document.createElement("span");
    nameSpan.className = "connector-bar-h-name";
    nameSpan.textContent = source.name;
    badge.appendChild(nameSpan);

    // Arrow + target if wired
    if (connected) {
      const arrow = document.createElement("span");
      arrow.className = "connector-bar-h-arrow";
      arrow.textContent = "→";
      badge.appendChild(arrow);

      const targets = wireMap.get(source.id)!;
      const targetSpan = document.createElement("span");
      targetSpan.className = "connector-bar-h-target";
      targetSpan.textContent = targets.join(", ");
      badge.appendChild(targetSpan);
    }

    // Rate
    if (source.eventsPerSecond > 0) {
      const rateSpan = document.createElement("span");
      rateSpan.className = "connector-bar-h-rate";
      rateSpan.textContent = `${source.eventsPerSecond}/s`;
      badge.appendChild(rateSpan);
    }

    badge.addEventListener("click", () => {
      // Click badge → expand signal zone, focus on source
      setSignalZoneExpanded(true);
    });

    barEl.appendChild(badge);
  }

  // Empty state
  if (sources.length === 0) {
    const hint = document.createElement("span");
    hint.className = "connector-bar-h-hint";
    hint.textContent = "No signal sources configured";
    barEl.appendChild(hint);
  }
}
