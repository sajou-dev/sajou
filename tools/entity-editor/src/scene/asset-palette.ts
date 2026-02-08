/**
 * Asset palette module (scene tab left sidebar).
 *
 * Scrollable list of asset thumbnails with search. Items are
 * draggable for placement onto the scene canvas.
 */

import { getState, subscribe } from "../app-state.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const paletteSearch = document.getElementById("palette-search") as HTMLInputElement;
const paletteList = document.getElementById("palette-list")!;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let searchTerm = "";

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Render the palette thumbnails. */
function render(): void {
  const { assets } = getState();
  paletteList.innerHTML = "";

  if (assets.length === 0) {
    const hint = document.createElement("p");
    hint.className = "palette-empty";
    hint.textContent = "Import assets in the Assets tab first.";
    paletteList.appendChild(hint);
    return;
  }

  const filtered = searchTerm
    ? assets.filter((a) =>
        a.path.toLowerCase().includes(searchTerm) ||
        a.name.toLowerCase().includes(searchTerm),
      )
    : assets;

  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));

  for (const asset of sorted) {
    const item = document.createElement("div");
    item.className = "palette-item";
    item.draggable = true;
    item.title = asset.path;

    item.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", asset.path);
      e.dataTransfer?.setData("application/x-sajou-asset", asset.path);
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
