/**
 * Background tool.
 *
 * Quick-access popover for scene settings (dimensions, color) plus
 * semantic zone painting. Zone types are chips in the popover palette;
 * clicking a chip selects the brush, then click-drag on the canvas
 * paints cells. Right-click or Alt+click erases.
 *
 * Popover auto-shows when the tool is selected.
 * All changes go through the undo system.
 */

import type { CanvasToolHandler } from "../canvas/canvas.js";
import { screenToScene, getCanvasContainer } from "../canvas/canvas.js";
import {
  getEditorState,
  setActiveZoneType,
  subscribeEditor,
} from "../state/editor-state.js";
import {
  getSceneState,
  subscribeScene,
  updateSceneState,
  addZoneType,
  removeZoneType,
  resizeZoneGrid,
} from "../state/scene-state.js";
import { executeCommand } from "../state/undo.js";
import type { UndoableCommand, ZoneGrid } from "../types.js";

// ---------------------------------------------------------------------------
// Popover state
// ---------------------------------------------------------------------------

let popover: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Popover lifecycle
// ---------------------------------------------------------------------------

/** Show the background color popover. */
function showPopover(): void {
  if (popover) return;
  popover = document.createElement("div");
  popover.className = "bg-popover";
  renderPopover();
  document.getElementById("workspace")!.appendChild(popover);
}

/** Hide and destroy the popover. */
function hidePopover(): void {
  if (popover) {
    popover.remove();
    popover = null;
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Common scene size presets. */
const SIZE_PRESETS: Array<{ label: string; w: number; h: number }> = [
  { label: "960 \u00D7 640", w: 960, h: 640 },
  { label: "1280 \u00D7 720", w: 1280, h: 720 },
  { label: "1920 \u00D7 1080", w: 1920, h: 1080 },
  { label: "800 \u00D7 600", w: 800, h: 600 },
];

/** Auto-cycle palette for new zone types. */
const AUTO_COLORS = ["#D4A843", "#5EA3C7", "#8B6FBF", "#5DA07A", "#C76B5E", "#7BAAD4"];
let autoColorIndex = 0;

/** Render the popover contents. */
function renderPopover(): void {
  if (!popover) return;
  popover.innerHTML = "";

  const { background, dimensions, zoneTypes } = getSceneState();
  const { activeZoneTypeId } = getEditorState();

  // Title
  const title = document.createElement("h3");
  title.className = "bg-title";
  title.textContent = "Scene";
  popover.appendChild(title);

  // ── Scene dimensions ──
  const dimSection = document.createElement("div");
  dimSection.className = "bg-section";

  const dimLabel = document.createElement("span");
  dimLabel.className = "bg-section-label";
  dimLabel.textContent = "Dimensions";
  dimSection.appendChild(dimLabel);

  const dimRow = document.createElement("div");
  dimRow.className = "bg-dim-row";

  // Width
  const wField = createDimField("W", dimensions.width, (v) => {
    const prev = { ...getSceneState().dimensions };
    const next = { ...prev, width: v };
    const cmd: UndoableCommand = {
      execute() { updateSceneState({ dimensions: next }); resizeZoneGrid(); },
      undo() { updateSceneState({ dimensions: prev }); resizeZoneGrid(); },
      description: "Scene width",
    };
    executeCommand(cmd);
  });
  dimRow.appendChild(wField);

  // Separator
  const sep = document.createElement("span");
  sep.className = "bg-dim-sep";
  sep.textContent = "\u00D7";
  dimRow.appendChild(sep);

  // Height
  const hField = createDimField("H", dimensions.height, (v) => {
    const prev = { ...getSceneState().dimensions };
    const next = { ...prev, height: v };
    const cmd: UndoableCommand = {
      execute() { updateSceneState({ dimensions: next }); resizeZoneGrid(); },
      undo() { updateSceneState({ dimensions: prev }); resizeZoneGrid(); },
      description: "Scene height",
    };
    executeCommand(cmd);
  });
  dimRow.appendChild(hField);

  dimSection.appendChild(dimRow);

  // Presets
  const presetRow = document.createElement("div");
  presetRow.className = "bg-presets";

  for (const preset of SIZE_PRESETS) {
    const btn = document.createElement("button");
    btn.className = "bg-preset-btn";
    if (dimensions.width === preset.w && dimensions.height === preset.h) {
      btn.classList.add("bg-preset-btn--active");
    }
    btn.textContent = preset.label;
    btn.addEventListener("click", () => {
      const prev = { ...getSceneState().dimensions };
      const next = { width: preset.w, height: preset.h };
      const cmd: UndoableCommand = {
        execute() { updateSceneState({ dimensions: next }); resizeZoneGrid(); },
        undo() { updateSceneState({ dimensions: prev }); resizeZoneGrid(); },
        description: `Scene size ${preset.label}`,
      };
      executeCommand(cmd);
    });
    presetRow.appendChild(btn);
  }
  dimSection.appendChild(presetRow);
  popover.appendChild(dimSection);

  // ── Background color ──
  const colorSection = document.createElement("div");
  colorSection.className = "bg-section";

  const colorSectionLabel = document.createElement("span");
  colorSectionLabel.className = "bg-section-label";
  colorSectionLabel.textContent = "Background";
  colorSection.appendChild(colorSectionLabel);

  const colorRow = document.createElement("div");
  colorRow.className = "bg-field";

  const colorLabel = document.createElement("span");
  colorLabel.className = "bg-label";
  colorLabel.textContent = "Color";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "bg-color-input";
  colorInput.value = background.color;
  colorInput.addEventListener("change", () => {
    const prev = getSceneState().background;
    const next = { ...prev, color: colorInput.value };
    const cmd: UndoableCommand = {
      execute() {
        updateSceneState({ background: next });
      },
      undo() {
        updateSceneState({ background: prev });
      },
      description: "Background color",
    };
    executeCommand(cmd);
  });

  colorRow.appendChild(colorLabel);
  colorRow.appendChild(colorInput);
  colorSection.appendChild(colorRow);
  popover.appendChild(colorSection);

  // ── Zone palette ──
  const zoneSection = document.createElement("div");
  zoneSection.className = "bg-section";

  const zoneSectionLabel = document.createElement("span");
  zoneSectionLabel.className = "bg-section-label";
  zoneSectionLabel.textContent = "Zones";
  zoneSection.appendChild(zoneSectionLabel);

  const palette = document.createElement("div");
  palette.className = "bg-zone-palette";

  for (const zt of zoneTypes) {
    const chip = document.createElement("button");
    chip.className = "bg-zone-chip";
    if (activeZoneTypeId === zt.id) {
      chip.classList.add("bg-zone-chip--active");
      chip.style.borderColor = zt.color;
    }
    chip.title = zt.description;

    // Color swatch
    const swatch = document.createElement("span");
    swatch.className = "bg-zone-swatch";
    swatch.style.backgroundColor = zt.color;
    chip.appendChild(swatch);

    // Name
    const name = document.createElement("span");
    name.textContent = zt.name;
    chip.appendChild(name);

    // Remove button (on hover)
    const removeBtn = document.createElement("span");
    removeBtn.className = "bg-zone-chip-remove";
    removeBtn.textContent = "\u00D7";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (activeZoneTypeId === zt.id) setActiveZoneType(null);
      removeZoneType(zt.id);
    });
    chip.appendChild(removeBtn);

    chip.addEventListener("click", () => {
      // Toggle: click active chip → deselect
      if (activeZoneTypeId === zt.id) {
        setActiveZoneType(null);
      } else {
        setActiveZoneType(zt.id);
      }
    });

    palette.appendChild(chip);
  }

  // Add button
  const addBtn = document.createElement("button");
  addBtn.className = "bg-zone-add";
  addBtn.textContent = "+";
  addBtn.title = "Add zone type";
  addBtn.addEventListener("click", () => {
    const idx = zoneTypes.length + 1;
    const color = AUTO_COLORS[autoColorIndex % AUTO_COLORS.length]!;
    autoColorIndex++;
    const id = `zone-${Date.now()}`;
    addZoneType({ id, name: `Zone ${idx}`, description: "", color, capacity: 4 });
  });
  palette.appendChild(addBtn);

  zoneSection.appendChild(palette);
  popover.appendChild(zoneSection);
}

/** Create a labeled number input for dimension fields. */
function createDimField(label: string, value: number, onChange: (v: number) => void): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "bg-dim-field";

  const lbl = document.createElement("span");
  lbl.className = "bg-dim-label";
  lbl.textContent = label;

  const input = document.createElement("input");
  input.type = "number";
  input.className = "bg-dim-input";
  input.value = String(value);
  input.min = "1";
  input.step = "1";
  input.addEventListener("change", () => {
    const v = Math.max(1, Math.round(Number(input.value)));
    if (!isNaN(v) && v > 0) onChange(v);
  });

  wrapper.appendChild(lbl);
  wrapper.appendChild(input);
  return wrapper;
}

// ---------------------------------------------------------------------------
// Zone painting state
// ---------------------------------------------------------------------------

let painting = false;
let erasing = false;
let lastCol = -1;
let lastRow = -1;
/** Snapshot of cells before the current stroke (for undo). */
let cellsSnapshot: (string | null)[] = [];

// ---------------------------------------------------------------------------
// Bresenham line — cover all cells between two points
// ---------------------------------------------------------------------------

/** Iterate cells along a Bresenham line between (c0,r0) and (c1,r1). */
function bresenhamLine(
  c0: number, r0: number, c1: number, r1: number,
  callback: (col: number, row: number) => void,
): void {
  let dc = Math.abs(c1 - c0);
  let dr = Math.abs(r1 - r0);
  const sc = c0 < c1 ? 1 : -1;
  const sr = r0 < r1 ? 1 : -1;
  let err = dc - dr;
  let col = c0;
  let row = r0;

  for (;;) {
    callback(col, row);
    if (col === c1 && row === r1) break;
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; col += sc; }
    if (e2 < dc) { err += dc; row += sr; }
  }
}

// ---------------------------------------------------------------------------
// Paint / erase helpers
// ---------------------------------------------------------------------------

/** Paint or erase a single cell in the live grid (no undo — batched at mouseUp). */
function paintCell(col: number, row: number, zoneTypeId: string | null): void {
  const { zoneGrid } = getSceneState();
  if (col < 0 || col >= zoneGrid.cols || row < 0 || row >= zoneGrid.rows) return;
  const idx = row * zoneGrid.cols + col;
  if (zoneGrid.cells[idx] === zoneTypeId) return; // no change
  const newCells = [...zoneGrid.cells];
  newCells[idx] = zoneTypeId;
  updateSceneState({ zoneGrid: { ...zoneGrid, cells: newCells } });
}

/** Paint all cells along a Bresenham line. */
function paintLine(c0: number, r0: number, c1: number, r1: number, zoneTypeId: string | null): void {
  const { zoneGrid } = getSceneState();
  const newCells = [...zoneGrid.cells];
  let changed = false;
  bresenhamLine(c0, r0, c1, r1, (col, row) => {
    if (col < 0 || col >= zoneGrid.cols || row < 0 || row >= zoneGrid.rows) return;
    const idx = row * zoneGrid.cols + col;
    if (newCells[idx] !== zoneTypeId) {
      newCells[idx] = zoneTypeId;
      changed = true;
    }
  });
  if (changed) {
    updateSceneState({ zoneGrid: { ...zoneGrid, cells: newCells } });
  }
}

/** Resolve cell coordinates from scene position. */
function scenePosToCell(scenePos: { x: number; y: number }): { col: number; row: number } {
  const { zoneGrid } = getSceneState();
  return {
    col: Math.floor(scenePos.x / zoneGrid.cellSize),
    row: Math.floor(scenePos.y / zoneGrid.cellSize),
  };
}

// ---------------------------------------------------------------------------
// Right-click handling (canvas listeners — separate from CanvasToolHandler)
// ---------------------------------------------------------------------------

let rightClickBound = false;

/** Attach right-click listeners for erasing when background tool is active. */
function bindRightClick(): void {
  if (rightClickBound) return;
  rightClickBound = true;

  const container = getCanvasContainer();

  container.addEventListener("contextmenu", handleContextMenu);
  container.addEventListener("mousedown", handleRightMouseDown);
  document.addEventListener("mousemove", handleRightMouseMove);
  document.addEventListener("mouseup", handleRightMouseUp);
}

/** Remove right-click listeners. */
function unbindRightClick(): void {
  if (!rightClickBound) return;
  rightClickBound = false;

  const container = getCanvasContainer();

  container.removeEventListener("contextmenu", handleContextMenu);
  container.removeEventListener("mousedown", handleRightMouseDown);
  document.removeEventListener("mousemove", handleRightMouseMove);
  document.removeEventListener("mouseup", handleRightMouseUp);
}

function handleContextMenu(e: Event): void {
  // Prevent context menu while background tool active and zone brush selected
  const { activeTool, activeZoneTypeId } = getEditorState();
  if (activeTool === "background" && activeZoneTypeId !== null) {
    e.preventDefault();
  }
}

function handleRightMouseDown(e: MouseEvent): void {
  if (e.button !== 2) return;
  const { activeTool, activeZoneTypeId } = getEditorState();
  if (activeTool !== "background" || activeZoneTypeId === null) return;

  e.preventDefault();
  startPaint(e, true);
}

function handleRightMouseMove(e: MouseEvent): void {
  if (!painting || !erasing) return;
  continuePaint(e);
}

function handleRightMouseUp(e: MouseEvent): void {
  if (e.button !== 2) return;
  if (!painting || !erasing) return;
  endPaint();
}

// ---------------------------------------------------------------------------
// Shared paint start / continue / end
// ---------------------------------------------------------------------------

function startPaint(e: MouseEvent, isErase: boolean): void {
  const { zoneGrid } = getSceneState();
  const { activeZoneTypeId } = getEditorState();
  if (!isErase && activeZoneTypeId === null) return;

  painting = true;
  erasing = isErase;
  cellsSnapshot = [...zoneGrid.cells];

  const scenePos = screenToScene(e);
  const { col, row } = scenePosToCell(scenePos);
  lastCol = col;
  lastRow = row;

  paintCell(col, row, isErase ? null : activeZoneTypeId);
}

function continuePaint(e: MouseEvent): void {
  if (!painting) return;
  const { activeZoneTypeId } = getEditorState();
  const scenePos = screenToScene(e);
  const { col, row } = scenePosToCell(scenePos);

  if (col === lastCol && row === lastRow) return;

  const zoneId = erasing ? null : activeZoneTypeId;
  paintLine(lastCol, lastRow, col, row, zoneId);
  lastCol = col;
  lastRow = row;
}

function endPaint(): void {
  if (!painting) return;
  painting = false;

  // Create undo command for the entire stroke
  const snapshotBefore = cellsSnapshot;
  const { zoneGrid } = getSceneState();
  const snapshotAfter = [...zoneGrid.cells];
  const gridMeta: Omit<ZoneGrid, "cells"> = {
    cellSize: zoneGrid.cellSize,
    cols: zoneGrid.cols,
    rows: zoneGrid.rows,
  };

  // Only create undo entry if something changed
  const changed = snapshotBefore.some((v, i) => v !== snapshotAfter[i]);
  if (!changed) return;

  const cmd: UndoableCommand = {
    execute() {
      updateSceneState({ zoneGrid: { ...gridMeta, cells: [...snapshotAfter] } });
    },
    undo() {
      updateSceneState({ zoneGrid: { ...gridMeta, cells: [...snapshotBefore] } });
    },
    description: erasing ? "Erase zone cells" : "Paint zone cells",
  };
  // Apply without re-executing (cells are already painted)
  executeCommand(cmd, true);

  cellsSnapshot = [];
  erasing = false;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/** Create the Background tool handler. */
export function createBackgroundTool(): CanvasToolHandler {
  return {
    onMouseDown(e: MouseEvent, _scenePos: { x: number; y: number }) {
      const { activeZoneTypeId } = getEditorState();
      if (activeZoneTypeId === null) return;

      // Alt+click → erase
      const isErase = e.altKey;
      startPaint(e, isErase);
    },

    onMouseMove(e: MouseEvent, _scenePos: { x: number; y: number }) {
      if (!painting || erasing) return; // right-click erase handled by own listeners
      continuePaint(e);
    },

    onMouseUp(_e: MouseEvent, _scenePos: { x: number; y: number }) {
      if (!painting || erasing) return;
      endPaint();
    },
  };
}

/** Initialize background tool lifecycle (auto show/hide + right-click binding). */
export function initBackgroundToolLifecycle(): void {
  subscribeEditor(() => {
    const { activeTool } = getEditorState();
    if (activeTool === "background") {
      showPopover();
      bindRightClick();
    } else {
      hidePopover();
      unbindRightClick();
      // Deselect zone brush when switching away
      if (getEditorState().activeZoneTypeId !== null) {
        setActiveZoneType(null);
      }
    }
  });

  subscribeScene(() => {
    if (popover) renderPopover();
  });
}
