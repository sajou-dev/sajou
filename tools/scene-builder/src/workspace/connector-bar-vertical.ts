/**
 * Vertical connector bar — choreographer ↔ visual.
 *
 * Mounts badges inside the rail separator (#rail-choreographer-visual).
 * Wired choreographies sit above the badge block (active),
 * unwired ones sit below (inactive / grayed out).
 *
 * Clicking a badge focuses the choreography in the editor.
 */

import {
  getChoreographyState,
  selectChoreography,
  subscribeChoreography,
} from "../state/choreography-state.js";
import {
  getWiresBetween,
  subscribeWiring,
} from "../state/wiring-state.js";
import { SIGNAL_TYPE_COLORS, SIGNAL_TYPE_LABELS } from "../views/step-commands.js";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Wired choreographies (above). */
let wiredEl: HTMLElement | null = null;
/** Unwired choreographies (below). */
let unwiredEl: HTMLElement | null = null;
let initialized = false;

/** Initialize the vertical connector bar inside the choreo→visual rail. */
export function initConnectorBarV(): void {
  if (initialized) return;
  initialized = true;

  const rail = document.getElementById("rail-choreographer-visual");
  if (!rail) return;

  const badgesContainer = rail.querySelector(".pl-rail-badges");

  // Wired section — above badges
  wiredEl = document.createElement("div");
  wiredEl.className = "pl-rail-sources";

  // Unwired section — below badges
  unwiredEl = document.createElement("div");
  unwiredEl.className = "pl-rail-sources pl-rail-sources--inactive";

  if (badgesContainer) {
    rail.insertBefore(wiredEl, badgesContainer);
    if (badgesContainer.nextSibling) {
      rail.insertBefore(unwiredEl, badgesContainer.nextSibling);
    } else {
      rail.appendChild(unwiredEl);
    }
  } else {
    rail.appendChild(wiredEl);
    rail.appendChild(unwiredEl);
  }

  subscribeChoreography(render);
  subscribeWiring(render);
  render();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  const { choreographies } = getChoreographyState();
  const wires = getWiresBetween("choreographer", "theme");
  const wiredSet = new Set(wires.map((w) => w.fromId));

  const wiredChoreos = choreographies.filter((c) => wiredSet.has(c.id));
  const unwiredChoreos = choreographies.filter((c) => !wiredSet.has(c.id));

  // Wired (above, active)
  if (wiredEl) {
    wiredEl.innerHTML = "";
    wiredEl.style.display = wiredChoreos.length === 0 ? "none" : "";
    for (const choreo of wiredChoreos) {
      wiredEl.appendChild(createChoreoBadge(choreo, true));
    }
  }

  // Unwired (below, inactive)
  if (unwiredEl) {
    unwiredEl.innerHTML = "";
    unwiredEl.style.display = unwiredChoreos.length === 0 ? "none" : "";
    for (const choreo of unwiredChoreos) {
      unwiredEl.appendChild(createChoreoBadge(choreo, false));
    }
  }
}

/** Create a choreography badge element. */
function createChoreoBadge(
  choreo: { id: string; on: string },
  wired: boolean,
): HTMLButtonElement {
  const badge = document.createElement("button");
  badge.className = "pl-rail-badge";

  // Wire endpoint data attributes for drag-connect system
  badge.dataset.wireZone = "choreographer";
  badge.dataset.wireId = choreo.id;

  if (wired) {
    badge.classList.add("pl-rail-badge--active");
  } else {
    badge.classList.add("pl-rail-badge--inactive");
  }

  // Color by signal type
  const color = SIGNAL_TYPE_COLORS[choreo.on] ?? "#6E6E8A";

  // Dot
  const dot = document.createElement("span");
  dot.className = "pl-rail-badge-dot";
  dot.style.background = wired ? color : "#6E6E8A";
  badge.appendChild(dot);

  // Label (use short label like in signal→choreo rail)
  const label = document.createElement("span");
  label.className = "pl-rail-badge-label";
  label.textContent = SIGNAL_TYPE_LABELS[choreo.on] ?? choreo.on;
  badge.appendChild(label);

  badge.title = `${choreo.on}${wired ? " (wired to visual)" : " (drag to connect)"}`;

  badge.addEventListener("click", () => {
    selectChoreography(choreo.id);
  });

  return badge;
}
