/**
 * Position mode.
 *
 * Click canvas to place named markers (pos-1, pos-2...).
 * Drag to reposition, rename in property panel.
 */

import { getState, updateState } from "../../app-state.js";
import { getCanvasContainer, canvasCoords, isPanning } from "../scene-canvas.js";
import { executeCommand } from "../undo-manager.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let posCounter = 0;

/** Generate a unique position name. */
function nextName(): string {
  const positions = getState().scene.positions;
  posCounter++;
  let name = `pos-${posCounter}`;
  while (positions[name]) {
    posCounter++;
    name = `pos-${posCounter}`;
  }
  return name;
}

/** Hit-test for positions (12px radius). */
function hitTestPosition(px: number, py: number): string | null {
  const positions = getState().scene.positions;
  for (const [name, pos] of Object.entries(positions)) {
    const dx = px - pos.x;
    const dy = py - pos.y;
    if (dx * dx + dy * dy < 144) return name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Drag state
// ---------------------------------------------------------------------------

let dragging: { name: string; startX: number; startY: number; origX: number; origY: number } | null = null;

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Handle click to place or select a position. */
function handleMouseDown(e: MouseEvent): void {
  const state = getState();
  if (state.activeTab !== "scene" || state.sceneEditor.mode !== "positions") return;
  if (isPanning()) return;

  const { x, y } = canvasCoords(e);
  const hitName = hitTestPosition(x, y);

  if (hitName) {
    // Select and start drag
    updateState({
      sceneEditor: { ...state.sceneEditor, selectedIds: [hitName], selectedType: "position" },
    });
    const pos = state.scene.positions[hitName]!;
    dragging = { name: hitName, startX: x, startY: y, origX: pos.x, origY: pos.y };
    return;
  }

  // Place new position
  const name = nextName();
  const pos = { x: Math.round(x), y: Math.round(y) };

  executeCommand({
    description: `Add position ${name}`,
    execute() {
      const s = getState();
      const positions = { ...s.scene.positions, [name]: pos };
      updateState({
        scene: { ...s.scene, positions },
        sceneEditor: { ...s.sceneEditor, selectedIds: [name], selectedType: "position" },
      });
    },
    undo() {
      const s = getState();
      const positions = { ...s.scene.positions };
      delete positions[name];
      updateState({
        scene: { ...s.scene, positions },
        sceneEditor: { ...s.sceneEditor, selectedIds: [], selectedType: null },
      });
    },
  });
}

/** Handle mousemove for dragging positions. */
function handleMouseMove(e: MouseEvent): void {
  if (!dragging) return;
  const state = getState();
  if (state.sceneEditor.mode !== "positions") return;

  const { x, y } = canvasCoords(e);
  const dx = x - dragging.startX;
  const dy = y - dragging.startY;

  const pos = state.scene.positions[dragging.name];
  if (pos) {
    pos.x = Math.round(dragging.origX + dx);
    pos.y = Math.round(dragging.origY + dy);
    updateState({});
  }
}

/** Handle mouseup to finish dragging. */
function handleMouseUp(): void {
  if (!dragging) return;
  const state = getState();
  const pos = state.scene.positions[dragging.name];

  if (pos) {
    const finalX = pos.x;
    const finalY = pos.y;
    const origX = dragging.origX;
    const origY = dragging.origY;
    const name = dragging.name;

    if (Math.abs(finalX - origX) > 1 || Math.abs(finalY - origY) > 1) {
      executeCommand({
        description: `Move position ${name}`,
        execute() {
          const p = getState().scene.positions[name];
          if (p) { p.x = finalX; p.y = finalY; updateState({}); }
        },
        undo() {
          const p = getState().scene.positions[name];
          if (p) { p.x = origX; p.y = origY; updateState({}); }
        },
      });
    }
  }

  dragging = null;
}

/** Handle Delete to remove selected position. */
function handleKeyDown(e: KeyboardEvent): void {
  const state = getState();
  if (state.activeTab !== "scene" || state.sceneEditor.mode !== "positions") return;
  if ((e.target as HTMLElement).tagName === "INPUT") return;

  if ((e.key === "Delete" || e.key === "Backspace") && state.sceneEditor.selectedType === "position") {
    e.preventDefault();
    const names = [...state.sceneEditor.selectedIds];
    const removed: Record<string, { x: number; y: number; color?: string }> = {};
    for (const name of names) {
      const pos = state.scene.positions[name];
      if (pos) removed[name] = { ...pos };
    }

    executeCommand({
      description: `Delete position(s)`,
      execute() {
        const s = getState();
        const positions = { ...s.scene.positions };
        for (const name of names) delete positions[name];
        const routes = s.scene.routes.filter((r) => !names.includes(r.from) && !names.includes(r.to));
        updateState({
          scene: { ...s.scene, positions, routes },
          sceneEditor: { ...s.sceneEditor, selectedIds: [], selectedType: null },
        });
      },
      undo() {
        const s = getState();
        const positions = { ...s.scene.positions, ...removed };
        updateState({ scene: { ...s.scene, positions } });
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize position mode. */
export function initPositionMode(): void {
  const container = getCanvasContainer();
  container.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("keydown", handleKeyDown);
}
