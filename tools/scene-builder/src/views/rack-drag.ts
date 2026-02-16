/**
 * Rack drag — drag-from-rail to create + rack reorder.
 *
 * Replaces node-drag.ts. Two interactions:
 *
 * 1. **Drag-from-rail**: drag a signal-type badge from the horizontal connector
 *    bar into #zone-choreographer → creates a new rack (ChoreographyDef with on = signalType).
 *    No wires are created — the binding is implicit via `choreo.on`.
 *
 * 2. **Rack reorder**: drag a rack header vertically to change its order
 *    within the rack list.
 */

import type { ChoreographyDef, UndoableCommand } from "../types.js";
import {
  getChoreographyState,
  updateChoreographyState,
} from "../state/choreography-state.js";
import { executeCommand } from "../state/undo.js";

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateId(): string {
  return "ch-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize rack drag interactions. Call once after DOM is ready. */
export function initRackDrag(): void {
  initDragFromRail();
  initRackReorder();
}

// ---------------------------------------------------------------------------
// Mode 1: Drag signal-type badge from rail → create rack
// ---------------------------------------------------------------------------

function initDragFromRail(): void {
  let dragging = false;
  let signalType = "";
  let ghost: HTMLElement | null = null;
  const DRAG_THRESHOLD = 5;
  let mouseDownX = 0;
  let mouseDownY = 0;
  let thresholdMet = false;

  document.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 0) return;

    const badge = (e.target as HTMLElement).closest<HTMLElement>("[data-wire-zone='signal-type']");
    if (!badge) return;

    const type = badge.dataset.wireId;
    if (!type) return;

    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    signalType = type;
    thresholdMet = false;
    dragging = true;

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging) return;

    if (!thresholdMet) {
      const dist = Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY);
      if (dist < DRAG_THRESHOLD) return;
      thresholdMet = true;

      ghost = document.createElement("div");
      ghost.className = "nc-drag-ghost";
      ghost.textContent = signalType;
      document.body.appendChild(ghost);
    }

    if (ghost) {
      ghost.style.left = `${e.clientX + 12}px`;
      ghost.style.top = `${e.clientY - 12}px`;
    }
  });

  document.addEventListener("mouseup", (e: MouseEvent) => {
    if (!dragging) return;

    ghost?.remove();
    ghost = null;

    if (!thresholdMet) {
      dragging = false;
      return;
    }

    dragging = false;

    // Check if drop is inside the choreographer zone
    const zoneEl = document.getElementById("zone-choreographer");
    if (!zoneEl) return;

    const rect = zoneEl.getBoundingClientRect();
    const isOverZone =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;

    if (!isOverZone) return;

    // Create a new rack (choreography) — no wires, implicit via on
    const newChoreo: ChoreographyDef = {
      id: generateId(),
      on: signalType,
      interrupts: false,
      steps: [],
      nodeX: 0,
      nodeY: 0,
      collapsed: false,
    };

    const cmd: UndoableCommand = {
      execute() {
        const { choreographies } = getChoreographyState();
        updateChoreographyState({
          choreographies: [...choreographies, newChoreo],
          selectedChoreographyId: newChoreo.id,
          selectedStepId: null,
        });
      },
      undo() {
        const { choreographies } = getChoreographyState();
        updateChoreographyState({
          choreographies: choreographies.filter((c) => c.id !== newChoreo.id),
          selectedChoreographyId: null,
          selectedStepId: null,
        });
      },
      description: `Add ${signalType} choreography`,
    };
    executeCommand(cmd);
  });
}

// ---------------------------------------------------------------------------
// Mode 2: Rack reorder (drag header vertically)
// ---------------------------------------------------------------------------

function initRackReorder(): void {
  let dragging = false;
  let dragChoreoId = "";
  let dragEl: HTMLElement | null = null;
  let placeholder: HTMLElement | null = null;
  let startY = 0;

  document.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 0) return;

    const header = (e.target as HTMLElement).closest<HTMLElement>(".rack-header");
    if (!header) return;

    // Don't capture if click is on a button inside the header
    if ((e.target as HTMLElement).closest("button")) return;

    const rack = header.closest<HTMLElement>(".rack");
    if (!rack) return;

    const choreoId = rack.dataset.choreoId;
    if (!choreoId) return;

    dragging = true;
    dragChoreoId = choreoId;
    dragEl = rack;
    startY = e.clientY;

    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging || !dragEl) return;

    const dy = Math.abs(e.clientY - startY);
    if (dy < 8) return; // Small threshold before reorder activates

    if (!placeholder) {
      placeholder = document.createElement("div");
      placeholder.className = "rack-reorder-placeholder";
      placeholder.style.height = `${dragEl.offsetHeight}px`;
      dragEl.parentElement?.insertBefore(placeholder, dragEl);
      dragEl.classList.add("rack--reordering");
      dragEl.style.transform = `translateY(${e.clientY - startY}px)`;
    } else {
      dragEl.style.transform = `translateY(${e.clientY - startY}px)`;
    }

    // Determine insertion point based on cursor position
    const container = dragEl.parentElement;
    if (!container) return;

    const racks = [...container.querySelectorAll<HTMLElement>(".rack:not(.rack--reordering)")];
    for (const otherRack of racks) {
      const rect = otherRack.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        container.insertBefore(placeholder, otherRack);
        return;
      }
    }
    // Past all racks → put at end
    container.appendChild(placeholder);
  });

  document.addEventListener("mouseup", () => {
    if (!dragging || !dragEl) return;

    if (placeholder) {
      // Determine new order from DOM
      const container = dragEl.parentElement;
      dragEl.classList.remove("rack--reordering");
      dragEl.style.transform = "";

      if (container) {
        // Insert the rack at the placeholder's position
        container.insertBefore(dragEl, placeholder);
        placeholder.remove();

        // Read new order from DOM
        const orderedIds = [...container.querySelectorAll<HTMLElement>(".rack")]
          .map((el) => el.dataset.choreoId)
          .filter((id): id is string => !!id);

        // Commit reorder to state
        const { choreographies } = getChoreographyState();
        const byId = new Map(choreographies.map((c) => [c.id, c]));
        const reordered = orderedIds
          .map((id) => byId.get(id))
          .filter((c): c is ChoreographyDef => !!c);

        // Only commit if the order actually changed
        if (reordered.length === choreographies.length) {
          const snapshot = [...choreographies];
          const cmd: UndoableCommand = {
            execute() { updateChoreographyState({ choreographies: reordered }); },
            undo() { updateChoreographyState({ choreographies: snapshot }); },
            description: "Reorder choreographies",
          };
          executeCommand(cmd);
        }
      }

      placeholder = null;
    }

    dragging = false;
    dragEl = null;
  });
}
