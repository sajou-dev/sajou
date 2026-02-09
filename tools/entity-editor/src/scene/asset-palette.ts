/**
 * Asset palette module (scene tab left sidebar).
 *
 * Scrollable list of asset thumbnails with search and category filter.
 * In build mode, clicking an asset sets it as the active placement asset.
 * Items are draggable for placement onto the scene canvas.
 */

import { getState, updateState, subscribe } from "../app-state.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const paletteSearch = document.getElementById("palette-search") as HTMLInputElement;
const paletteList = document.getElementById("palette-list")!;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let searchTerm = "";
let categoryFilter: string | null = null;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Render the palette filter bar and thumbnails. */
function render(): void {
  const { assets, sceneEditor, assetCategories } = getState();
  paletteList.innerHTML = "";

  if (assets.length === 0) {
    const hint = document.createElement("p");
    hint.className = "palette-empty";
    hint.textContent = "Import assets in the Assets tab first.";
    paletteList.appendChild(hint);
    return;
  }

  // Category filter pills (only if categories exist)
  if (assetCategories.length > 0) {
    const filterRow = document.createElement("div");
    filterRow.className = "palette-categories";

    const allBtn = document.createElement("button");
    allBtn.className = "palette-cat-btn" + (categoryFilter === null ? " active" : "");
    allBtn.textContent = "All";
    allBtn.addEventListener("click", () => { categoryFilter = null; render(); });
    filterRow.appendChild(allBtn);

    for (const cat of assetCategories) {
      const btn = document.createElement("button");
      btn.className = "palette-cat-btn" + (categoryFilter === cat ? " active" : "");
      btn.textContent = cat;
      btn.addEventListener("click", () => { categoryFilter = cat; render(); });
      filterRow.appendChild(btn);
    }

    paletteList.appendChild(filterRow);
  }

  // Filter by search and category
  let filtered = assets;
  if (searchTerm) {
    filtered = filtered.filter((a) =>
      a.path.toLowerCase().includes(searchTerm) ||
      a.name.toLowerCase().includes(searchTerm),
    );
  }
  if (categoryFilter) {
    filtered = filtered.filter((a) => a.category === categoryFilter);
  }

  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));

  const isBuild = sceneEditor.mode === "build";

  for (const asset of sorted) {
    const item = document.createElement("div");
    item.className = "palette-item";
    item.draggable = true;
    item.title = asset.path;

    // Highlight active asset in build mode
    if (isBuild && sceneEditor.activeAssetPath === asset.path) {
      item.classList.add("palette-item-active");
    }

    item.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", asset.path);
      e.dataTransfer?.setData("application/x-sajou-asset", asset.path);
    });

    // In build mode, clicking sets active asset
    item.addEventListener("click", () => {
      const state = getState();
      if (state.sceneEditor.mode === "build") {
        const current = state.sceneEditor.activeAssetPath;
        updateState({
          sceneEditor: {
            ...state.sceneEditor,
            activeAssetPath: current === asset.path ? null : asset.path,
          },
        });
      }
    });

    const thumb = document.createElement("img");
    thumb.className = "palette-thumb";
    thumb.src = asset.objectUrl;
    thumb.alt = asset.name;
    thumb.loading = "lazy";

    const name = document.createElement("span");
    name.className = "palette-name";
    name.textContent = asset.name;

    item.appendChild(thumb);
    item.appendChild(name);
    paletteList.appendChild(item);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the asset palette. */
export function initAssetPalette(): void {
  paletteSearch.addEventListener("input", () => {
    searchTerm = paletteSearch.value.toLowerCase().trim();
    render();
  });

  subscribe(render);
  render();
}
