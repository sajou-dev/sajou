/**
 * Select mode.
 *
 * Universal selection: click to select any element (decoration,
 * position, wall, route). Shift+click for multi-select.
 * Drag to move selected elements. Delete to remove.
 */

import { getState, updateState } from "../../app-state.js";
import { getCanvasContainer } from "../scene-canvas.js";
import { executeCommand } from "../undo-manager.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get canvas-relative coords from a mouse event. */
function canvasCoords(e: MouseEvent): { x: number; y: number } {
  const container = getCanvasContainer();
  const canvas = container.querySelector("canvas");
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

interface HitResult {
  type: "decoration" | "position" | "wall" | "route";
  id: string;
}

/** Hit-test all scene elements. */
function hitTest(px: number, py: number): HitResult | null {
  const { scene } = getState();

  // Test positions first (small targets)
  for (const [name, pos] of Object.entries(scene.positions)) {
    const dx = px - pos.x;
    const dy = py - pos.y;
    if (dx * dx + dy * dy < 144) return { type: "position", id: name };
  }

  // Test decorations (reverse for z-order)
  const decors = [...scene.decorations].reverse();
  for (const d of decors) {
    const hw = d.displayWidth / 2;
    const hh = d.displayHeight / 2;
    if (px >= d.x - hw && px <= d.x + hw && py >= d.y - hh && py <= d.y + hh) {
      return { type: "decoration", id: d.id };
    }
  }

  // Test walls (point-to-segment distance < threshold)
  for (const wall of scene.walls) {
    for (let i = 0; i < wall.points.length - 1; i++) {
      const a = wall.points[i]!;
      const b = wall.points[i + 1]!;
      const dist = pointToSegmentDist(px, py, a.x, a.y, b.x, b.y);
      if (dist < wall.thickness + 4) return { type: "wall", id: wall.id };
    }
  }

  // Test routes (point-to-segment distance)
  for (const route of scene.routes) {
    const from = scene.positions[route.from];
    const to = scene.positions[route.to];
    if (!from || !to) continue;
    const dist = pointToSegmentDist(px, py, from.x, from.y, to.x, to.y);
    if (dist < 6) return { type: "route", id: route.id };
  }

  return null;
}

/** Point-to-line-segment distance. */
function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
}

// ---------------------------------------------------------------------------
// Drag state
// ---------------------------------------------------------------------------

let dragging: { hit: HitResult; startX: number; startY: number; originals: Map<string, { x: number; y: number }> } | null = null;

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Handle mousedown for selection. */
function handleMouseDown(e: MouseEvent): void {
  const state = getState();
  if (state.activeTab !== "scene" || state.sceneEditor.mode !== "select") return;

  const { x, y } = canvasCoords(e);
  const hit = hitTest(x, y);

  if (!hit) {
    updateState({
      sceneEditor: { ...state.sceneEditor, selectedIds: [], selectedType: null },
    });
    return;
  }

  const isShift = e.shiftKey;
  const currentIds = state.sceneEditor.selectedIds;
  const currentType = state.sceneEditor.selectedType;

  let selectedIds: string[];
  if (isShift && currentType === hit.type) {
    // Multi-select: toggle
    if (currentIds.includes(hit.id)) {
      selectedIds = currentIds.filter((id) => id !== hit.id);
    } else {
      selectedIds = [...currentIds, hit.id];
    }
  } else {
    selectedIds = [hit.id];
  }

  updateState({
    sceneEditor: { ...state.sceneEditor, selectedIds, selectedType: hit.type },
  });

  // Start drag for decorations and positions
  if (hit.type === "decoration" || hit.type === "position") {
    const originals = new Map<string, { x: number; y: number }>();
    for (const id of selectedIds) {
      if (hit.type === "decoration") {
        const d = state.scene.decorations.find((dec) => dec.id === id);
        if (d) originals.set(id, { x: d.x, y: d.y });
      } else {
        const p = state.scene.positions[id];
        if (p) originals.set(id, { x: p.x, y: p.y });
      }
    }
    dragging = { hit, startX: x, startY: y, originals };
  }
}

/** Handle mousemove for dragging. */
function handleMouseMove(e: MouseEvent): void {
  if (!dragging) return;
  const state = getState();
  if (state.sceneEditor.mode !== "select") return;

  const { x, y } = canvasCoords(e);
  const dx = x - dragging.startX;
  const dy = y - dragging.startY;

  for (const [id, orig] of dragging.originals) {
    if (dragging.hit.type === "decoration") {
      const d = state.scene.decorations.find((dec) => dec.id === id);
      if (d) { d.x = orig.x + dx; d.y = orig.y + dy; }
    } else if (dragging.hit.type === "position") {
      const p = state.scene.positions[id];
      if (p) { p.x = Math.round(orig.x + dx); p.y = Math.round(orig.y + dy); }
    }
  }
  updateState({});
}

/** Handle mouseup to finish drag. */
function handleMouseUp(): void {
  if (!dragging) return;
  const state = getState();

  // Check if anything moved
  let moved = false;
  for (const [id, orig] of dragging.originals) {
    if (dragging.hit.type === "decoration") {
      const d = state.scene.decorations.find((dec) => dec.id === id);
      if (d && (Math.abs(d.x - orig.x) > 1 || Math.abs(d.y - orig.y) > 1)) moved = true;
    } else if (dragging.hit.type === "position") {
      const p = state.scene.positions[id];
      if (p && (Math.abs(p.x - orig.x) > 1 || Math.abs(p.y - orig.y) > 1)) moved = true;
    }
  }

  if (moved) {
    const finals = new Map<string, { x: number; y: number }>();
    const originals = new Map(dragging.originals);
    const type = dragging.hit.type;

    for (const [id] of originals) {
      if (type === "decoration") {
        const d = state.scene.decorations.find((dec) => dec.id === id);
        if (d) finals.set(id, { x: d.x, y: d.y });
      } else {
        const p = state.scene.positions[id];
        if (p) finals.set(id, { x: p.x, y: p.y });
      }
    }

    executeCommand({
      description: `Move ${type}(s)`,
      execute() {
        const s = getState();
        for (const [id, pos] of finals) {
          if (type === "decoration") {
            const d = s.scene.decorations.find((dec) => dec.id === id);
            if (d) { d.x = pos.x; d.y = pos.y; }
          } else {
            const p = s.scene.positions[id];
            if (p) { p.x = pos.x; p.y = pos.y; }
          }
        }
        updateState({});
      },
      undo() {
        const s = getState();
        for (const [id, pos] of originals) {
          if (type === "decoration") {
            const d = s.scene.decorations.find((dec) => dec.id === id);
            if (d) { d.x = pos.x; d.y = pos.y; }
          } else {
            const p = s.scene.positions[id];
            if (p) { p.x = pos.x; p.y = pos.y; }
          }
        }
        updateState({});
      },
    });
  }

  dragging = null;
}

/** Handle Delete key. */
function handleKeyDown(e: KeyboardEvent): void {
  const state = getState();
  if (state.activeTab !== "scene" || state.sceneEditor.mode !== "select") return;
  if ((e.target as HTMLElement).tagName === "INPUT") return;

  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (state.sceneEditor.selectedIds.length === 0) return;

  e.preventDefault();
  const ids = [...state.sceneEditor.selectedIds];
  const type = state.sceneEditor.selectedType;

  if (type === "decoration") {
    const removed = state.scene.decorations.filter((d) => ids.includes(d.id));
    executeCommand({
      description: "Delete decoration(s)",
      execute() {
        const s = getState();
        updateState({
          scene: { ...s.scene, decorations: s.scene.decorations.filter((d) => !ids.includes(d.id)) },
          sceneEditor: { ...s.sceneEditor, selectedIds: [], selectedType: null },
        });
      },
      undo() {
        const s = getState();
        updateState({ scene: { ...s.scene, decorations: [...s.scene.decorations, ...removed] } });
      },
    });
  }

  if (type === "position") {
    const removed: Record<string, { x: number; y: number }> = {};
    for (const name of ids) {
      const pos = state.scene.positions[name];
      if (pos) removed[name] = { ...pos };
    }
    const removedRoutes = state.scene.routes.filter((r) => ids.includes(r.from) || ids.includes(r.to));

    executeCommand({
      description: "Delete position(s)",
      execute() {
        const s = getState();
        const positions = { ...s.scene.positions };
        for (const name of ids) delete positions[name];
        const routes = s.scene.routes.filter((r) => !ids.includes(r.from) && !ids.includes(r.to));
        updateState({
          scene: { ...s.scene, positions, routes },
          sceneEditor: { ...s.sceneEditor, selectedIds: [], selectedType: null },
        });
      },
      undo() {
        const s = getState();
        updateState({
          scene: { ...s.scene, positions: { ...s.scene.positions, ...removed }, routes: [...s.scene.routes, ...removedRoutes] },
        });
      },
    });
  }

  if (type === "wall") {
    const removed = state.scene.walls.filter((w) => ids.includes(w.id));
    executeCommand({
      description: "Delete wall(s)",
      execute() {
        const s = getState();
        updateState({
          scene: { ...s.scene, walls: s.scene.walls.filter((w) => !ids.includes(w.id)) },
          sceneEditor: { ...s.sceneEditor, selectedIds: [], selectedType: null },
        });
      },
      undo() {
        const s = getState();
        updateState({ scene: { ...s.scene, walls: [...s.scene.walls, ...removed] } });
      },
    });
  }

  if (type === "route") {
    const removed = state.scene.routes.filter((r) => ids.includes(r.id));
    executeCommand({
      description: "Delete route(s)",
      execute() {
        const s = getState();
        updateState({
          scene: { ...s.scene, routes: s.scene.routes.filter((r) => !ids.includes(r.id)) },
          sceneEditor: { ...s.sceneEditor, selectedIds: [], selectedType: null },
        });
      },
      undo() {
        const s = getState();
        updateState({ scene: { ...s.scene, routes: [...s.scene.routes, ...removed] } });
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize select mode. */
export function initSelectMode(): void {
  const container = getCanvasContainer();
  container.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("keydown", handleKeyDown);
}
