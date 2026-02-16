/**
 * Rack renderer — renders choreographies as dock-shaped containers.
 *
 * Each ChoreographyDef becomes a dock:
 *   - Head block: "when <signal_type>" — the trigger function (first visible)
 *   - Dock groove: horizontal channel where action blocks sit
 *   - Controls: collapse/delete in the head
 *
 * The dock is open-ended on the right (not a box). Top/bottom rails
 * extend from the head, creating a groove for snapping action blocks.
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
import { SIGNAL_TYPE_COLORS, SIGNAL_TYPE_LABELS } from "./step-commands.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Render all choreographies as docks into the container. */
export function renderAllRacks(container: HTMLElement): void {
  container.innerHTML = "";

  const { choreographies, selectedChoreographyId } = getChoreographyState();

  for (const choreo of choreographies) {
    const isSelected = choreo.id === selectedChoreographyId;
    const rack = renderDock(choreo, isSelected);
    container.appendChild(rack);
  }
}

// ---------------------------------------------------------------------------
// Render single dock
// ---------------------------------------------------------------------------

/** Render a single choreography as a dock. */
function renderDock(choreo: ChoreographyDef, isSelected: boolean): HTMLElement {
  const rack = document.createElement("div");
  rack.className = "rack" + (isSelected ? " rack--selected" : "");
  rack.dataset.choreoId = choreo.id;

  const primaryType = choreo.on;
  const color = SIGNAL_TYPE_COLORS[primaryType] ?? "#6E6E8A";
  rack.style.setProperty("--dock-color", color);

  // ── Head block: "when <signal_type>" ──
  const head = document.createElement("div");
  head.className = "rack-head";

  // Colored dot
  const dot = document.createElement("span");
  dot.className = "rack-head-dot";
  head.appendChild(dot);

  // "when" keyword
  const keyword = document.createElement("span");
  keyword.className = "rack-head-keyword";
  keyword.textContent = "when";
  head.appendChild(keyword);

  // Signal type name
  const typeName = document.createElement("span");
  typeName.className = "rack-head-type";
  typeName.textContent = SIGNAL_TYPE_LABELS[primaryType] ?? primaryType;
  head.appendChild(typeName);

  // When filter indicator (if conditions exist)
  if (choreo.when) {
    const filterTag = document.createElement("span");
    filterTag.className = "rack-head-filter";
    filterTag.textContent = "\u2630"; // ☰
    filterTag.title = "Has filter conditions";
    head.appendChild(filterTag);
  }

  // Controls (collapse + delete)
  const controls = document.createElement("span");
  controls.className = "rack-head-controls";

  const collapseBtn = document.createElement("button");
  collapseBtn.className = "rack-head-btn";
  collapseBtn.textContent = choreo.collapsed ? "\u25B6" : "\u25BC"; // ▶ or ▼
  collapseBtn.title = choreo.collapsed ? "Expand" : "Collapse";
  collapseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleNodeCollapsed(choreo.id);
  });
  controls.appendChild(collapseBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "rack-head-btn rack-head-btn--delete";
  deleteBtn.textContent = "\u2716"; // ✖
  deleteBtn.title = "Delete";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeChoreography(choreo.id);
  });
  controls.appendChild(deleteBtn);

  head.appendChild(controls);

  // Click head → select/deselect
  head.addEventListener("click", (e) => {
    e.stopPropagation();
    const { selectedChoreographyId } = getChoreographyState();
    selectChoreography(selectedChoreographyId === choreo.id ? null : choreo.id);
  });

  rack.appendChild(head);

  // ── Dock groove (where action blocks sit) ──
  const dock = document.createElement("div");
  dock.className = "rack-dock";

  if (!choreo.collapsed) {
    // Block chain — click toggles selection, params show inline in detail
    const chain = renderStepChain(choreo, {
      onStepClick: (stepId) => {
        const { selectedStepId } = getChoreographyState();
        selectChoreographyStep(stepId === selectedStepId ? null : stepId);
      },
      onAddClick: () => {
        // No-op — palette replaces the picker
      },
    });
    dock.appendChild(chain);

    // Inline detail (when selected)
    if (isSelected) {
      const detail = document.createElement("div");
      detail.className = "rack-detail";
      detail.appendChild(renderNodeDetail(choreo));
      dock.appendChild(detail);
    }
  } else {
    // Collapsed: just show step count
    const collapsed = document.createElement("div");
    collapsed.className = "rack-collapsed";
    collapsed.textContent = `${choreo.steps.length} step${choreo.steps.length !== 1 ? "s" : ""}`;
    dock.appendChild(collapsed);
  }

  rack.appendChild(dock);

  return rack;
}
