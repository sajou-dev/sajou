/**
 * Header module.
 *
 * Top bar with title, import and export buttons.
 * Phase 1: buttons are wired but handlers are stubs.
 */

/** Initialize header button handlers. */
export function initHeader(): void {
  const btnImport = document.getElementById("btn-import");
  const btnExport = document.getElementById("btn-export");

  btnImport?.addEventListener("click", () => {
    // TODO Phase 5: import zip / JSON
    console.log("[scene-builder] Import clicked (not yet implemented)");
  });

  btnExport?.addEventListener("click", () => {
    // TODO Phase 5: export zip
    console.log("[scene-builder] Export clicked (not yet implemented)");
  });
}
