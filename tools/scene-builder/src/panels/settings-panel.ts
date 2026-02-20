/**
 * Settings panel.
 *
 * Two sections:
 * 1. Grid & Snap — toggle grid, set grid size, toggle snap
 * 2. Scene Info — read-only stats (dimensions, counts)
 *
 * Subscribes to editor state (grid/snap) and scene state (counts).
 */

import {
  getEditorState,
  subscribeEditor,
  toggleGrid,
  setGridSize,
  setSnapToGrid,
} from "../state/editor-state.js";
import { getSceneState, subscribeScene } from "../state/scene-state.js";

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/** Create a section with title and body. */
function createSection(title: string): { section: HTMLElement; body: HTMLElement } {
  const section = document.createElement("div");
  section.className = "sp-section";

  const heading = document.createElement("div");
  heading.className = "sp-section-title";
  heading.textContent = title;
  section.appendChild(heading);

  const body = document.createElement("div");
  body.className = "sp-section-body";
  section.appendChild(body);

  return { section, body };
}

/** Create a row with a label and a control element. */
function createRow(label: string, control: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "sp-row";

  const lbl = document.createElement("span");
  lbl.className = "sp-label";
  lbl.textContent = label;

  row.appendChild(lbl);
  row.appendChild(control);
  return row;
}

/** Create a checkbox that calls `onChange` on toggle. */
function createCheckbox(
  checked: boolean,
  onChange: (v: boolean) => void,
): HTMLInputElement {
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "sp-checkbox";
  cb.checked = checked;
  cb.addEventListener("change", () => onChange(cb.checked));
  return cb;
}

/** Create a number input with min/max/step. */
function createNumberInput(
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (v: number) => void,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.className = "sp-input";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("change", () => {
    const n = parseInt(input.value, 10);
    if (!isNaN(n)) onChange(n);
  });
  return input;
}

/** Create a read-only info row. */
function createInfoRow(label: string, value: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "sp-row";

  const lbl = document.createElement("span");
  lbl.className = "sp-label";
  lbl.textContent = label;

  const val = document.createElement("span");
  val.className = "sp-value";
  val.textContent = value;

  row.appendChild(lbl);
  row.appendChild(val);
  return row;
}

// ---------------------------------------------------------------------------
// Panel init
// ---------------------------------------------------------------------------

/** Initialize the Settings panel content. */
export function initSettingsPanel(contentEl: HTMLElement): void {
  // --- Grid & Snap section ---
  const { section: gridSection, body: gridBody } = createSection("Grid & Snap");

  const gridCheckbox = createCheckbox(
    getEditorState().gridEnabled,
    () => toggleGrid(),
  );
  gridBody.appendChild(createRow("Show grid", gridCheckbox));

  const gridSizeInput = createNumberInput(
    getEditorState().gridSize,
    4, 128, 1,
    (v) => setGridSize(v),
  );
  gridBody.appendChild(createRow("Grid size", gridSizeInput));

  const snapCheckbox = createCheckbox(
    getEditorState().snapToGrid,
    (v) => setSnapToGrid(v),
  );
  gridBody.appendChild(createRow("Snap to grid", snapCheckbox));

  contentEl.appendChild(gridSection);

  // --- Scene Info section ---
  const { section: infoSection, body: infoBody } = createSection("Scene Info");
  contentEl.appendChild(infoSection);

  /** Re-render info values from current state. */
  function renderInfo(): void {
    const scene = getSceneState();
    const { width, height } = scene.dimensions;

    infoBody.innerHTML = "";
    infoBody.appendChild(createInfoRow("Dimensions", `${width} × ${height} px`));
    infoBody.appendChild(createInfoRow("Entities", String(scene.entities.length)));
    infoBody.appendChild(createInfoRow("Positions", String(scene.positions.length)));
    infoBody.appendChild(createInfoRow("Routes", String(scene.routes.length)));
    infoBody.appendChild(createInfoRow("Layers", String(scene.layers.length)));
  }

  /** Sync grid/snap controls from state (e.g. after keyboard toggle). */
  function syncControls(): void {
    const { gridEnabled, gridSize, snapToGrid } = getEditorState();
    gridCheckbox.checked = gridEnabled;
    snapCheckbox.checked = snapToGrid;
    if (document.activeElement !== gridSizeInput) {
      gridSizeInput.value = String(gridSize);
    }
  }

  renderInfo();
  syncControls();

  subscribeEditor(syncControls);
  subscribeScene(renderInfo);
}
