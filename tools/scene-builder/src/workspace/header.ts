/**
 * Header module.
 *
 * Top bar with title, preview, run mode, import and export buttons.
 */

import { exportScene } from "../io/export-scene.js";
import { importScene } from "../io/import-scene.js";
import { subscribeRunMode, isRunModeActive } from "../run-mode/run-mode-state.js";

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

/** Initialize header button handlers. */
export function initHeader(): void {
  const btnImport = document.getElementById("btn-import");
  const btnExport = document.getElementById("btn-export");
  const btnPreview = document.getElementById("btn-preview");
  const btnRun = document.getElementById("btn-run");

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
}
