/**
 * Sajou Theme Editor — main entry point.
 *
 * Wires all modules together: tab controller, asset browser,
 * entity modules, exporter, and onboarding overlay.
 */

import { initTabController } from "./tab-controller.js";
import { initAssetsTab } from "./assets/assets-tab.js";
import { initEntitiesTab } from "./entities/entities-tab.js";
import { initSceneTab } from "./scene/scene-tab.js";
import { exportZip, importJson, importZip } from "./exporter.js";

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

// Import JSON or ZIP via file picker
const importInput = document.createElement("input");
importInput.type = "file";
importInput.accept = ".json,.zip";
importInput.className = "hidden-input";
document.body.appendChild(importInput);

btnImportJson.addEventListener("click", () => {
  importInput.click();
});

importInput.addEventListener("change", () => {
  const file = importInput.files?.[0];
  if (!file) return;

  if (file.name.endsWith(".zip")) {
    void importZip(file);
  } else {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        importJson(reader.result);
      }
    };
    reader.readAsText(file);
  }
  importInput.value = "";
});

// ---------------------------------------------------------------------------
// Initialize all modules
// ---------------------------------------------------------------------------

initTabController();
initAssetsTab();
initEntitiesTab();
void initSceneTab();
