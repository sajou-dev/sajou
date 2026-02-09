/**
 * Entity Palette panel.
 *
 * Compact catalog of all defined entities. Click to select an entity
 * for placement on the canvas (sets placingEntityId in editor state).
 * Fills the "entity-palette" floating panel shell.
 */

import {
  getEntityStore,
  subscribeEntities,
} from "../state/entity-store.js";
import {
  getEditorState,
  setPlacingEntity,
  setActiveTool,
  subscribeEditor,
} from "../state/editor-state.js";
import { getAssetStore, subscribeAssets } from "../state/asset-store.js";
import type { EntityEntry } from "../types.js";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the Entity Palette panel content. */
export function initEntityPalettePanel(contentEl: HTMLElement): void {
  contentEl.innerHTML = "";
  contentEl.classList.add("ep-panel");

  // Tag filter bar
  const filterBar = document.createElement("div");
  filterBar.className = "ep-filter-bar";

  // Grid
  const grid = document.createElement("div");
  grid.className = "ep-grid";

  contentEl.appendChild(filterBar);
  contentEl.appendChild(grid);

  // Local tag filter state
  let activeTag: string | null = null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function render(): void {
    const store = getEntityStore();
    const editor = getEditorState();
    const entries = Object.values(store.entities);

    // Collect all unique tags
    const allTags = new Set<string>();
    for (const e of entries) {
      for (const t of e.tags) allTags.add(t);
    }

    // Render tag filters
    renderFilterBar([...allTags].sort());

    // Filter by tag
    const filtered = activeTag
      ? entries.filter((e) => e.tags.includes(activeTag!))
      : entries;

    // Render grid
    grid.innerHTML = "";

    if (filtered.length === 0) {
      const empty = document.createElement("p");
      empty.className = "ep-empty";
      empty.textContent = entries.length === 0
        ? "No entities. Open Entity Editor to create one."
        : "No entities match this filter.";
      grid.appendChild(empty);
      return;
    }

    for (const entity of filtered) {
      const item = document.createElement("div");
      item.className = "ep-item";
      if (editor.placingEntityId === entity.id) {
        item.classList.add("ep-item--active");
      }

      // Thumbnail
      const thumb = document.createElement("div");
      thumb.className = "ep-thumb";
      renderThumb(thumb, entity);

      // Label
      const label = document.createElement("span");
      label.className = "ep-label";
      label.textContent = entity.id;

      item.appendChild(thumb);
      item.appendChild(label);

      item.addEventListener("click", () => {
        if (editor.placingEntityId === entity.id) {
          // Deselect
          setPlacingEntity(null);
        } else {
          setPlacingEntity(entity.id);
          setActiveTool("place");
        }
      });

      grid.appendChild(item);
    }
  }

  function renderFilterBar(tags: string[]): void {
    filterBar.innerHTML = "";
    if (tags.length === 0) return;

    const allPill = document.createElement("button");
    allPill.className = "ep-pill" + (activeTag === null ? " ep-pill--active" : "");
    allPill.textContent = "All";
    allPill.addEventListener("click", () => {
      activeTag = null;
      render();
    });
    filterBar.appendChild(allPill);

    for (const tag of tags) {
      const pill = document.createElement("button");
      pill.className = "ep-pill" + (activeTag === tag ? " ep-pill--active" : "");
      pill.textContent = tag;
      pill.addEventListener("click", () => {
        activeTag = activeTag === tag ? null : tag;
        render();
      });
      filterBar.appendChild(pill);
    }
  }

  function renderThumb(container: HTMLElement, entity: EntityEntry): void {
    const assetStore = getAssetStore();
    const asset = assetStore.assets.find((a) => a.path === entity.visual.source);

    if (asset) {
      const img = document.createElement("img");
      img.className = "ep-thumb-img";
      img.src = asset.objectUrl;
      img.alt = entity.id;
      container.appendChild(img);
    } else {
      // Fallback color swatch
      container.style.backgroundColor = entity.fallbackColor;
    }
  }

  // ---------------------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------------------

  subscribeEntities(render);
  subscribeEditor(render);
  subscribeAssets(render);
  render();
}
