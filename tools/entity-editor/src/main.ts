/**
 * Sajou Entity Editor — main entry point.
 *
 * Wires all modules together: asset browser, entity list,
 * entity config, state config, preview renderer, and exporter.
 */

import { initAssetBrowser } from "./asset-browser.js";
import { initEntityList } from "./entity-list.js";
import { initEntityConfig } from "./entity-config.js";
import { initStateConfig } from "./state-config.js";
import { initPreviewRenderer } from "./preview-renderer.js";
import { exportZip, importJson } from "./exporter.js";

// ---------------------------------------------------------------------------
// Wire up header buttons
// ---------------------------------------------------------------------------

const btnExport = document.getElementById("btn-export")!;
const btnImportJson = document.getElementById("btn-import-json")!;

btnExport.addEventListener("click", () => {
  void exportZip();
});

// Import JSON via file picker
const jsonInput = document.createElement("input");
jsonInput.type = "file";
jsonInput.accept = ".json";
jsonInput.className = "hidden-input";
document.body.appendChild(jsonInput);

btnImportJson.addEventListener("click", () => {
  jsonInput.click();
});

jsonInput.addEventListener("change", () => {
  const file = jsonInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") {
      importJson(reader.result);
    }
  };
  reader.readAsText(file);
  jsonInput.value = "";
});

// ---------------------------------------------------------------------------
// Initialize all modules
// ---------------------------------------------------------------------------

initAssetBrowser();
initEntityList();
initEntityConfig();
initStateConfig();
initPreviewRenderer();
