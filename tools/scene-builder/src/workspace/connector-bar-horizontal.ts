/**
 * Horizontal connector bar — signal ↔ choreographer hub.
 *
 * Sits between `#zone-signal` and `#zone-choreographer` inside `#zone-left`.
 * TouchDesigner-style hub: shows **signal types** (token_usage, tool_call, …)
 * as connection endpoints that link the signal stream to choreographies.
 *
 * Each signal type badge = a channel on the bus.
 * Active badges glow with their signal-type color.
 * Source badges show which sources feed into this bus.
 *
 * Also supports drag-resize: dragging the bar up/down adjusts the
 * signal/choreographer split ratio within the left column.
 *
 * Bézier wires from signal-view source blocks converge onto this bar.
 */

import {
  getSignalSourcesState,
  subscribeSignalSources,
} from "../state/signal-source-state.js";
import {
  getChoreographyState,
  subscribeChoreography,
  selectChoreography,
} from "../state/choreography-state.js";
import { subscribeWiring } from "../state/wiring-state.js";
import {
  getAllActiveSignalTypes,
  getChoreoInputInfo,
} from "../state/wiring-queries.js";

// ---------------------------------------------------------------------------
// Signal type definitions (channels on the bus)
// ---------------------------------------------------------------------------

/** All known signal types — these appear as connection endpoints. */
const SIGNAL_TYPES: string[] = [
  "task_dispatch", "tool_call", "tool_result",
  "token_usage", "agent_state_change", "error", "completion",
];

/** Signal type badge colors (shared palette). */
const SIGNAL_TYPE_COLORS: Record<string, string> = {
  task_dispatch: "#E8A851",
  tool_call: "#5B8DEF",
  tool_result: "#4EC9B0",
  token_usage: "#C586C0",
  agent_state_change: "#6A9955",
  error: "#F44747",
  completion: "#4EC9B0",
  event: "#8E8EA0",
};

/** Short display labels for signal types. */
const SIGNAL_TYPE_LABELS: Record<string, string> = {
  task_dispatch: "task",
  tool_call: "tool↗",
  tool_result: "tool↙",
  token_usage: "tokens",
  agent_state_change: "state",
  error: "error",
  completion: "done",
  event: "event",
};

/** Status dot colors for sources. */
const STATUS_DOT_COLORS: Record<string, string> = {
  disconnected: "#6E6E8A",
  connecting: "#E8A851",
  connected: "#4A9E6E",
  error: "#C44040",
};

// ---------------------------------------------------------------------------
// Active source selection
// ---------------------------------------------------------------------------

/**
 * Which source badge is "active" (selected) on the bar-H.
 * When set, signal-type badges are tinted with the source's identity color
 * and drag-to-create/connect will auto-create signal→signal-type wires.
 * null = union view (all sources, default signal-type colors).
 */
let activeSourceId: string | null = null;

/** Listeners notified when the active source changes. */
const activeSourceListeners: Array<() => void> = [];

/** Get the currently active source on the bar-H (null = union view). */
export function getActiveBarHSource(): string | null {
  return activeSourceId;
}

/** Set the active source on the bar-H. Triggers re-render + notifications. */
export function setActiveBarHSource(id: string | null): void {
  activeSourceId = id;
  render();
  for (const fn of activeSourceListeners) fn();
}

/** Subscribe to active source changes. Returns unsubscribe function. */
export function subscribeActiveSource(fn: () => void): () => void {
  activeSourceListeners.push(fn);
  return () => {
    const idx = activeSourceListeners.indexOf(fn);
    if (idx >= 0) activeSourceListeners.splice(idx, 1);
  };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let barEl: HTMLElement | null = null;
let containerEl: HTMLElement | null = null;
let initialized = false;

/** Initialize the horizontal connector bar. */
export function initConnectorBarH(): void {
  if (initialized) return;
  initialized = true;

  containerEl = document.getElementById("connector-bar-h");
  if (!containerEl) return;

  barEl = document.createElement("div");
  barEl.className = "connector-bar-h-inner";
  containerEl.appendChild(barEl);

  // Drag-to-resize signal/choreo split
  initDragResize(containerEl);

  // React to source, choreography, and wiring changes
  subscribeSignalSources(render);
  subscribeChoreography(render);
  subscribeWiring(render);
  render();
}

// ---------------------------------------------------------------------------
// Drag resize — adjust signal/choreographer split
// ---------------------------------------------------------------------------

function initDragResize(bar: HTMLElement): void {
  let dragging = false;
  let startY = 0;
  let startSignalHeight = 0;

  bar.addEventListener("mousedown", (e: MouseEvent) => {
    // Only respond to direct bar clicks (not badge clicks)
    if ((e.target as HTMLElement).closest("button")) return;

    const zoneSignal = document.getElementById("zone-signal");
    if (!zoneSignal) return;

    dragging = true;
    startY = e.clientY;
    startSignalHeight = zoneSignal.getBoundingClientRect().height;

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging) return;

    const zoneSignal = document.getElementById("zone-signal");
    if (!zoneSignal) return;

    const delta = e.clientY - startY;
    const newHeight = Math.max(60, startSignalHeight + delta);
    zoneSignal.style.height = `${newHeight}px`;
    zoneSignal.style.flex = "none";

    // Redraw signal wires on resize
    window.dispatchEvent(new Event("resize"));
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  if (!barEl) return;
  barEl.innerHTML = "";

  const { sources } = getSignalSourcesState();
  const { choreographies } = getChoreographyState();

  // Determine which signal types are active (wire-driven, with on fallback)
  const wiredTypes = getAllActiveSignalTypes();

  // Build choreo lookup by effective signal type (wire-driven)
  const choreosByType = new Map<string, typeof choreographies>();
  for (const choreo of choreographies) {
    const info = getChoreoInputInfo(choreo.id);
    for (const sigType of info.effectiveTypes) {
      const list = choreosByType.get(sigType) ?? [];
      list.push(choreo);
      choreosByType.set(sigType, list);
    }
  }

  // ── Row 1: Source badges ──
  const sourcesRow = document.createElement("div");
  sourcesRow.className = "connector-bar-h-row connector-bar-h-row--sources";

  if (sources.length > 0) {
    for (const source of sources) {
      const isSelected = activeSourceId === source.id;
      const badge = document.createElement("button");
      badge.className = "connector-bar-h-badge";
      if (isSelected) badge.classList.add("connector-bar-h-badge--selected");
      badge.dataset.wireZone = "signal";
      badge.dataset.wireId = source.id;

      // Identity color: border + text tint
      badge.style.borderColor = isSelected ? source.color : `${source.color}44`;
      badge.style.color = source.color;

      const dot = document.createElement("span");
      dot.className = "connector-bar-h-dot";
      dot.style.background = STATUS_DOT_COLORS[source.status] ?? STATUS_DOT_COLORS.disconnected;
      badge.appendChild(dot);

      const nameSpan = document.createElement("span");
      nameSpan.className = "connector-bar-h-name";
      nameSpan.textContent = source.name;
      badge.appendChild(nameSpan);

      if (source.eventsPerSecond > 0) {
        const rateSpan = document.createElement("span");
        rateSpan.className = "connector-bar-h-rate";
        rateSpan.textContent = `${source.eventsPerSecond}/s`;
        badge.appendChild(rateSpan);
      }

      // Click to toggle active source
      badge.addEventListener("click", (e: MouseEvent) => {
        e.stopPropagation();
        setActiveBarHSource(isSelected ? null : source.id);
      });

      sourcesRow.appendChild(badge);
    }
  } else {
    const hint = document.createElement("span");
    hint.className = "connector-bar-h-hint";
    hint.textContent = "No signal sources";
    sourcesRow.appendChild(hint);
  }

  barEl.appendChild(sourcesRow);

  // ── Row 2: Signal type badges (connection channels) ──
  const typesRow = document.createElement("div");
  typesRow.className = "connector-bar-h-row connector-bar-h-row--types";

  // Resolve active source's identity color for tinting signal-type badges
  const activeSource = activeSourceId
    ? sources.find((s) => s.id === activeSourceId) ?? null
    : null;

  for (const signalType of SIGNAL_TYPES) {
    const badge = document.createElement("button");
    badge.className = "connector-bar-h-type-badge";

    const isActive = wiredTypes.has(signalType);
    if (isActive) {
      badge.classList.add("connector-bar-h-type-badge--active");
    }

    // Wire endpoint data attributes
    badge.dataset.wireZone = "signal-type";
    badge.dataset.wireId = signalType;

    // When a source is selected, tint with its identity color
    const typeColor = SIGNAL_TYPE_COLORS[signalType] ?? "#6E6E8A";
    const color = activeSource ? activeSource.color : typeColor;

    // Colored dot
    const dot = document.createElement("span");
    dot.className = "connector-bar-h-type-dot";
    dot.style.background = isActive || activeSource ? color : "#3A3A52";
    badge.appendChild(dot);

    // Label
    const label = document.createElement("span");
    label.textContent = SIGNAL_TYPE_LABELS[signalType] ?? signalType;
    badge.appendChild(label);

    // Count of choreographies on this type
    const choreos = choreosByType.get(signalType);
    if (choreos && choreos.length > 0) {
      badge.style.borderColor = color + "66";
      badge.style.color = color;

      badge.title = `${signalType}: ${choreos.length} choreograph${choreos.length > 1 ? "ies" : "y"}`;
    } else if (activeSource) {
      badge.style.borderColor = `${color}33`;
      badge.style.color = `${color}99`;
      badge.title = `${signalType} (${activeSource.name})`;
    } else {
      badge.title = `${signalType} (no choreographies)`;
    }

    // Click → select first choreography of this type, or hint to create one
    badge.addEventListener("click", () => {
      const typeChoreos = choreosByType.get(signalType);
      if (typeChoreos && typeChoreos.length > 0) {
        selectChoreography(typeChoreos[0]!.id);
      }
    });

    typesRow.appendChild(badge);
  }

  barEl.appendChild(typesRow);
}
