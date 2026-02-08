/**
 * Sajou Theme Editor — main entry point.
 *
 * Wires all modules together: tab controller, asset browser,
 * entity modules, exporter, and onboarding overlay.
 */

import { initTabController } from "./tab-controller.js";
import { initAssetBrowser } from "./asset-browser.js";
import { initEntityList } from "./entity-list.js";
import { initEntityConfig } from "./entity-config.js";
import { initStateConfig } from "./state-config.js";
import { initPreviewRenderer } from "./preview-renderer.js";
import { exportZip, importJson } from "./exporter.js";

// ---------------------------------------------------------------------------
// Onboarding overlay
// ---------------------------------------------------------------------------

const ONBOARDING_KEY = "sajou-theme-editor-onboarding-dismissed";

const onboardingOverlay = document.getElementById("onboarding-overlay")!;
const btnOnboardingDismiss = document.getElementById("btn-onboarding-dismiss")!;
const onboardingDontShow = document.getElementById("onboarding-dont-show") as HTMLInputElement;
const btnHelp = document.getElementById("btn-help")!;

/** Show the onboarding overlay. */
function showOnboarding(): void {
  onboardingOverlay.hidden = false;
}

/** Hide the onboarding overlay. */
function dismissOnboarding(): void {
  onboardingOverlay.hidden = true;
  if (onboardingDontShow.checked) {
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
    } catch {
      // localStorage unavailable — ignore
    }
  }
}

// Show on first launch (unless previously dismissed)
try {
  if (!localStorage.getItem(ONBOARDING_KEY)) {
    showOnboarding();
  }
} catch {
  // localStorage unavailable — show anyway
  showOnboarding();
}

btnOnboardingDismiss.addEventListener("click", dismissOnboarding);

// Clicking outside the panel also dismisses
onboardingOverlay.addEventListener("click", (e) => {
  if (e.target === onboardingOverlay) {
    dismissOnboarding();
  }
});

// Help button re-opens the onboarding
btnHelp.addEventListener("click", showOnboarding);

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

initTabController();
initAssetBrowser();
initEntityList();
initEntityConfig();
initStateConfig();
initPreviewRenderer();
