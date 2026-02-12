/**
 * Node drag — drag-to-create from bar H + node repositioning.
 *
 * Two drag modes:
 *
 * 1. **Drag-to-create**: Drag a signal-type badge from the connector bar H
 *    into the node canvas. Dropping creates a new ChoreographyDef at the
 *    drop position with `on` set to the signal type.
 *
 * 2. **Reposition**: Drag a node header to move the node on the canvas.
 *    Commits position via `moveChoreographyNode()`.
 */

import type { NodeCanvas } from "./node-canvas.js";
import type { ChoreographyDef, UndoableCommand } from "../types.js";
import {
  getChoreographyState,
  moveChoreographyNode,
  selectChoreography,
  updateChoreographyState,
} from "../state/choreography-state.js";
import {
  getWiringState,
  updateWiringState,
  removeWire,
  hasWire,
  type WireConnection,
} from "../state/wiring-state.js";
import { executeCommand } from "../state/undo.js";
import { getActiveBarHSource } from "../workspace/connector-bar-horizontal.js";

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateId(): string {
  return "ch-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize drag interactions for the node canvas. */
export function initNodeDrag(canvas: NodeCanvas): void {
  initNodeReposition(canvas);
  initDragToCreate(canvas);
}

// ---------------------------------------------------------------------------
// Mode 1: Node reposition (drag header)
// ---------------------------------------------------------------------------

function initNodeReposition(canvas: NodeCanvas): void {
  let dragging = false;
  let dragNodeId = "";
  let startMouseX = 0;
  let startMouseY = 0;
  let startNodeX = 0;
  let startNodeY = 0;
  let dragTarget: HTMLElement | null = null;

  canvas.nodesContainer.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 0) return;

    // Find if click is on a node header
    const header = (e.target as HTMLElement).closest<HTMLElement>(".nc-node-header");
    if (!header) return;

    const node = header.closest<HTMLElement>(".nc-node");
    if (!node) return;

    const nodeId = node.dataset.nodeId;
    if (!nodeId) return;

    // Find the choreography to get current position
    const { choreographies } = getChoreographyState();
    const choreo = choreographies.find((c) => c.id === nodeId);
    if (!choreo) return;

    dragging = true;
    dragNodeId = nodeId;
    dragTarget = node;
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    startNodeX = choreo.nodeX;
    startNodeY = choreo.nodeY;

    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    node.classList.add("nc-node--dragging");
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging || !dragTarget) return;

    const zoom = canvas.getViewport().zoom;
    const dx = (e.clientX - startMouseX) / zoom;
    const dy = (e.clientY - startMouseY) / zoom;

    const newX = startNodeX + dx;
    const newY = startNodeY + dy;

    // Update DOM directly for responsiveness
    dragTarget.style.left = `${newX}px`;
    dragTarget.style.top = `${newY}px`;
  });

  const CLICK_THRESHOLD = 3;

  document.addEventListener("mouseup", (e: MouseEvent) => {
    if (!dragging || !dragTarget) return;

    const zoom = canvas.getViewport().zoom;
    const dx = (e.clientX - startMouseX) / zoom;
    const dy = (e.clientY - startMouseY) / zoom;

    const newX = Math.round(startNodeX + dx);
    const newY = Math.round(startNodeY + dy);

    dragTarget.classList.remove("nc-node--dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    dragging = false;
    dragTarget = null;

    // Distinguish click from drag using pixel distance
    const totalDist = Math.hypot(e.clientX - startMouseX, e.clientY - startMouseY);

    if (totalDist < CLICK_THRESHOLD) {
      // Click (not drag) — toggle selection
      const { selectedChoreographyId } = getChoreographyState();
      selectChoreography(selectedChoreographyId === dragNodeId ? null : dragNodeId);
    } else {
      // Drag — commit position change
      moveChoreographyNode(dragNodeId, newX, newY);
    }
  });
}

// ---------------------------------------------------------------------------
// Mode 2: Drag-to-create from bar H signal-type badges
// ---------------------------------------------------------------------------

function initDragToCreate(canvas: NodeCanvas): void {
  let dragging = false;
  let signalType = "";
  let sourceContext: string | null = null;
  let ghost: HTMLElement | null = null;
  let preview: HTMLElement | null = null;
  const DRAG_THRESHOLD = 5;
  let mouseDownX = 0;
  let mouseDownY = 0;
  let thresholdMet = false;

  // Listen on the whole document for mousedown on signal-type badges
  document.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 0) return;

    const badge = (e.target as HTMLElement).closest<HTMLElement>("[data-wire-zone='signal-type']");
    if (!badge) return;

    const type = badge.dataset.wireId;
    if (!type) return;

    // Start tracking for potential drag
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    signalType = type;
    sourceContext = getActiveBarHSource();
    thresholdMet = false;
    dragging = true;

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging) return;

    // Check threshold
    if (!thresholdMet) {
      const dist = Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY);
      if (dist < DRAG_THRESHOLD) return;
      thresholdMet = true;

      // Create ghost
      ghost = document.createElement("div");
      ghost.className = "nc-drag-ghost";
      ghost.textContent = signalType;
      document.body.appendChild(ghost);
    }

    if (ghost) {
      ghost.style.left = `${e.clientX + 12}px`;
      ghost.style.top = `${e.clientY - 12}px`;
    }

    // Check if cursor is over the canvas
    const canvasRect = canvas.el.getBoundingClientRect();
    const isOverCanvas =
      e.clientX >= canvasRect.left && e.clientX <= canvasRect.right &&
      e.clientY >= canvasRect.top && e.clientY <= canvasRect.bottom;

    if (isOverCanvas && !preview) {
      preview = document.createElement("div");
      preview.className = "nc-drop-preview";
      canvas.nodesContainer.appendChild(preview);
    }

    if (preview && isOverCanvas) {
      const pos = canvas.pageToCanvas(e.clientX, e.clientY);
      preview.style.left = `${pos.x - 100}px`;
      preview.style.top = `${pos.y - 20}px`;
    } else if (preview && !isOverCanvas) {
      preview.remove();
      preview = null;
    }
  });

  document.addEventListener("mouseup", (e: MouseEvent) => {
    if (!dragging) return;

    // Cleanup ghost and preview
    ghost?.remove();
    ghost = null;
    preview?.remove();
    preview = null;

    if (!thresholdMet) {
      dragging = false;
      return;
    }

    dragging = false;

    // Check if drop is inside canvas
    const canvasRect = canvas.el.getBoundingClientRect();
    const isOverCanvas =
      e.clientX >= canvasRect.left && e.clientX <= canvasRect.right &&
      e.clientY >= canvasRect.top && e.clientY <= canvasRect.bottom;

    if (!isOverCanvas) return;

    // Create choreography at drop position
    const pos = canvas.pageToCanvas(e.clientX, e.clientY);
    const newChoreo: ChoreographyDef = {
      id: generateId(),
      on: signalType,
      interrupts: false,
      steps: [],
      nodeX: Math.round(pos.x - 100),
      nodeY: Math.round(pos.y - 20),
      collapsed: false,
    };

    // Auto-create wire(s) alongside the choreography
    const typeWireId = crypto.randomUUID();
    const typeWire: WireConnection = {
      id: typeWireId,
      fromZone: "signal-type",
      fromId: signalType,
      toZone: "choreographer",
      toId: newChoreo.id,
    };

    // If a source is active, also create signal→signal-type wire (2-hop)
    const capturedSource = sourceContext;
    const needsSourceWire = capturedSource !== null
      && !hasWire("signal", capturedSource, "signal-type", signalType);
    const sourceWireId = crypto.randomUUID();
    const sourceWire: WireConnection | null = needsSourceWire && capturedSource
      ? {
          id: sourceWireId,
          fromZone: "signal",
          fromId: capturedSource,
          toZone: "signal-type",
          toId: signalType,
        }
      : null;

    // Use undoable command — atomic: creates choreo + type wire + optional source wire
    const cmd: UndoableCommand = {
      execute() {
        const { choreographies } = getChoreographyState();
        updateChoreographyState({
          choreographies: [...choreographies, newChoreo],
          selectedChoreographyId: newChoreo.id,
          selectedStepId: null,
        });
        const { wires } = getWiringState();
        const newWires = [...wires, typeWire];
        if (sourceWire) newWires.push(sourceWire);
        updateWiringState({ wires: newWires });
      },
      undo() {
        const { choreographies } = getChoreographyState();
        updateChoreographyState({
          choreographies: choreographies.filter((c) => c.id !== newChoreo.id),
          selectedChoreographyId: null,
          selectedStepId: null,
        });
        removeWire(typeWireId);
        if (sourceWire) removeWire(sourceWireId);
      },
      description: `Add ${signalType} choreography${capturedSource ? ` (from source)` : ""}`,
    };
    executeCommand(cmd);
  });
}
