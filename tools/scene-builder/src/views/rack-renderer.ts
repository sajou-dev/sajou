/**
 * Rack renderer — renders choreographies as interlocking block chains.
 *
 * Each ChoreographyDef becomes a chain of blocks:
 *   hat (when) → action blocks → drop zone
 *
 * No separate head/dock split — the chain IS the choreography.
 * The hat block handles trigger config + collapse/delete controls.
 */

import type { ChoreographyDef } from "../types.js";
import {
  getChoreographyState,
  selectChoreographyStep,
} from "../state/choreography-state.js";
import { renderNodeDetail } from "./node-detail-inline.js";
import { renderStepChain } from "./step-chain.js";
import { SIGNAL_TYPE_COLORS } from "./step-commands.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Render all choreographies into the container. */
export function renderAllRacks(container: HTMLElement): void {
  container.innerHTML = "";

  const { choreographies, selectedChoreographyId } = getChoreographyState();

  for (const choreo of choreographies) {
    const isSelected = choreo.id === selectedChoreographyId;
    container.appendChild(renderRack(choreo, isSelected));
  }
}

// ---------------------------------------------------------------------------
// Render single rack
// ---------------------------------------------------------------------------

/** Render a single choreography as an interlocking block chain. */
function renderRack(choreo: ChoreographyDef, isSelected: boolean): HTMLElement {
  const rack = document.createElement("div");
  rack.className = "rack" + (isSelected ? " rack--selected" : "");
  rack.dataset.choreoId = choreo.id;

  const color = SIGNAL_TYPE_COLORS[choreo.on] ?? "#6E6E8A";
  rack.style.setProperty("--dock-color", color);

  // The chain handles everything: hat + steps + drop zone
  const chain = renderStepChain(choreo, {
    onStepClick: (stepId) => {
      const { selectedStepId } = getChoreographyState();
      selectChoreographyStep(stepId === selectedStepId ? null : stepId);
    },
    onAddClick: () => {
      // No-op — palette replaces the picker
    },
  });
  rack.appendChild(chain);

  // Detail panel (when selected, expanded)
  if (isSelected && !choreo.collapsed) {
    const detail = document.createElement("div");
    detail.className = "rack-detail";
    detail.appendChild(renderNodeDetail(choreo));
    rack.appendChild(detail);
  }

  return rack;
}
