/**
 * Vertical connector bar — choreographer ↔ theme.
 *
 * In the pipeline layout, renders badges inside the choreographer node.
 * Each badge represents a choreography as a potential connection point
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

/** Initialize the vertical connector bar inside the choreographer pipeline node. */
export function initConnectorBarV(): void {
  if (initialized) return;
  initialized = true;

  // Mount inside the choreographer pipeline node's content area
  const choreoContent = document.getElementById("zone-choreographer");
  if (!choreoContent) return;

  containerEl = document.createElement("div");
  containerEl.className = "connector-bar-v";
  choreoContent.appendChild(containerEl);

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
    badge.className = "connector-bar-v-badge";

    // Wire endpoint data attributes for drag-connect system
    badge.dataset.wireZone = "choreographer";
    badge.dataset.wireId = choreo.id;

    const wired = wiredSet.has(choreo.id);
    if (wired) {
      badge.classList.add("connector-bar-v-badge--wired");
    }

    // Color by signal type
    const color = SIGNAL_TYPE_COLORS[choreo.on] ?? "#6E6E8A";

    // Dot
    const dot = document.createElement("span");
    dot.className = "connector-bar-v-dot";
    dot.style.background = wired ? color : "#6E6E8A";
    badge.appendChild(dot);

    badge.title = `${choreo.on}${wired ? " (wired to theme)" : " (drag to connect)"}`;

    badge.addEventListener("click", () => {
      selectChoreography(choreo.id);
    });

    containerEl.appendChild(badge);
  }
}
