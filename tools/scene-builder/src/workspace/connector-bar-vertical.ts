/**
 * Vertical connector bar — choreographer ↔ visual.
 *
 * Mounts badges inside the rail separator (#rail-choreographer-visual).
 * Each badge represents a choreography as a connection point
 * to the visual/theme stage.
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
import { SIGNAL_TYPE_COLORS } from "../views/step-commands.js";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let containerEl: HTMLElement | null = null;
let initialized = false;

/** Initialize the vertical connector bar inside the choreo→visual rail. */
export function initConnectorBarV(): void {
  if (initialized) return;
  initialized = true;

  // Mount inside the choreographer→visual rail separator
  const rail = document.getElementById("rail-choreographer-visual");
  if (!rail) return;

  const badgesContainer = rail.querySelector(".pl-rail-badges");
  if (badgesContainer) {
    containerEl = badgesContainer as HTMLElement;
  }

  subscribeChoreography(render);
  subscribeWiring(render);
  render();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  if (!containerEl) return;
  containerEl.innerHTML = "";

  const { choreographies } = getChoreographyState();
  const wires = getWiresBetween("choreographer", "theme");

  // Build lookup: choreoId → wired
  const wiredSet = new Set(wires.map((w) => w.fromId));

  for (const choreo of choreographies) {
    const badge = document.createElement("button");
    badge.className = "pl-rail-badge";

    // Wire endpoint data attributes for drag-connect system
    badge.dataset.wireZone = "choreographer";
    badge.dataset.wireId = choreo.id;

    const wired = wiredSet.has(choreo.id);
    if (wired) {
      badge.classList.add("pl-rail-badge--active");
    }

    // Color by signal type
    const color = SIGNAL_TYPE_COLORS[choreo.on] ?? "#6E6E8A";

    // Dot
    const dot = document.createElement("span");
    dot.className = "pl-rail-badge-dot";
    dot.style.background = wired ? color : "#6E6E8A";
    badge.appendChild(dot);

    // Label
    const label = document.createElement("span");
    label.className = "pl-rail-badge-label";
    label.textContent = choreo.on;
    badge.appendChild(label);

    badge.title = `${choreo.on}${wired ? " (wired to visual)" : " (drag to connect)"}`;

    badge.addEventListener("click", () => {
      selectChoreography(choreo.id);
    });

    containerEl.appendChild(badge);
  }
}
