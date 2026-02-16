/**
 * Horizontal connector bar — signal ↔ choreographer hub.
 *
 * Model badges and signal-type badges both mount inside the rail
 * separator (#rail-signal-choreographer).
 *
 * Each signal type badge = a channel on the bus.
 * Active badges glow with their signal-type color.
 * Model badges show connected sources with a selected model.
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

/** Element for connected-source badges (above signal-types). */
let connectedEl: HTMLElement | null = null;
/** Element for signal-type badges (centered). */
let typesEl: HTMLElement | null = null;
/** Element for inactive (disconnected) source badges (below signal-types). */
let inactiveEl: HTMLElement | null = null;
let initialized = false;

/** Initialize the connector bar — sources and signal-types in rail. */
export function initConnectorBarH(): void {
  if (initialized) return;
  initialized = true;

  // All sections mount inside the signal→choreo rail separator
  const rail = document.getElementById("rail-signal-choreographer");
  if (rail) {
    const badgesContainer = rail.querySelector(".pl-rail-badges");

    // Connected sources — above signal-types
    connectedEl = document.createElement("div");
    connectedEl.className = "pl-rail-sources";

    // Inactive sources — below signal-types
    inactiveEl = document.createElement("div");
    inactiveEl.className = "pl-rail-sources pl-rail-sources--inactive";

    if (badgesContainer) {
      rail.insertBefore(connectedEl, badgesContainer);
      typesEl = badgesContainer as HTMLElement;
      // Insert inactive section after signal-types
      if (badgesContainer.nextSibling) {
        rail.insertBefore(inactiveEl, badgesContainer.nextSibling);
      } else {
        rail.appendChild(inactiveEl);
      }
    } else {
      rail.appendChild(connectedEl);
      rail.appendChild(inactiveEl);
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

/** Render source badges — connected above signal-types, inactive below. */
function renderSources(): void {
  const { sources } = getSignalSourcesState();
  const connected = sources.filter((s) => s.status === "connected");
  const inactive = sources.filter((s) => s.status !== "connected");

  // Connected sources (above)
  if (connectedEl) {
    connectedEl.innerHTML = "";
    connectedEl.style.display = connected.length === 0 ? "none" : "";
    for (const source of connected) {
      connectedEl.appendChild(createSourceBadge(source, false));
    }
  }

  // Inactive sources (below)
  if (inactiveEl) {
    inactiveEl.innerHTML = "";
    inactiveEl.style.display = inactive.length === 0 ? "none" : "";
    for (const source of inactive) {
      inactiveEl.appendChild(createSourceBadge(source, true));
    }
  }
}

/** Create a source badge element. */
function createSourceBadge(source: { id: string; name: string; color: string; selectedModel: string }, inactive: boolean): HTMLButtonElement {
  const isSelected = !inactive && activeSourceId === source.id;
  const badge = document.createElement("button");
  badge.className = "pl-rail-badge";
  if (isSelected) badge.classList.add("pl-rail-badge--selected");
  if (inactive) badge.classList.add("pl-rail-badge--inactive");

  // Identity color tint (muted for inactive)
  badge.style.borderColor = isSelected ? source.color : `${source.color}44`;
  badge.style.color = source.color;

  // Colored dot
  const dot = document.createElement("span");
  dot.className = "pl-rail-badge-dot";
  dot.style.background = source.color;
  badge.appendChild(dot);

  // Model name if available, otherwise source name
  const displayName = source.selectedModel || source.name;
  const label = document.createElement("span");
  label.className = "pl-rail-badge-label";
  label.textContent = displayName;
  label.title = displayName;
  badge.appendChild(label);

  // Click to toggle active source (only for connected)
  if (!inactive) {
    badge.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
      setActiveBarHSource(isSelected ? null : source.id);
    });
  }

  return badge;
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
