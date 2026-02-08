/**
 * Scene toolbar module.
 *
 * Renders mode buttons (Ground, Decor, Walls, Positions, Routes, Select)
 * and syncs with the scene editor state.
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
  { id: "ground", label: "Ground", title: "Configure ground fill (G)" },
  { id: "decor", label: "Decor", title: "Place decorations from assets (D)" },
  { id: "positions", label: "Positions", title: "Place named positions (P)" },
  { id: "routes", label: "Routes", title: "Draw routes between positions (R)" },
  { id: "walls", label: "Walls", title: "Draw wall segments (W)" },
];

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Render the toolbar buttons. */
function render(): void {
  const { sceneEditor } = getState();
  toolbar.innerHTML = "";

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
        sceneEditor: { ...getState().sceneEditor, mode: mode.id, selectedIds: [], selectedType: null },
      });
    });
    toolbar.appendChild(btn);
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
    if ((e.target as HTMLElement).tagName === "INPUT") return;

    const keyMap: Record<string, SceneEditorMode> = {
      s: "select",
      g: "ground",
      d: "decor",
      p: "positions",
      r: "routes",
      w: "walls",
    };

    const mode = keyMap[e.key.toLowerCase()];
    if (mode) {
      e.preventDefault();
      updateState({
        sceneEditor: { ...getState().sceneEditor, mode, selectedIds: [], selectedType: null },
      });
    }
  });

  subscribe(render);
  render();
}
