/**
 * Header module.
 *
 * Top bar with title, undo/redo, file actions, and run mode.
 */

import { exportScene } from "../io/export-scene.js";
import { importScene } from "../io/import-scene.js";
import { subscribeRunMode, isRunModeActive } from "../run-mode/run-mode-state.js";
import { newScene } from "../state/persistence.js";
import { undo, redo, canUndo, canRedo, subscribeUndo } from "../state/undo.js";
import { shouldSuppressShortcut } from "../shortcuts/shortcut-registry.js";

// Run mode is imported lazily to avoid loading @sajou/* packages at startup.
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

/** Sync Undo/Redo button disabled state with stack status. */
function syncUndoButtons(): void {
  const btnUndo = document.getElementById("btn-undo");
  const btnRedo = document.getElementById("btn-redo");
  btnUndo?.classList.toggle("header-btn--disabled", !canUndo());
  btnRedo?.classList.toggle("header-btn--disabled", !canRedo());
}

/** Initialize header button handlers. */
export function initHeader(): void {
  const btnNew = document.getElementById("btn-new");
  const btnImport = document.getElementById("btn-import");
  const btnExport = document.getElementById("btn-export");
  const btnRun = document.getElementById("btn-run");
  const btnUndo = document.getElementById("btn-undo");
  const btnRedo = document.getElementById("btn-redo");
  // File actions
  btnNew?.addEventListener("click", () => {
    void triggerNewScene();
  });

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

  // Runtime
  btnRun?.addEventListener("click", () => {
    void triggerRunMode();
  });

  // Editing — Undo / Redo
  btnUndo?.addEventListener("click", () => { undo(); });
  btnRedo?.addEventListener("click", () => { redo(); });

  // Subscribe to undo stack changes and set initial state
  subscribeUndo(syncUndoButtons);
  syncUndoButtons();

  // Subscribe to run mode state changes to update button appearance
  subscribeRunMode(updateRunButton);

  // Keyboard shortcuts: Ctrl+R (run), Ctrl+S (save), Ctrl+N (new)
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (shouldSuppressShortcut(e)) return;

    switch (e.key) {
      case "r":
        e.preventDefault();
        void triggerRunMode();
        break;
      case "s":
        e.preventDefault();
        exportScene().catch((err: unknown) => {
          console.error("[scene-builder] Export failed:", err);
        });
        break;
      case "n":
        e.preventDefault();
        void triggerNewScene();
        break;
    }
  });
}
