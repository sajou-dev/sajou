/**
 * Build mode.
 *
 * Handles asset placement only. Click a palette asset to activate,
 * click empty canvas to place. Delegates selection/drag/delete/copy-paste
 * to select-mode (which is active in both Select and Build modes).
 *
 * Provides: image dimension caching, cursor feedback, grid-snap placement,
 * drag-and-drop from palette, Escape to clear active asset.
 */

import { getState, updateState, subscribe } from "../../app-state.js";
import { getCanvasContainer, canvasCoords, isPanning } from "../scene-canvas.js";
import { executeCommand } from "../undo-manager.js";
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

/** Snap a value to the center of the grid cell it falls in. */
function snapToCell(v: number, gridSize: number): number {
  return Math.floor(v / gridSize) * gridSize + gridSize / 2;
}

// ---------------------------------------------------------------------------
// Image dimension cache
// ---------------------------------------------------------------------------

const dimensionCache = new Map<string, { w: number; h: number }>();

/** Pre-load natural image dimensions for an asset. */
function preloadDimensions(assetPath: string): void {
  if (dimensionCache.has(assetPath)) return;
  const asset = getState().assets.find((a) => a.path === assetPath);
  if (!asset) return;

  const img = new Image();
  img.onload = () => {
    dimensionCache.set(assetPath, { w: img.naturalWidth, h: img.naturalHeight });
  };
  img.src = asset.objectUrl;
}

/** Max placement size (longest side) for free placement. */
const MAX_PLACE_SIZE = 128;

/** Get placement dimensions for an asset. */
function getPlaceDimensions(assetPath: string): { w: number; h: number } {
  const cached = dimensionCache.get(assetPath);
  if (!cached) return { w: 64, h: 64 };

  const maxSide = Math.max(cached.w, cached.h);
  if (maxSide <= MAX_PLACE_SIZE) return cached;

  const scale = MAX_PLACE_SIZE / maxSide;
  return {
    w: Math.round(cached.w * scale),
    h: Math.round(cached.h * scale),
  };
}

// ---------------------------------------------------------------------------
// Hit-testing (lightweight — just check if anything is under cursor)
// ---------------------------------------------------------------------------

/** Check if any scene element exists at (px, py). */
function hasElementAt(px: number, py: number): boolean {
  const { scene } = getState();

  // Check positions
  for (const pos of Object.values(scene.positions)) {
    const dx = px - pos.x;
    const dy = py - pos.y;
    if (dx * dx + dy * dy < 144) return true;
  }

  // Check decorations (reverse for z-order)
  for (let i = scene.decorations.length - 1; i >= 0; i--) {
    const d = scene.decorations[i]!;
    const hw = d.displayWidth / 2;
    const hh = d.displayHeight / 2;
    if (px >= d.x - hw && px <= d.x + hw && py >= d.y - hh && py <= d.y + hh) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/** Place a new decoration on the canvas. */
function placeDecoration(assetPath: string, cx: number, cy: number): void {
  const { sceneEditor } = getState();
  let px = cx;
  let py = cy;
  let pw: number;
  let ph: number;

  if (sceneEditor.showGrid) {
    const gs = sceneEditor.gridSize;
    px = snapToCell(cx, gs);
    py = snapToCell(cy, gs);
    pw = gs;
    ph = gs;
  } else {
    const dims = getPlaceDimensions(assetPath);
    pw = dims.w;
    ph = dims.h;
  }

  const decor: SceneDecoration = {
    id: nextId(),
    asset: assetPath,
    x: px,
    y: py,
    displayWidth: pw,
    displayHeight: ph,
    rotation: 0,
    layer: 0,
  };

  executeCommand({
    description: "Place decoration",
    execute() {
      const s = getState();
      updateState({
        scene: { ...s.scene, decorations: [...s.scene.decorations, decor] },
        sceneEditor: { ...s.sceneEditor, selectedIds: [decor.id], selectedType: "decoration" },
      });
    },
    undo() {
      const s = getState();
      updateState({
        scene: { ...s.scene, decorations: s.scene.decorations.filter((d) => d.id !== decor.id) },
        sceneEditor: { ...s.sceneEditor, selectedIds: [], selectedType: null },
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Handle drop of asset onto canvas. */
function handleDrop(e: DragEvent): void {
  const state = getState();
  if (state.activeTab !== "scene" || state.sceneEditor.mode !== "build") return;

  const assetPath = e.dataTransfer?.getData("application/x-sajou-asset");
  if (!assetPath) return;

  e.preventDefault();
  const { x, y } = canvasCoords(e);
  placeDecoration(assetPath, x, y);
}

/** Handle mousedown — only for placement on empty canvas. */
function handleMouseDown(e: MouseEvent): void {
  const state = getState();
  if (state.activeTab !== "scene" || state.sceneEditor.mode !== "build") return;
  if (isPanning()) return;
  if (e.button !== 0) return;

  const se = state.sceneEditor;
  if (!se.activeAssetPath) return; // No active asset → let select-mode handle

  const { x, y } = canvasCoords(e);

  // If clicking on an existing element, let select-mode handle it
  if (hasElementAt(x, y)) return;

  // Place new decoration and prevent select-mode from firing
  e.stopImmediatePropagation();
  placeDecoration(se.activeAssetPath, x, y);
}

/** Handle Escape to clear active asset. */
function handleKeyDown(e: KeyboardEvent): void {
  const state = getState();
  if (state.activeTab !== "scene" || state.sceneEditor.mode !== "build") return;
  if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;

  if (e.key === "Escape" && state.sceneEditor.activeAssetPath) {
    e.preventDefault();
    e.stopImmediatePropagation(); // Don't also deselect in select-mode
    updateState({
      sceneEditor: { ...state.sceneEditor, activeAssetPath: null },
    });
  }
}

// ---------------------------------------------------------------------------
// Cursor management
// ---------------------------------------------------------------------------

/** Update canvas cursor based on build mode state. */
function updateCursor(): void {
  if (isPanning()) return;
  const { sceneEditor, activeTab } = getState();
  const container = getCanvasContainer();
  const isBuilding = activeTab === "scene" && sceneEditor.mode === "build" && !!sceneEditor.activeAssetPath;
  container.style.cursor = isBuilding ? "crosshair" : "";
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize build mode. */
export function initBuildMode(): void {
  const container = getCanvasContainer();

  container.addEventListener("dragover", (e) => {
    const state = getState();
    if (state.activeTab === "scene" && state.sceneEditor.mode === "build") {
      e.preventDefault();
    }
  });

  container.addEventListener("drop", handleDrop);
  container.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("keydown", handleKeyDown);

  // Re-apply cursor after pan ends
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      requestAnimationFrame(updateCursor);
    }
  });

  // Pre-load dimensions when active asset changes, update cursor
  subscribe(() => {
    const { sceneEditor } = getState();
    if (sceneEditor.activeAssetPath) {
      preloadDimensions(sceneEditor.activeAssetPath);
    }
    updateCursor();
  });
}
