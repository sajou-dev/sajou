/**
 * Asset Manager panel.
 *
 * Full asset browser with drag & drop import, category pills,
 * thumbnail grid, search, and detail sidebar.
 * Fills the "asset-manager" floating panel shell.
 */

import {
  getAssetStore,
  getFilteredAssets,
  addAssets,
  selectAsset,
  setCategoryFilter,
  addCategory,
  subscribeAssets,
} from "../state/asset-store.js";
import {
  importFiles,
  importDroppedItems,
  enrichAssetMetadata,
} from "../assets/asset-import.js";
import { findEntityForAsset, createEntityFromAsset } from "../tools/auto-entity.js";
import { setEntity, removeEntity } from "../state/entity-store.js";
import { getEditorState } from "../state/editor-state.js";
import { getSceneState, updateSceneState } from "../state/scene-state.js";
import { executeCommand } from "../state/undo.js";
import type { AssetFile, PlacedEntity, UndoableCommand, SceneLayer } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format file size. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Get the active layer if it's usable (exists, visible, unlocked). */
function getUsableActiveLayer(): SceneLayer | null {
  const { activeLayerId } = getEditorState();
  if (!activeLayerId) return null;
  const { layers } = getSceneState();
  const layer = layers.find((l) => l.id === activeLayerId);
  if (!layer || layer.locked || !layer.visible) return null;
  return layer;
}

/** Generate a unique placed entity ID. */
function generatePlacedId(entityId: string): string {
  return `${entityId}-${Date.now().toString(36)}`;
}

/** Place an asset at a precise scene position. */
function placeAssetAt(asset: AssetFile, x: number, y: number): void {
  const activeLayer = getUsableActiveLayer();
  if (!activeLayer) return;

  let entityDef = findEntityForAsset(asset.path);
  const isNewEntity = !entityDef;
  if (!entityDef) entityDef = createEntityFromAsset(asset);

  let activeState = "default";
  if (entityDef.visual.type === "spritesheet") {
    const keys = Object.keys(entityDef.visual.animations);
    activeState = keys[0] ?? "default";
  }

  const placed: PlacedEntity = {
    id: generatePlacedId(entityDef.id),
    entityId: entityDef.id,
    x,
    y,
    scale: entityDef.defaults.scale ?? 1,
    rotation: 0,
    layerId: activeLayer.id,
    opacity: entityDef.defaults.opacity ?? 1,
    flipH: false,
    flipV: false,
    locked: false,
    visible: true,
    activeState,
  };

  const capturedEntityDef = entityDef;
  const capturedEntityId = entityDef.id;

  const cmd: UndoableCommand = {
    execute() {
      if (isNewEntity) setEntity(capturedEntityId, capturedEntityDef);
      const { entities } = getSceneState();
      updateSceneState({ entities: [...entities, placed] });
    },
    undo() {
      const { entities } = getSceneState();
      updateSceneState({ entities: entities.filter((e) => e.id !== placed.id) });
      if (isNewEntity) removeEntity(capturedEntityId);
    },
    description: `Place ${capturedEntityId} at ${x},${y}`,
  };
  executeCommand(cmd);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the Asset Manager panel content. */
export function initAssetManagerPanel(contentEl: HTMLElement): void {
  // Structure
  contentEl.innerHTML = "";
  contentEl.classList.add("am-panel");

  // Toolbar row
  const toolbar = document.createElement("div");
  toolbar.className = "am-toolbar";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "am-search";
  searchInput.placeholder = "Search assets\u2026";

  const pickFilesBtn = document.createElement("button");
  pickFilesBtn.className = "am-btn";
  pickFilesBtn.textContent = "Files\u2026";

  const pickFolderBtn = document.createElement("button");
  pickFolderBtn.className = "am-btn";
  pickFolderBtn.textContent = "Folder\u2026";

  toolbar.appendChild(searchInput);
  toolbar.appendChild(pickFilesBtn);
  toolbar.appendChild(pickFolderBtn);

  // Category bar
  const categoryBar = document.createElement("div");
  categoryBar.className = "am-categories";

  // Drop zone
  const dropZone = document.createElement("div");
  dropZone.className = "am-drop-zone";
  dropZone.innerHTML =
    '<p class="am-drop-text">Drop images or folders here</p>' +
    '<p class="am-drop-hint">PNG, SVG, WebP, GIF, JPEG</p>';

  // Grid
  const grid = document.createElement("div");
  grid.className = "am-grid";

  // Detail panel
  const detail = document.createElement("div");
  detail.className = "am-detail";
  detail.hidden = true;

  contentEl.appendChild(toolbar);
  contentEl.appendChild(categoryBar);
  contentEl.appendChild(dropZone);
  contentEl.appendChild(grid);
  contentEl.appendChild(detail);

  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------

  let searchTerm = "";

  // ---------------------------------------------------------------------------
  // File picker
  // ---------------------------------------------------------------------------

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.style.display = "none";
  fileInput.accept = "image/png,image/svg+xml,image/webp,image/gif,image/jpeg";
  fileInput.multiple = true;
  contentEl.appendChild(fileInput);

  const folderInput = document.createElement("input");
  folderInput.type = "file";
  folderInput.style.display = "none";
  folderInput.setAttribute("webkitdirectory", "");
  folderInput.multiple = true;
  contentEl.appendChild(folderInput);

  pickFilesBtn.addEventListener("click", () => fileInput.click());
  pickFolderBtn.addEventListener("click", () => folderInput.click());

  /** Handle file selection from either input. */
  function handleFileSelection(input: HTMLInputElement): void {
    if (input.files && input.files.length > 0) {
      const assets = importFiles(input.files);
      addAssets(assets);
      for (const a of assets) void enrichAssetMetadata(a);
      input.value = "";
    }
  }

  fileInput.addEventListener("change", () => handleFileSelection(fileInput));
  folderInput.addEventListener("change", () => handleFileSelection(folderInput));

  // ---------------------------------------------------------------------------
  // Drag & drop
  // ---------------------------------------------------------------------------

  contentEl.addEventListener("dragover", (e) => {
    // Don't intercept sajou-asset drags (those go to canvas)
    if (e.dataTransfer?.types.includes("application/x-sajou-asset")) return;
    e.preventDefault();
    contentEl.classList.add("am-drop-active");
    dropZone.classList.add("am-drop-active");
  });
  contentEl.addEventListener("dragleave", (e) => {
    if (!contentEl.contains(e.relatedTarget as Node)) {
      contentEl.classList.remove("am-drop-active");
      dropZone.classList.remove("am-drop-active");
    }
  });
  contentEl.addEventListener("drop", (e) => {
    // Don't intercept sajou-asset drags
    if (e.dataTransfer?.types.includes("application/x-sajou-asset")) return;
    e.preventDefault();
    contentEl.classList.remove("am-drop-active");
    dropZone.classList.remove("am-drop-active");
    if (!e.dataTransfer) return;
    void importDroppedItems(e.dataTransfer.items).then((assets) => {
      addAssets(assets);
      for (const a of assets) void enrichAssetMetadata(a);
    });
  });

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value.toLowerCase().trim();
    render();
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function render(): void {
    const store = getAssetStore();
    const hasAssets = store.assets.length > 0;

    dropZone.hidden = hasAssets;
    grid.hidden = !hasAssets;

    renderCategories(store.categories, store.categoryFilter);

    let assets = getFilteredAssets();
    if (searchTerm) {
      assets = assets.filter(
        (a) =>
          a.path.toLowerCase().includes(searchTerm) ||
          a.name.toLowerCase().includes(searchTerm),
      );
    }

    renderGrid(assets, store.selectedAssetPath);
    renderDetail(store.selectedAssetPath, store.assets);
  }

  function renderCategories(categories: string[], activeFilter: string | null): void {
    categoryBar.innerHTML = "";
    if (categories.length === 0) return;

    // "All" pill
    const allPill = document.createElement("button");
    allPill.className = "am-pill" + (activeFilter === null ? " am-pill--active" : "");
    allPill.textContent = "All";
    allPill.addEventListener("click", () => setCategoryFilter(null));
    categoryBar.appendChild(allPill);

    for (const cat of categories) {
      const pill = document.createElement("button");
      pill.className = "am-pill" + (activeFilter === cat ? " am-pill--active" : "");
      pill.textContent = cat;
      pill.addEventListener("click", () =>
        setCategoryFilter(activeFilter === cat ? null : cat),
      );
      categoryBar.appendChild(pill);
    }

    // "+" pill
    const addPill = document.createElement("button");
    addPill.className = "am-pill am-pill--add";
    addPill.textContent = "+";
    addPill.title = "Add category";
    addPill.addEventListener("click", () => {
      const name = prompt("New category name:");
      if (name?.trim()) addCategory(name.trim());
    });
    categoryBar.appendChild(addPill);
  }

  function renderGrid(assets: AssetFile[], selectedPath: string | null): void {
    grid.innerHTML = "";

    for (const asset of assets) {
      const item = document.createElement("div");
      item.className = "am-item" + (asset.path === selectedPath ? " am-item--selected" : "");

      const thumb = document.createElement("img");
      thumb.className = "am-thumb";
      thumb.src = asset.objectUrl;
      thumb.alt = asset.name;
      thumb.loading = "lazy";

      const label = document.createElement("span");
      label.className = "am-label";
      label.textContent = asset.name;
      label.title = asset.path;

      item.appendChild(thumb);
      item.appendChild(label);

      // Badge
      if (asset.format === "gif") {
        const badge = document.createElement("span");
        badge.className = "am-badge";
        badge.textContent = "GIF";
        item.appendChild(badge);
      }

      item.addEventListener("click", () => selectAsset(asset.path));

      // Draggable for entity editor
      item.draggable = true;
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("text/plain", asset.path);
        e.dataTransfer?.setData("application/x-sajou-asset", asset.path);
      });

      grid.appendChild(item);
    }
  }

  function renderDetail(selectedPath: string | null, allAssets: AssetFile[]): void {
    if (!selectedPath) {
      detail.hidden = true;
      return;
    }

    const asset = allAssets.find((a) => a.path === selectedPath);
    if (!asset) {
      detail.hidden = true;
      return;
    }

    detail.hidden = false;
    detail.innerHTML = "";

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.className = "am-detail-close";
    closeBtn.textContent = "\u00D7";
    closeBtn.addEventListener("click", () => selectAsset(null));
    detail.appendChild(closeBtn);

    // Preview
    const preview = document.createElement("img");
    preview.className = "am-detail-preview";
    preview.src = asset.objectUrl;
    preview.alt = asset.name;
    detail.appendChild(preview);

    // Info rows
    const info = document.createElement("div");
    info.className = "am-detail-info";

    const addRow = (label: string, value: string): void => {
      const row = document.createElement("div");
      row.className = "am-detail-row";
      row.innerHTML = `<span class="am-detail-label">${label}</span><span class="am-detail-value" title="${value}">${value}</span>`;
      info.appendChild(row);
    };

    addRow("Name", asset.name);
    addRow("Path", asset.path);
    addRow("Format", asset.format);
    addRow("Size", formatSize(asset.file.size));
    if (asset.naturalWidth) {
      addRow("Dimensions", `${asset.naturalWidth} \u00D7 ${asset.naturalHeight} px`);
    }
    if (asset.frameCount && asset.frameCount > 1) {
      addRow("Frames", String(asset.frameCount));
    }

    detail.appendChild(info);

    // Quick-place buttons
    const placeRow = document.createElement("div");
    placeRow.className = "am-detail-actions";

    const placeOriginBtn = document.createElement("button");
    placeOriginBtn.className = "am-action-btn";
    placeOriginBtn.textContent = "\u2196 Origin";
    placeOriginBtn.title = "Place at scene origin (0, 0)";
    placeOriginBtn.addEventListener("click", () => placeAssetAt(asset, 0, 0));
    placeRow.appendChild(placeOriginBtn);

    const { dimensions } = getSceneState();
    const placeCenterBtn = document.createElement("button");
    placeCenterBtn.className = "am-action-btn";
    placeCenterBtn.textContent = "\u253C Center";
    placeCenterBtn.title = `Place at scene center (${dimensions.width / 2}, ${dimensions.height / 2})`;
    placeCenterBtn.addEventListener("click", () =>
      placeAssetAt(asset, dimensions.width / 2, dimensions.height / 2));
    placeRow.appendChild(placeCenterBtn);

    detail.appendChild(placeRow);
  }

  // ---------------------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------------------

  subscribeAssets(render);
  render();
}
