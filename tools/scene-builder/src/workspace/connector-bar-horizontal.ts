/**
 * Horizontal connector bar — signal ↔ choreographer hub.
 *
 * Source badges mount inside the signal pipeline node (#zone-signal).
 * Signal-type badges mount inside the rail separator (#rail-signal-choreographer).
 *
 * Each signal type badge = a channel on the bus.
 * Active badges glow with their signal-type color.
 * Source badges show which sources feed into this bus.
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
import {
  SIGNAL_TYPES,
  SIGNAL_TYPE_COLORS,
  SIGNAL_TYPE_LABELS,
} from "../views/step-commands.js";

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

/** Element inside signal node for source badges. */
let sourcesEl: HTMLElement | null = null;
/** Element inside rail for signal-type badges. */
let typesEl: HTMLElement | null = null;
let initialized = false;

/** Initialize the connector bar — sources in signal node, types in rail. */
export function initConnectorBarH(): void {
  if (initialized) return;
  initialized = true;

  // Source badges mount inside the signal node content area
  const signalContent = document.getElementById("zone-signal");
  if (signalContent) {
    sourcesEl = document.createElement("div");
    sourcesEl.className = "connector-bar-h-sources";
    signalContent.appendChild(sourcesEl);
  }

  // Signal-type badges mount inside the signal→choreo rail separator
  const rail = document.getElementById("rail-signal-choreographer");
  if (rail) {
    const badgesContainer = rail.querySelector(".pl-rail-badges");
    if (badgesContainer) {
      typesEl = badgesContainer as HTMLElement;
    }
  }

  // React to source, choreography, and wiring changes
  subscribeSignalSources(render);
  subscribeChoreography(render);
  subscribeWiring(render);
  render();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  renderSources();
  renderTypes();
}

/** Render source badges inside the signal node. */
function renderSources(): void {
  if (!sourcesEl) return;
  sourcesEl.innerHTML = "";

  const { sources } = getSignalSourcesState();

  if (sources.length === 0) {
    const hint = document.createElement("span");
    hint.className = "connector-bar-h-hint";
    hint.textContent = "No signal sources";
    sourcesEl.appendChild(hint);
    return;
  }

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

    sourcesEl.appendChild(badge);
  }
}

/** Render signal-type badges in the rail separator. */
function renderTypes(): void {
  if (!typesEl) return;
  typesEl.innerHTML = "";

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

  // Resolve active source's identity color for tinting signal-type badges
  const activeSource = activeSourceId
    ? sources.find((s) => s.id === activeSourceId) ?? null
    : null;

  for (const signalType of SIGNAL_TYPES) {
    const badge = document.createElement("button");
    badge.className = "pl-rail-badge";

    const isActive = wiredTypes.has(signalType);
    if (isActive) {
      badge.classList.add("pl-rail-badge--active");
    }

    // Wire endpoint data attributes
    badge.dataset.wireZone = "signal-type";
    badge.dataset.wireId = signalType;

    // When a source is selected, tint with its identity color
    const typeColor = SIGNAL_TYPE_COLORS[signalType] ?? "#6E6E8A";
    const color = activeSource ? activeSource.color : typeColor;

    // Colored dot
    const dot = document.createElement("span");
    dot.className = "pl-rail-badge-dot";
    dot.style.background = isActive || activeSource ? color : "#3A3A52";
    badge.appendChild(dot);

    // Short label
    const label = document.createElement("span");
    label.className = "pl-rail-badge-label";
    label.textContent = SIGNAL_TYPE_LABELS[signalType] ?? signalType;
    badge.appendChild(label);

    // Tooltip with details
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

    // Click → select first choreography of this type
    badge.addEventListener("click", () => {
      const typeChoreos = choreosByType.get(signalType);
      if (typeChoreos && typeChoreos.length > 0) {
        selectChoreography(typeChoreos[0]!.id);
      }
    });

    typesEl.appendChild(badge);
  }
}
