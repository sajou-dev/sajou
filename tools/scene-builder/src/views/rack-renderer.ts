/**
 * Rack renderer — renders choreographies as horizontal clamps.
 *
 * Each ChoreographyDef becomes a clamp (C-shape):
 *   - Left bracket: signal type color + label (the "pince")
 *   - Inside: horizontal block chain (when filter + action blocks)
 *   - Controls: collapse/delete on the bracket
 *
 * Clamps take the full width of the rack-list container.
 */

import type { ChoreographyDef } from "../types.js";
import {
  getChoreographyState,
  selectChoreography,
  toggleNodeCollapsed,
  selectChoreographyStep,
} from "../state/choreography-state.js";
import { removeChoreography } from "../state/choreography-state.js";
import { renderNodeDetail } from "./node-detail-inline.js";
import { renderStepChain } from "./step-chain.js";
import { openStepPopover, closeStepPopover } from "./step-popover.js";
import { SIGNAL_TYPE_COLORS, SIGNAL_TYPE_LABELS } from "./step-commands.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Render all choreographies as clamps into the container. */
export function renderAllRacks(container: HTMLElement): void {
  container.innerHTML = "";

  const { choreographies, selectedChoreographyId } = getChoreographyState();

  for (const choreo of choreographies) {
    const isSelected = choreo.id === selectedChoreographyId;
    const rack = renderClamp(choreo, isSelected);
    container.appendChild(rack);
  }
}

// ---------------------------------------------------------------------------
// Render single clamp
// ---------------------------------------------------------------------------

/** Render a single choreography clamp. */
function renderClamp(choreo: ChoreographyDef, isSelected: boolean): HTMLElement {
  const rack = document.createElement("div");
  rack.className = "rack" + (isSelected ? " rack--selected" : "");
  rack.dataset.choreoId = choreo.id;

  const primaryType = choreo.on;
  const color = SIGNAL_TYPE_COLORS[primaryType] ?? "#6E6E8A";

  // ── Left bracket (signal type) ──
  const bracket = document.createElement("div");
  bracket.className = "rack-bracket";
  bracket.style.setProperty("--clamp-color", color);

  // Signal type label (rotated in CSS)
  const label = document.createElement("span");
  label.className = "rack-bracket-label";
  label.textContent = SIGNAL_TYPE_LABELS[primaryType] ?? primaryType;
  bracket.appendChild(label);

  // Controls row under the label
  const controls = document.createElement("div");
  controls.className = "rack-bracket-controls";

  const collapseBtn = document.createElement("button");
  collapseBtn.className = "rack-bracket-btn";
  collapseBtn.textContent = choreo.collapsed ? "\u25B6" : "\u25BC"; // ▶ or ▼
  collapseBtn.title = choreo.collapsed ? "Expand" : "Collapse";
  collapseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleNodeCollapsed(choreo.id);
  });
  controls.appendChild(collapseBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "rack-bracket-btn rack-bracket-btn--delete";
  deleteBtn.textContent = "\u2716"; // ✖
  deleteBtn.title = "Delete";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeChoreography(choreo.id);
  });
  controls.appendChild(deleteBtn);

  bracket.appendChild(controls);

  // Click bracket → select/deselect
  bracket.addEventListener("click", (e) => {
    e.stopPropagation();
    const { selectedChoreographyId } = getChoreographyState();
    selectChoreography(selectedChoreographyId === choreo.id ? null : choreo.id);
  });

  rack.appendChild(bracket);

  // ── Content area (right of bracket) ──
  const content = document.createElement("div");
  content.className = "rack-content";

  if (!choreo.collapsed) {
    // Block chain
    const chain = renderStepChain(choreo, {
      onStepClick: (stepId) => {
        const { selectedStepId } = getChoreographyState();
        if (stepId === selectedStepId) {
          closeStepPopover();
          selectChoreographyStep(null);
        } else {
          selectChoreographyStep(stepId);
          requestAnimationFrame(() => {
            const livePill = document.querySelector(
              `.rack[data-choreo-id="${choreo.id}"] .nc-block[data-step-id="${stepId}"]`,
            );
            if (livePill) openStepPopover(stepId, choreo.id, livePill as HTMLElement);
          });
        }
      },
      onAddClick: () => {
        // No-op — palette replaces the picker
      },
    });
    content.appendChild(chain);

    // Inline detail (when selected)
    if (isSelected) {
      const detail = document.createElement("div");
      detail.className = "rack-detail";
      detail.appendChild(renderNodeDetail(choreo));
      content.appendChild(detail);
    }
  } else {
    // Collapsed: just show step count
    const collapsed = document.createElement("div");
    collapsed.className = "rack-collapsed";
    collapsed.textContent = `${choreo.steps.length} step${choreo.steps.length !== 1 ? "s" : ""}`;
    content.appendChild(collapsed);
  }

  rack.appendChild(content);

  return rack;
}
