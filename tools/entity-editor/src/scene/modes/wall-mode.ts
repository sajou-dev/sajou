/**
 * Wall mode.
 *
 * Click to start, click to add points, Escape or double-click
 * to finish the wall segment.
 */

import { getState, updateState } from "../../app-state.js";
import { getCanvasContainer } from "../scene-canvas.js";
import { executeCommand } from "../undo-manager.js";
import type { SceneWall } from "../../types.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let wallCounter = 0;
let currentPoints: Array<{ x: number; y: number }> = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get canvas-relative coords from a mouse event. */
function canvasCoords(e: MouseEvent): { x: number; y: number } {
  const container = getCanvasContainer();
  const canvas = container.querySelector("canvas");
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) };
}

/** Finish the current wall being drawn. */
function finishWall(): void {
  if (currentPoints.length < 2) {
    currentPoints = [];
    return;
  }

  wallCounter++;
  const wallId = `w${Date.now()}-${wallCounter}`;
  const points = [...currentPoints];
  const wall: SceneWall = {
    id: wallId,
    points,
    thickness: 4,
    color: "#333333",
  };

  executeCommand({
    description: `Add wall ${wallId}`,
    execute() {
      const s = getState();
      updateState({
        scene: { ...s.scene, walls: [...s.scene.walls, wall] },
        sceneEditor: { ...s.sceneEditor, selectedIds: [wallId], selectedType: "wall" },
      });
    },
    undo() {
      const s = getState();
      updateState({
        scene: { ...s.scene, walls: s.scene.walls.filter((w) => w.id !== wallId) },
        sceneEditor: { ...s.sceneEditor, selectedIds: [], selectedType: null },
      });
    },
  });

  currentPoints = [];
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Handle click to add wall point. */
function handleMouseDown(e: MouseEvent): void {
  const state = getState();
  if (state.activeTab !== "scene" || state.sceneEditor.mode !== "walls") return;

  const { x, y } = canvasCoords(e);
  currentPoints.push({ x, y });
}

/** Handle double-click to finish wall. */
function handleDblClick(e: MouseEvent): void {
  const state = getState();
  if (state.activeTab !== "scene" || state.sceneEditor.mode !== "walls") return;

  e.preventDefault();
  finishWall();
}

/** Handle Escape to finish wall, Delete to remove selected. */
function handleKeyDown(e: KeyboardEvent): void {
  const state = getState();
  if (state.activeTab !== "scene" || state.sceneEditor.mode !== "walls") return;
  if ((e.target as HTMLElement).tagName === "INPUT") return;

  if (e.key === "Escape") {
    e.preventDefault();
    finishWall();
  }

  if ((e.key === "Delete" || e.key === "Backspace") && state.sceneEditor.selectedType === "wall") {
    e.preventDefault();
    const ids = [...state.sceneEditor.selectedIds];
    const removed = state.scene.walls.filter((w) => ids.includes(w.id));

    executeCommand({
      description: `Delete wall(s)`,
      execute() {
        const s = getState();
        updateState({
          scene: { ...s.scene, walls: s.scene.walls.filter((w) => !ids.includes(w.id)) },
          sceneEditor: { ...s.sceneEditor, selectedIds: [], selectedType: null },
        });
      },
      undo() {
        const s = getState();
        updateState({
          scene: { ...s.scene, walls: [...s.scene.walls, ...removed] },
        });
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize wall mode. */
export function initWallMode(): void {
  const container = getCanvasContainer();
  container.addEventListener("mousedown", handleMouseDown);
  container.addEventListener("dblclick", handleDblClick);
  document.addEventListener("keydown", handleKeyDown);
}
