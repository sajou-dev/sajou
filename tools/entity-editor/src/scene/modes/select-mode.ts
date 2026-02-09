/**
 * Select mode.
 *
 * Universal selection active in both Select and Build modes.
 * Click to select any element (decoration, position, wall, route).
 * Shift+click for multi-select.
 * Drag to move selected elements (with grid snap when grid is on).
 * Delete to remove. Rectangle drag for rubber-band multi-select.
 * Ctrl+C / Ctrl+V for copy/paste. Escape to deselect.
 */

import { getState, updateState } from "../../app-state.js";
import { getCanvasContainer, canvasCoords, isPanning, getLayers } from "../scene-canvas.js";
import { executeCommand } from "../undo-manager.js";
import { Graphics } from "pixi.js";
import type { SceneDecoration } from "../../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

/** Generate a unique decoration ID. */
function nextId(): string {
  idCounter++;
  return `d${Date.now()}-${idCounter}`;
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
// Rubber-band selection state
// ---------------------------------------------------------------------------

let rubberBand: { startX: number; startY: number } | null = null;
let rubberBandGraphics: Graphics | null = null;

/** Ensure rubber-band graphics exist. */
function getRubberBandGraphics(): Graphics {
  if (!rubberBandGraphics) {
    rubberBandGraphics = new Graphics();
    const layers = getLayers();
    if (layers) {
      layers.selection.addChild(rubberBandGraphics);
    }
  }
  return rubberBandGraphics;
}

/** Find all decorations inside a rectangle. */
function findDecorationsInRect(x1: number, y1: number, x2: number, y2: number): string[] {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  const { scene } = getState();
  const ids: string[] = [];

  for (const d of scene.decorations) {
    if (d.x >= minX && d.x <= maxX && d.y >= minY && d.y <= maxY) {
      ids.push(d.id);
    }
  }

  return ids;
}

/** Find all positions inside a rectangle. */
function findPositionsInRect(x1: number, y1: number, x2: number, y2: number): string[] {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  const { scene } = getState();
  const names: string[] = [];

  for (const [name, pos] of Object.entries(scene.positions)) {
    if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
      names.push(name);
    }
  }

  return names;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Handle mousedown for selection. */
function handleMouseDown(e: MouseEvent): void {
  const state = getState();
  if (state.activeTab !== "scene") return;
  if (state.sceneEditor.mode === "positions" || state.sceneEditor.mode === "routes") return;
  if (isPanning()) return;
  if (e.button !== 0) return;

  const { x, y } = canvasCoords(e);
  const hit = hitTest(x, y);

  if (!hit) {
    // Start rubber-band selection (only if no build placement happened)
    rubberBand = { startX: x, startY: y };
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

/** Handle mousemove for dragging or rubber-band. */
function handleMouseMove(e: MouseEvent): void {
  const state = getState();
  if (state.sceneEditor.mode === "positions" || state.sceneEditor.mode === "routes") return;

  // Rubber-band
  if (rubberBand) {
    const { x, y } = canvasCoords(e);
    const g = getRubberBandGraphics();
    g.clear();
    const rx = Math.min(rubberBand.startX, x);
    const ry = Math.min(rubberBand.startY, y);
    const rw = Math.abs(x - rubberBand.startX);
    const rh = Math.abs(y - rubberBand.startY);
    g.rect(rx, ry, rw, rh);
    g.fill({ color: "#58a6ff", alpha: 0.1 });
    g.stroke({ width: 1, color: "#58a6ff", alpha: 0.5 });
    return;
  }

  // Dragging
  if (!dragging) return;

  const { x, y } = canvasCoords(e);
  const dx = x - dragging.startX;
  const dy = y - dragging.startY;
  const snap = state.sceneEditor.showGrid;
  const gs = state.sceneEditor.gridSize;

  for (const [id, orig] of dragging.originals) {
    let newX = orig.x + dx;
    let newY = orig.y + dy;

    if (snap) {
      if (dragging.hit.type === "decoration") {
        // Snap decoration center to cell center
        newX = Math.floor(newX / gs) * gs + gs / 2;
        newY = Math.floor(newY / gs) * gs + gs / 2;
      } else {
        // Snap positions to grid intersections
        newX = Math.round(newX / gs) * gs;
        newY = Math.round(newY / gs) * gs;
      }
    }

    if (dragging.hit.type === "decoration") {
      const d = state.scene.decorations.find((dec) => dec.id === id);
      if (d) { d.x = newX; d.y = newY; }
    } else if (dragging.hit.type === "position") {
      const p = state.scene.positions[id];
      if (p) { p.x = Math.round(newX); p.y = Math.round(newY); }
    }
  }
  updateState({});
}

/** Handle mouseup to finish drag or rubber-band. */
function handleMouseUp(e: MouseEvent): void {
  // Finish rubber-band
  if (rubberBand) {
    const { x, y } = canvasCoords(e);
    const g = getRubberBandGraphics();
    g.clear();

    const rw = Math.abs(x - rubberBand.startX);
    const rh = Math.abs(y - rubberBand.startY);

    // Only select if drag was meaningful (> 5px)
    if (rw > 5 || rh > 5) {
      const decorIds = findDecorationsInRect(rubberBand.startX, rubberBand.startY, x, y);
      const posNames = findPositionsInRect(rubberBand.startX, rubberBand.startY, x, y);

      const state = getState();
      // Prefer decorations if any found, otherwise positions
      if (decorIds.length > 0) {
        updateState({
          sceneEditor: { ...state.sceneEditor, selectedIds: decorIds, selectedType: "decoration" },
        });
      } else if (posNames.length > 0) {
        updateState({
          sceneEditor: { ...state.sceneEditor, selectedIds: posNames, selectedType: "position" },
        });
      }
    }

    rubberBand = null;
    return;
  }

  // Finish dragging
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

/** Handle Delete key and copy/paste. */
function handleKeyDown(e: KeyboardEvent): void {
  const state = getState();
  if (state.activeTab !== "scene") return;
  if (state.sceneEditor.mode === "positions" || state.sceneEditor.mode === "routes") return;
  if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;

  // Escape: deselect
  if (e.key === "Escape") {
    if (state.sceneEditor.selectedIds.length > 0) {
      e.preventDefault();
      updateState({
        sceneEditor: { ...state.sceneEditor, selectedIds: [], selectedType: null },
      });
    }
    return;
  }

  // Copy (Ctrl+C)
  if ((e.ctrlKey || e.metaKey) && e.key === "c" && state.sceneEditor.selectedType === "decoration") {
    e.preventDefault();
    const clipboard = state.scene.decorations
      .filter((d) => state.sceneEditor.selectedIds.includes(d.id))
      .map((d) => ({ ...d }));
    updateState({
      sceneEditor: { ...state.sceneEditor, clipboard },
    });
    return;
  }

  // Paste (Ctrl+V)
  if ((e.ctrlKey || e.metaKey) && e.key === "v" && state.sceneEditor.clipboard.length > 0) {
    e.preventDefault();
    const newDecors: SceneDecoration[] = state.sceneEditor.clipboard.map((d) => ({
      ...d,
      id: nextId(),
      x: d.x + 20,
      y: d.y + 20,
    }));
    const newIds = newDecors.map((d) => d.id);

    executeCommand({
      description: `Paste decoration(s)`,
      execute() {
        const s = getState();
        updateState({
          scene: { ...s.scene, decorations: [...s.scene.decorations, ...newDecors] },
          sceneEditor: { ...s.sceneEditor, selectedIds: newIds, selectedType: "decoration" },
        });
      },
      undo() {
        const s = getState();
        updateState({
          scene: { ...s.scene, decorations: s.scene.decorations.filter((d) => !newIds.includes(d.id)) },
          sceneEditor: { ...s.sceneEditor, selectedIds: [], selectedType: null },
        });
      },
    });

    updateState({
      sceneEditor: {
        ...getState().sceneEditor,
        clipboard: newDecors.map((d) => ({ ...d })),
      },
    });
    return;
  }

  // Delete
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
    const removed: Record<string, { x: number; y: number; color?: string }> = {};
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
