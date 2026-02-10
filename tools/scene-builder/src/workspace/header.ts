/**
 * Header module.
 *
 * Top bar with title, import and export buttons.
 */

import { exportScene } from "../io/export-scene.js";
import { importScene } from "../io/import-scene.js";

/** Initialize header button handlers. */
export function initHeader(): void {
  const btnImport = document.getElementById("btn-import");
  const btnExport = document.getElementById("btn-export");

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
}
