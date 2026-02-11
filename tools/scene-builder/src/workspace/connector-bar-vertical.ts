/**
 * Vertical connector bar — choreographer ↔ theme.
 *
 * Renders badges on the rideau (vertical slider) showing choreographer→theme connections.
 * Each badge represents a choreography that is wired to a theme slot.
 * For now (Phase 3), shows a badge per choreography as potential connection points.
 *
 * Badges are vertically stacked, anchored to the rideau's center line.
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

// ---------------------------------------------------------------------------
// Signal type colors (reuse from timeline palette)
// ---------------------------------------------------------------------------

const SIGNAL_TYPE_COLORS: Record<string, string> = {
  task_dispatch: "#E8A851",
  tool_call: "#5B8DEF",
  tool_result: "#4EC9B0",
  token_usage: "#C586C0",
  agent_state_change: "#6A9955",
  error: "#F44747",
  completion: "#4EC9B0",
};

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let containerEl: HTMLElement | null = null;
let initialized = false;

/** Initialize the vertical connector bar on the rideau. */
export function initConnectorBarV(): void {
  if (initialized) return;
  initialized = true;

  const rideau = document.getElementById("rideau");
  if (!rideau) return;

  containerEl = document.createElement("div");
  containerEl.className = "connector-bar-v";
  rideau.appendChild(containerEl);

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

    badge.title = `${choreo.on}${wired ? " (wired to theme)" : ""}`;

    badge.addEventListener("click", () => {
      selectChoreography(choreo.id);
    });

    containerEl.appendChild(badge);
  }
}
