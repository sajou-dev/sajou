/**
 * Rack renderer — renders choreographies as a vertical list of racks.
 *
 * Replaces node-renderer.ts. Each ChoreographyDef becomes a rack:
 *   - Header: signal type dot + label + collapse/expand + delete
 *   - Body: step chain (reuses renderStepChain) + inline detail
 *
 * Racks take the full width of `#zone-choreographer`.
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
import { renderStepChain, openActionPicker } from "./step-chain.js";
import { openStepPopover, closeStepPopover } from "./step-popover.js";
import { SIGNAL_TYPE_COLORS, SIGNAL_TYPE_LABELS } from "./step-commands.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Render all choreographies as racks into the container. */
export function renderAllRacks(container: HTMLElement): void {
  container.innerHTML = "";

  const { choreographies, selectedChoreographyId } = getChoreographyState();

  for (const choreo of choreographies) {
    const isSelected = choreo.id === selectedChoreographyId;
    const rack = renderRack(choreo, isSelected);
    container.appendChild(rack);
  }
}

// ---------------------------------------------------------------------------
// Render single rack
// ---------------------------------------------------------------------------

/** Render a single choreography rack. */
function renderRack(choreo: ChoreographyDef, isSelected: boolean): HTMLElement {
  const rack = document.createElement("div");
  rack.className = "rack" + (isSelected ? " rack--selected" : "");
  rack.dataset.choreoId = choreo.id;

  const primaryType = choreo.on;
  const color = SIGNAL_TYPE_COLORS[primaryType] ?? "#6E6E8A";

  // ── Header ──
  const header = document.createElement("div");
  header.className = "rack-header";
  header.style.borderLeftColor = color;

  // Signal type dot
  const dot = document.createElement("span");
  dot.className = "rack-header-dot";
  dot.style.background = color;
  header.appendChild(dot);

  // Signal type label
  const label = document.createElement("span");
  label.className = "rack-header-label";
  label.textContent = SIGNAL_TYPE_LABELS[primaryType] ?? primaryType;
  header.appendChild(label);

  // Step count
  const count = document.createElement("span");
  count.className = "rack-header-count";
  count.textContent = `${choreo.steps.length} step${choreo.steps.length !== 1 ? "s" : ""}`;
  header.appendChild(count);

  // Spacer
  const spacer = document.createElement("span");
  spacer.style.flex = "1";
  header.appendChild(spacer);

  // Collapse/expand button
  const collapseBtn = document.createElement("button");
  collapseBtn.className = "rack-header-btn";
  collapseBtn.textContent = choreo.collapsed ? "\u25B6" : "\u25BC"; // ▶ or ▼
  collapseBtn.title = choreo.collapsed ? "Expand" : "Collapse";
  collapseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleNodeCollapsed(choreo.id);
  });
  header.appendChild(collapseBtn);

  // Delete button
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "rack-header-btn rack-header-btn--delete";
  deleteBtn.textContent = "\u2716"; // ✖
  deleteBtn.title = "Delete choreography";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeChoreography(choreo.id);
  });
  header.appendChild(deleteBtn);

  // Click header → select rack
  header.addEventListener("click", (e) => {
    e.stopPropagation();
    const { selectedChoreographyId } = getChoreographyState();
    selectChoreography(selectedChoreographyId === choreo.id ? null : choreo.id);
  });

  rack.appendChild(header);

  // ── Body (visible when not collapsed) ──
  if (!choreo.collapsed) {
    const body = document.createElement("div");
    body.className = "rack-body";

    // Step chain
    const chainWrapper = document.createElement("div");
    chainWrapper.className = "rack-chain";

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
              `.rack[data-choreo-id="${choreo.id}"] .nc-chain-pill[data-step-id="${stepId}"]`,
            );
            if (livePill) openStepPopover(stepId, choreo.id, livePill as HTMLElement);
          });
        }
      },
      onAddClick: (anchorEl) => {
        openActionPicker(anchorEl, choreo.id);
      },
    });

    chainWrapper.appendChild(chain);
    body.appendChild(chainWrapper);

    // Inline detail (when selected)
    if (isSelected) {
      const detail = document.createElement("div");
      detail.className = "rack-detail";
      detail.appendChild(renderNodeDetail(choreo));
      body.appendChild(detail);
    }

    rack.appendChild(body);
  }

  return rack;
}
