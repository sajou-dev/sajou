/**
 * Shortcuts panel.
 *
 * Read-only panel displaying all keyboard shortcuts grouped by category.
 * Data-driven from the SHORTCUTS registry.
 */

import { SHORTCUTS } from "../shortcuts/shortcut-registry.js";
import type { ShortcutCategory } from "../shortcuts/shortcut-registry.js";

/** Human-readable category labels. */
const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  file: "File",
  tools: "Tools",
  panels: "Panels",
  canvas: "Canvas",
  editing: "Editing",
  pipeline: "Pipeline",
};

/** Display order for categories. */
const CATEGORY_ORDER: readonly ShortcutCategory[] = [
  "file",
  "tools",
  "panels",
  "canvas",
  "editing",
  "pipeline",
];

/** Initialize the shortcuts panel content inside the given container. */
export function initShortcutsPanel(container: HTMLElement): void {
  container.classList.add("sk-root");

  // Group shortcuts by category
  const grouped = new Map<ShortcutCategory, typeof SHORTCUTS[number][]>();
  for (const entry of SHORTCUTS) {
    let list = grouped.get(entry.category);
    if (!list) {
      list = [];
      grouped.set(entry.category, list);
    }
    list.push(entry);
  }

  // Render each category
  for (const cat of CATEGORY_ORDER) {
    const entries = grouped.get(cat);
    if (!entries || entries.length === 0) continue;

    const section = document.createElement("div");
    section.className = "sk-section";

    const heading = document.createElement("div");
    heading.className = "sk-heading";
    heading.textContent = CATEGORY_LABELS[cat];
    section.appendChild(heading);

    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "sk-row";

      const label = document.createElement("span");
      label.className = "sk-label";
      label.textContent = entry.label;
      row.appendChild(label);

      const keys = document.createElement("span");
      keys.className = "sk-keys";
      for (const k of entry.keys) {
        const kbd = document.createElement("kbd");
        kbd.textContent = k;
        keys.appendChild(kbd);
      }
      row.appendChild(keys);

      section.appendChild(row);
    }

    container.appendChild(section);
  }
}
