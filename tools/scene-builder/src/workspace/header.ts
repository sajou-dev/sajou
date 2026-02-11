/**
 * Header module.
 *
 * Top bar with title, preview, import and export buttons.
 */

import { exportScene } from "../io/export-scene.js";
import { importScene } from "../io/import-scene.js";

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

/** Initialize header button handlers. */
export function initHeader(): void {
  const btnImport = document.getElementById("btn-import");
  const btnExport = document.getElementById("btn-export");
  const btnPreview = document.getElementById("btn-preview");

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

  // Keyboard shortcut: Ctrl+P for preview
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "p") {
      e.preventDefault();
      void triggerPreview();
    }
  });
}
