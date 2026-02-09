/**
 * Scene toolbar module.
 *
 * Renders mode buttons (Select, Build, Positions, Routes),
 * grid toggle, grid size selector, and background color picker.
 */

import { getState, updateState, subscribe } from "../app-state.js";
import type { SceneEditorMode } from "../types.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const toolbar = document.getElementById("scene-toolbar")!;

// ---------------------------------------------------------------------------
// Mode definitions
// ---------------------------------------------------------------------------

const MODES: Array<{ id: SceneEditorMode; label: string; title: string }> = [
  { id: "select", label: "Select", title: "Select and move elements (S)" },
  { id: "build", label: "Build", title: "Place assets on the scene (B)" },
  { id: "positions", label: "Positions", title: "Place named positions (P)" },
  { id: "routes", label: "Routes", title: "Draw routes between positions (R)" },
];

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Render the toolbar buttons. */
function render(): void {
  const { sceneEditor, scene } = getState();
  toolbar.innerHTML = "";

  // Mode buttons
  for (const mode of MODES) {
    const btn = document.createElement("button");
    btn.className = "toolbar-btn";
    btn.textContent = mode.label;
    btn.title = mode.title;
    if (sceneEditor.mode === mode.id) {
      btn.classList.add("active");
    }
    btn.addEventListener("click", () => {
      updateState({
        sceneEditor: {
          ...getState().sceneEditor,
          mode: mode.id,
          selectedIds: [],
          selectedType: null,
          activeAssetPath: mode.id !== "build" ? null : getState().sceneEditor.activeAssetPath,
        },
      });
    });
    toolbar.appendChild(btn);
  }

  // Spacer
  const spacer = document.createElement("div");
  spacer.style.flex = "1";
  toolbar.appendChild(spacer);

  // Background color
  const bgLabel = document.createElement("span");
  bgLabel.className = "toolbar-label";
  bgLabel.textContent = "BG";
  bgLabel.title = "Background color";
  toolbar.appendChild(bgLabel);

  const bgColor = document.createElement("input");
  bgColor.type = "color";
  bgColor.className = "toolbar-color";
  bgColor.value = scene.ground.color;
  bgColor.title = "Background color";
  bgColor.addEventListener("input", () => {
    const s = getState();
    updateState({ scene: { ...s.scene, ground: { ...s.scene.ground, color: bgColor.value } } });
  });
  toolbar.appendChild(bgColor);

  // Grid toggle
  const gridBtn = document.createElement("button");
  gridBtn.className = "toolbar-btn toolbar-btn-toggle";
  gridBtn.textContent = "Grid";
  gridBtn.title = "Toggle grid overlay";
  if (sceneEditor.showGrid) {
    gridBtn.classList.add("active");
  }
  gridBtn.addEventListener("click", () => {
    const se = getState().sceneEditor;
    updateState({
      sceneEditor: { ...se, showGrid: !se.showGrid },
    });
  });
  toolbar.appendChild(gridBtn);

  // Grid size selector (only visible when grid is on)
  if (sceneEditor.showGrid) {
    const gridSizeSelect = document.createElement("select");
    gridSizeSelect.className = "toolbar-select";
    gridSizeSelect.title = "Grid cell size";
    for (const size of [16, 32, 64]) {
      const opt = document.createElement("option");
      opt.value = String(size);
      opt.textContent = `${size}px`;
      if (sceneEditor.gridSize === size) opt.selected = true;
      gridSizeSelect.appendChild(opt);
    }
    gridSizeSelect.addEventListener("change", () => {
      updateState({
        sceneEditor: { ...getState().sceneEditor, gridSize: Number(gridSizeSelect.value) },
      });
    });
    toolbar.appendChild(gridSizeSelect);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the scene toolbar. */
export function initSceneToolbar(): void {
  // Keyboard shortcuts when scene tab is active
  document.addEventListener("keydown", (e) => {
    if (getState().activeTab !== "scene") return;
    if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;

    const keyMap: Record<string, SceneEditorMode> = {
      s: "select",
      b: "build",
      p: "positions",
      r: "routes",
    };

    const mode = keyMap[e.key.toLowerCase()];
    if (mode) {
      e.preventDefault();
      updateState({
        sceneEditor: {
          ...getState().sceneEditor,
          mode,
          selectedIds: [],
          selectedType: null,
          activeAssetPath: mode !== "build" ? null : getState().sceneEditor.activeAssetPath,
        },
      });
    }
  });

  subscribe(render);
  render();
}
