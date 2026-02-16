/**
 * Header module.
 *
 * Top bar with title, preview, run mode, import and export buttons.
 */

import { exportScene } from "../io/export-scene.js";
import { importScene } from "../io/import-scene.js";
import { subscribeRunMode, isRunModeActive } from "../run-mode/run-mode-state.js";
import { newScene } from "../state/persistence.js";
import { getEditorState, setActiveView, subscribeEditor } from "../state/editor-state.js";

// Preview is imported lazily to avoid loading @sajou/* packages at startup.
// If the preview module fails to load, only the preview feature breaks —
// the rest of the workspace (panels, canvas, tools) continues normally.
let previewLoading = false;

/** Dynamically load and open the preview. */
async function triggerPreview(): Promise<void> {
  if (previewLoading) return;
  previewLoading = true;
  try {
    const { openPreview, isPreviewOpen } = await import("../preview/preview-scene.js");
    if (isPreviewOpen()) return;
    await openPreview();
  } catch (err: unknown) {
    console.error("[scene-builder] Preview failed:", err);
  } finally {
    previewLoading = false;
  }
}

// Run mode is imported lazily — same pattern as preview.
let runModeLoading = false;

/** Toggle run mode on/off. */
async function triggerRunMode(): Promise<void> {
  if (runModeLoading) return;
  runModeLoading = true;
  try {
    const { toggleRunMode } = await import("../run-mode/run-mode-controller.js");
    await toggleRunMode();
  } catch (err: unknown) {
    console.error("[scene-builder] Run mode failed:", err);
  } finally {
    runModeLoading = false;
  }
}

/** Update the Run button appearance based on run mode state. */
function updateRunButton(): void {
  const btnIcon = document.getElementById("btn-run-icon");
  const btnLabel = document.getElementById("btn-run-label");
  const btnRun = document.getElementById("btn-run");
  if (!btnIcon || !btnLabel || !btnRun) return;

  if (isRunModeActive()) {
    // Stop state: square icon + "Stop" label
    btnIcon.innerHTML = '<rect x="4" y="4" width="16" height="16" rx="2"/>';
    btnLabel.textContent = "Stop";
    btnRun.classList.add("header-btn--running");
  } else {
    // Run state: play icon + "Run" label
    btnIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    btnLabel.textContent = "Run";
    btnRun.classList.remove("header-btn--running");
  }
}

/** Trigger "New Scene" with confirmation dialog. */
async function triggerNewScene(): Promise<void> {
  const confirmed = window.confirm("Unsaved changes will be lost. Create a new scene?");
  if (!confirmed) return;

  try {
    await newScene();
  } catch (err: unknown) {
    console.error("[scene-builder] New scene failed:", err);
  }
}

/** Toggle between visual and shader views. */
function toggleShaderView(): void {
  const { currentView } = getEditorState();
  setActiveView(currentView === "shader" ? "visual" : "shader");
}

/** Initialize header button handlers. */
export function initHeader(): void {
  const btnImport = document.getElementById("btn-import");
  const btnExport = document.getElementById("btn-export");
  const btnPreview = document.getElementById("btn-preview");
  const btnRun = document.getElementById("btn-run");

  // Insert "Shader" toggle before "New"
  if (btnImport) {
    const btnShader = document.createElement("button");
    btnShader.id = "btn-shader";
    btnShader.className = "header-btn";
    btnShader.title = "Toggle Shader editor (Shift+E)";
    // Lucide code-xml icon
    btnShader.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg> <span id="btn-shader-label">Shader</span>`;
    btnShader.addEventListener("click", toggleShaderView);
    btnImport.parentNode?.insertBefore(btnShader, btnImport);

    // Sync button active state with editor view
    subscribeEditor(() => {
      const isShader = getEditorState().currentView === "shader";
      btnShader.classList.toggle("header-btn--shader-active", isShader);
      const label = document.getElementById("btn-shader-label");
      if (label) label.textContent = isShader ? "Visual" : "Shader";
    });
  }

  // Insert "New" button before Import
  if (btnImport) {
    const btnNew = document.createElement("button");
    btnNew.id = "btn-new";
    btnNew.className = "header-btn";
    btnNew.title = "New scene (Ctrl+N)";
    btnNew.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg> New`;
    btnImport.parentNode?.insertBefore(btnNew, btnImport);

    btnNew.addEventListener("click", () => {
      void triggerNewScene();
    });
  }

  btnExport?.addEventListener("click", () => {
    exportScene().catch((err: unknown) => {
      console.error("[scene-builder] Export failed:", err);
    });
  });

  btnImport?.addEventListener("click", () => {
    importScene().catch((err: unknown) => {
      console.error("[scene-builder] Import failed:", err);
    });
  });

  btnPreview?.addEventListener("click", () => {
    void triggerPreview();
  });

  btnRun?.addEventListener("click", () => {
    void triggerRunMode();
  });

  // Subscribe to run mode state changes to update button appearance
  subscribeRunMode(updateRunButton);

  // Keyboard shortcut: Ctrl+P for preview
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "p") {
      e.preventDefault();
      void triggerPreview();
    }
  });

  // Keyboard shortcut: Ctrl+R for run mode
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "r") {
      e.preventDefault();
      void triggerRunMode();
    }
  });

  // Keyboard shortcut: Ctrl+S for quick export (save)
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      exportScene().catch((err: unknown) => {
        console.error("[scene-builder] Export failed:", err);
      });
    }
  });

  // Keyboard shortcut: Ctrl+N for new scene
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      void triggerNewScene();
    }
  });

  // Keyboard shortcut: Shift+E for shader toggle
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.shiftKey && e.key === "E" && !e.ctrlKey && !e.metaKey) {
      // Don't trigger if typing in an input/textarea/contenteditable
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return;
      e.preventDefault();
      toggleShaderView();
    }
  });
}
