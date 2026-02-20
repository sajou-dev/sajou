/**
 * Tab controller module.
 *
 * Manages the tab bar navigation between Assets, Entities, and Scene tabs.
 * Shows/hides corresponding sections and updates active tab state.
 */

import { getState, updateState, subscribe } from "./app-state.js";
import type { ActiveTab } from "./types.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const tabBar = document.getElementById("tab-bar")!;
const tabAssets = document.getElementById("tab-assets")!;
const tabEntities = document.getElementById("tab-entities")!;
const tabScene = document.getElementById("tab-scene")!;

const sectionAssets = document.getElementById("section-assets")!;
const sectionEntities = document.getElementById("section-entities")!;
const sectionScene = document.getElementById("section-scene")!;

// ---------------------------------------------------------------------------
// Tab data
// ---------------------------------------------------------------------------

const tabs: Array<{ id: ActiveTab; button: HTMLElement; section: HTMLElement }> = [
  { id: "assets", button: tabAssets, section: sectionAssets },
  { id: "entities", button: tabEntities, section: sectionEntities },
  { id: "scene", button: tabScene, section: sectionScene },
];

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Update the DOM to reflect the active tab. */
function render(): void {
  const { activeTab } = getState();

  for (const tab of tabs) {
    if (tab.id === activeTab) {
      tab.button.classList.add("active");
      tab.section.hidden = false;
    } else {
      tab.button.classList.remove("active");
      tab.section.hidden = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the tab controller. */
export function initTabController(): void {
  // Attach click handlers to tab buttons
  for (const tab of tabs) {
    tab.button.addEventListener("click", () => {
      updateState({ activeTab: tab.id });
    });
  }

  // Keyboard shortcut: Ctrl+1/2/3 to switch tabs
  tabBar.addEventListener("keydown", (e) => {
    if (e.key >= "1" && e.key <= "3" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const idx = Number(e.key) - 1;
      const target = tabs[idx];
      if (target) {
        updateState({ activeTab: target.id });
      }
    }
  });

  subscribe(render);
  render();
}
