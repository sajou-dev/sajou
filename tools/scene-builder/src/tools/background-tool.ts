/**
 * Background tool.
 *
 * Quick-access popover for the base background color.
 * Layer management lives in the Layers panel (Photoshop-style).
 *
 * Popover auto-shows when the tool is selected.
 * Color changes go through the undo system.
 */

import type { CanvasToolHandler } from "../canvas/canvas.js";
import {
  getEditorState,
  subscribeEditor,
} from "../state/editor-state.js";
import {
  getSceneState,
  subscribeScene,
  updateSceneState,
} from "../state/scene-state.js";
import { executeCommand } from "../state/undo.js";
import type { UndoableCommand } from "../types.js";

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

/** Render the popover contents. */
function renderPopover(): void {
  if (!popover) return;
  popover.innerHTML = "";

  const { background, dimensions } = getSceneState();

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
      execute() { updateSceneState({ dimensions: next }); },
      undo() { updateSceneState({ dimensions: prev }); },
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
      execute() { updateSceneState({ dimensions: next }); },
      undo() { updateSceneState({ dimensions: prev }); },
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
        execute() { updateSceneState({ dimensions: next }); },
        undo() { updateSceneState({ dimensions: prev }); },
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
// Tool
// ---------------------------------------------------------------------------

/** Create the Background tool handler. */
export function createBackgroundTool(): CanvasToolHandler {
  return {};
}

/** Initialize background tool lifecycle (auto show/hide). */
export function initBackgroundToolLifecycle(): void {
  subscribeEditor(() => {
    const { activeTool } = getEditorState();
    if (activeTool === "background") {
      showPopover();
    } else {
      hidePopover();
    }
  });

  subscribeScene(() => {
    if (popover) renderPopover();
  });
}
