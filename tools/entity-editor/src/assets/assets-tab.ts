/**
 * Assets tab module.
 *
 * Full-width asset browser with grid/list views, search/filter,
 * categories, thumbnail size control, detail panel, drag & drop,
 * context menu, and multi-select support.
 */

import {
  getState,
  updateState,
  subscribe,
} from "../app-state.js";
import type { AssetFile } from "../app-state.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const searchInput = document.getElementById("assets-search") as HTMLInputElement;
const categoryFilter = document.getElementById("assets-category-filter") as HTMLSelectElement;
const thumbSlider = document.getElementById("assets-thumb-size") as HTMLInputElement;
const btnViewGrid = document.getElementById("assets-view-grid")!;
const btnViewList = document.getElementById("assets-view-list")!;
const dropZone = document.getElementById("assets-drop-zone")!;
const grid = document.getElementById("assets-grid")!;
const listEl = document.getElementById("assets-list")!;
const categoryBar = document.getElementById("assets-category-bar")!;
const selectionBar = document.getElementById("assets-selection-bar")!;
const detailPanel = document.getElementById("assets-detail")!;
const btnPick = document.getElementById("btn-assets-pick")!;

// ---------------------------------------------------------------------------
// File scanning (shared logic)
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = new Set([".png", ".svg", ".jpg", ".jpeg", ".webp"]);

/** Check if a filename is a supported image. */
function isImageFile(name: string): boolean {
  const lower = name.toLowerCase();
  return [...IMAGE_EXTENSIONS].some((ext) => lower.endsWith(ext));
}

/** Recursively read all image files from a FileSystemDirectoryEntry. */
async function scanDirectory(
  entry: FileSystemDirectoryEntry,
  basePath: string,
): Promise<AssetFile[]> {
  const results: AssetFile[] = [];

  const entries = await new Promise<FileSystemEntry[]>((resolve) => {
    const reader = entry.createReader();
    const all: FileSystemEntry[] = [];
    const readBatch = (): void => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
        } else {
          all.push(...batch);
          readBatch();
        }
      });
    };
    readBatch();
  });

  for (const child of entries) {
    if (child.isFile && isImageFile(child.name)) {
      const file = await new Promise<File>((resolve) => {
        (child as FileSystemFileEntry).file(resolve);
      });
      const path = basePath ? `${basePath}/${child.name}` : child.name;
      results.push({
        path,
        name: child.name,
        objectUrl: URL.createObjectURL(file),
        file,
        category: null,
      });
    } else if (child.isDirectory) {
      const subPath = basePath ? `${basePath}/${child.name}` : child.name;
      const subResults = await scanDirectory(
        child as FileSystemDirectoryEntry,
        subPath,
      );
      results.push(...subResults);
    }
  }

  return results;
}

/** Scan files from a FileList (flat file picker result). */
function scanFileList(files: FileList): AssetFile[] {
  const results: AssetFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    if (!isImageFile(file.name)) continue;
    const path = file.webkitRelativePath || file.name;
    results.push({
      path,
      name: file.name,
      objectUrl: URL.createObjectURL(file),
      file,
      category: null,
    });
  }
  return results;
}

/** Merge new assets into state (skip duplicates). */
function mergeAssets(newAssets: AssetFile[]): void {
  if (newAssets.length === 0) return;
  const existing = getState().assets;
  const existingPaths = new Set(existing.map((a) => a.path));
  const fresh = newAssets.filter((a) => !existingPaths.has(a.path));
  if (fresh.length > 0) {
    updateState({ assets: [...existing, ...fresh] });
  }
}

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

let searchTerm = "";

/** Set of asset paths that are part of the multi-selection. */
let multiSelected = new Set<string>();

/** Last clicked asset index for shift-click range selection. */
let lastClickedIndex = -1;

/** Cached image dimensions: path -> { w, h }. */
const dimensionCache = new Map<string, { w: number; h: number }>();

/** Currently sorted column and direction for list view. */
let sortColumn: "name" | "path" | "dims" | "size" | "category" = "name";
let sortAsc = true;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format file size to human-readable string. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Load natural dimensions of an image, using cache. */
function getDimensions(asset: AssetFile): Promise<{ w: number; h: number }> {
  const cached = dimensionCache.get(asset.path);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const dims = { w: img.naturalWidth, h: img.naturalHeight };
      dimensionCache.set(asset.path, dims);
      resolve(dims);
    };
    img.onerror = () => {
      const dims = { w: 0, h: 0 };
      resolve(dims);
    };
    img.src = asset.objectUrl;
  });
}

/** Get filtered + sorted asset list. */
function getFilteredAssets(): AssetFile[] {
  const { assets, assetCategoryFilter } = getState();

  let filtered = assets;

  // Search filter
  if (searchTerm) {
    filtered = filtered.filter(
      (a) =>
        a.path.toLowerCase().includes(searchTerm) ||
        a.name.toLowerCase().includes(searchTerm),
    );
  }

  // Category filter
  if (assetCategoryFilter) {
    filtered = filtered.filter((a) => a.category === assetCategoryFilter);
  }

  return [...filtered].sort((a, b) => a.path.localeCompare(b.path));
}

/** Find which entities/states reference a given asset path. */
function findUsages(assetPath: string): string[] {
  const { entities } = getState();
  const usages: string[] = [];
  for (const [entityId, entry] of Object.entries(entities)) {
    for (const [stateName, state] of Object.entries(entry.states)) {
      if (state.asset === assetPath) {
        usages.push(`${entityId} / ${stateName}`);
      }
    }
  }
  return usages;
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

let contextMenuEl: HTMLElement | null = null;

/** Remove context menu if present. */
function closeContextMenu(): void {
  if (contextMenuEl) {
    contextMenuEl.remove();
    contextMenuEl = null;
  }
}

/** Show context menu at position for given asset paths. */
function showContextMenu(x: number, y: number, targetPaths: string[]): void {
  closeContextMenu();
  const { assetCategories } = getState();

  const menu = document.createElement("div");
  menu.className = "assets-context-menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // "Set category" submenu
  if (assetCategories.length > 0) {
    const sub = document.createElement("div");
    sub.className = "assets-context-submenu";

    const trigger = document.createElement("button");
    trigger.className = "assets-context-item";
    trigger.textContent = "Set category \u25B8";
    sub.appendChild(trigger);

    const subItems = document.createElement("div");
    subItems.className = "assets-context-submenu-items";

    for (const cat of assetCategories) {
      const item = document.createElement("button");
      item.className = "assets-context-item";
      item.textContent = cat;
      item.addEventListener("click", () => {
        assignCategory(targetPaths, cat);
        closeContextMenu();
      });
      subItems.appendChild(item);
    }

    sub.appendChild(subItems);
    menu.appendChild(sub);
  }

  // "Remove from category"
  const removeItem = document.createElement("button");
  removeItem.className = "assets-context-item";
  removeItem.textContent = "Remove from category";
  removeItem.addEventListener("click", () => {
    assignCategory(targetPaths, null);
    closeContextMenu();
  });
  menu.appendChild(removeItem);

  // Separator
  const sep = document.createElement("div");
  sep.className = "assets-context-sep";
  menu.appendChild(sep);

  // "Delete asset"
  const deleteItem = document.createElement("button");
  deleteItem.className = "assets-context-item danger";
  deleteItem.textContent = "Delete asset";
  deleteItem.addEventListener("click", () => {
    deleteAssets(targetPaths);
    closeContextMenu();
  });
  menu.appendChild(deleteItem);

  document.body.appendChild(menu);
  contextMenuEl = menu;

  // Adjust position if off-screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${x - rect.width}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${y - rect.height}px`;
  }
}

/** Assign a category to a set of asset paths. */
function assignCategory(paths: string[], category: string | null): void {
  const pathSet = new Set(paths);
  const assets = getState().assets.map((a) =>
    pathSet.has(a.path) ? { ...a, category } : a,
  );
  updateState({ assets });
}

/** Delete a set of assets by path. */
function deleteAssets(paths: string[]): void {
  const pathSet = new Set(paths);
  const assets = getState().assets.filter((a) => !pathSet.has(a.path));
  const { selectedAssetPath } = getState();
  updateState({
    assets,
    selectedAssetPath: selectedAssetPath && pathSet.has(selectedAssetPath) ? null : selectedAssetPath,
  });
  multiSelected = new Set([...multiSelected].filter((p) => !pathSet.has(p)));
}

// ---------------------------------------------------------------------------
// Category bar
// ---------------------------------------------------------------------------

/** Render the category bar (pills). Always visible when assets exist. */
function renderCategoryBar(): void {
  const { assetCategories, assetCategoryFilter } = getState();

  categoryBar.hidden = false;
  categoryBar.innerHTML = "";

  // "All" pill (only when categories exist)
  if (assetCategories.length > 0) {
    const allPill = document.createElement("button");
    allPill.className = "assets-category-pill" + (assetCategoryFilter === null ? " active" : "");
    allPill.textContent = "All";
    allPill.addEventListener("click", () => {
      updateState({ assetCategoryFilter: null });
    });
    categoryBar.appendChild(allPill);
  }

  // Category pills (clickable filter + drop target for categorization)
  for (const cat of assetCategories) {
    const pill = document.createElement("button");
    pill.className = "assets-category-pill" + (assetCategoryFilter === cat ? " active" : "");
    pill.textContent = cat;
    pill.addEventListener("click", () => {
      updateState({ assetCategoryFilter: assetCategoryFilter === cat ? null : cat });
    });
    pill.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showCategoryPillMenu(e.clientX, e.clientY, cat);
    });

    // Drop target: drag assets onto pill to assign category
    pill.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "link";
      pill.classList.add("drop-target");
    });
    pill.addEventListener("dragleave", () => {
      pill.classList.remove("drop-target");
    });
    pill.addEventListener("drop", (e) => {
      e.preventDefault();
      pill.classList.remove("drop-target");
      const pathsJson = e.dataTransfer?.getData("application/x-sajou-asset-paths");
      const singlePath = e.dataTransfer?.getData("application/x-sajou-asset");
      const paths: string[] = pathsJson ? JSON.parse(pathsJson) as string[] : singlePath ? [singlePath] : [];
      if (paths.length > 0) {
        assignCategory(paths, cat);
      }
    });

    categoryBar.appendChild(pill);
  }

  // "+" pill
  const addPill = document.createElement("button");
  addPill.className = "assets-category-pill assets-category-pill-add";
  addPill.textContent = "+";
  addPill.title = "Add category";
  addPill.addEventListener("click", () => {
    addCategory();
  });
  categoryBar.appendChild(addPill);
}

/** Prompt to add a new category. */
function addCategory(): void {
  const name = prompt("New category name:");
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  const { assetCategories } = getState();
  if (assetCategories.includes(trimmed)) return;
  updateState({ assetCategories: [...assetCategories, trimmed] });
}

/** Show context menu on a category pill for rename/delete. */
function showCategoryPillMenu(x: number, y: number, cat: string): void {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "assets-context-menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const renameItem = document.createElement("button");
  renameItem.className = "assets-context-item";
  renameItem.textContent = "Rename";
  renameItem.addEventListener("click", () => {
    closeContextMenu();
    const newName = prompt("Rename category:", cat);
    if (!newName || !newName.trim() || newName.trim() === cat) return;
    const trimmed = newName.trim();
    const { assetCategories, assets, assetCategoryFilter } = getState();
    updateState({
      assetCategories: assetCategories.map((c) => (c === cat ? trimmed : c)),
      assets: assets.map((a) => (a.category === cat ? { ...a, category: trimmed } : a)),
      assetCategoryFilter: assetCategoryFilter === cat ? trimmed : assetCategoryFilter,
    });
  });
  menu.appendChild(renameItem);

  const deleteItem = document.createElement("button");
  deleteItem.className = "assets-context-item danger";
  deleteItem.textContent = "Delete";
  deleteItem.addEventListener("click", () => {
    closeContextMenu();
    const { assetCategories, assets, assetCategoryFilter } = getState();
    updateState({
      assetCategories: assetCategories.filter((c) => c !== cat),
      assets: assets.map((a) => (a.category === cat ? { ...a, category: null } : a)),
      assetCategoryFilter: assetCategoryFilter === cat ? null : assetCategoryFilter,
    });
  });
  menu.appendChild(deleteItem);

  document.body.appendChild(menu);
  contextMenuEl = menu;
}

/** Update the category filter <select> dropdown options. */
function updateCategoryFilterOptions(): void {
  const { assetCategories, assetCategoryFilter } = getState();
  categoryFilter.innerHTML = '<option value="">All</option>';
  for (const cat of assetCategories) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    if (cat === assetCategoryFilter) opt.selected = true;
    categoryFilter.appendChild(opt);
  }
}

// ---------------------------------------------------------------------------
// Selection action bar
// ---------------------------------------------------------------------------

/** Render the selection bar (visible when assets are multi-selected). */
function renderSelectionBar(): void {
  if (multiSelected.size === 0) {
    selectionBar.hidden = true;
    return;
  }

  selectionBar.hidden = false;
  selectionBar.innerHTML = "";

  // Count label
  const count = document.createElement("span");
  count.className = "assets-selection-count";
  count.textContent = `${multiSelected.size} selected`;
  selectionBar.appendChild(count);

  // Category dropdown for bulk assignment
  const { assetCategories } = getState();
  const catSelect = document.createElement("select");
  catSelect.className = "assets-select";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Set category\u2026";
  placeholder.disabled = true;
  placeholder.selected = true;
  catSelect.appendChild(placeholder);
  for (const cat of assetCategories) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    catSelect.appendChild(opt);
  }
  const noneOpt = document.createElement("option");
  noneOpt.value = "__none__";
  noneOpt.textContent = "(remove)";
  catSelect.appendChild(noneOpt);
  catSelect.addEventListener("change", () => {
    const val = catSelect.value;
    if (val === "__none__") {
      assignCategory([...multiSelected], null);
    } else if (val) {
      assignCategory([...multiSelected], val);
    }
  });
  selectionBar.appendChild(catSelect);

  // Clear selection button
  const clearBtn = document.createElement("button");
  clearBtn.className = "assets-selection-clear";
  clearBtn.textContent = "Clear selection";
  clearBtn.addEventListener("click", () => {
    multiSelected.clear();
    render();
  });
  selectionBar.appendChild(clearBtn);
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

/** Render the detail panel for the selected asset. */
function renderDetailPanel(): void {
  const { selectedAssetPath, assets } = getState();

  if (!selectedAssetPath) {
    detailPanel.hidden = true;
    return;
  }

  const asset = assets.find((a) => a.path === selectedAssetPath);
  if (!asset) {
    detailPanel.hidden = true;
    return;
  }

  detailPanel.hidden = false;
  detailPanel.innerHTML = "";

  // Header
  const header = document.createElement("div");
  header.className = "assets-detail-header";
  const h3 = document.createElement("h3");
  h3.textContent = "Detail";
  header.appendChild(h3);
  const closeBtn = document.createElement("button");
  closeBtn.className = "assets-detail-close";
  closeBtn.textContent = "\u00D7";
  closeBtn.addEventListener("click", () => {
    updateState({ selectedAssetPath: null });
  });
  header.appendChild(closeBtn);
  detailPanel.appendChild(header);

  // Preview image
  const previewImg = document.createElement("img");
  previewImg.className = "assets-detail-preview";
  previewImg.src = asset.objectUrl;
  previewImg.alt = asset.name;
  detailPanel.appendChild(previewImg);

  // Info section
  const info = document.createElement("div");
  info.className = "assets-detail-info";

  const addRow = (label: string, value: string): void => {
    const row = document.createElement("div");
    row.className = "assets-detail-row";
    const lbl = document.createElement("span");
    lbl.className = "assets-detail-label";
    lbl.textContent = label;
    const val = document.createElement("span");
    val.className = "assets-detail-value";
    val.textContent = value;
    val.title = value;
    row.appendChild(lbl);
    row.appendChild(val);
    info.appendChild(row);
  };

  addRow("Filename", asset.name);
  addRow("Path", asset.path);
  addRow("Size", formatSize(asset.file.size));

  // Dimensions (async)
  const dimsRow = document.createElement("div");
  dimsRow.className = "assets-detail-row";
  const dimsLabel = document.createElement("span");
  dimsLabel.className = "assets-detail-label";
  dimsLabel.textContent = "Dimensions";
  const dimsValue = document.createElement("span");
  dimsValue.className = "assets-detail-value";
  dimsValue.textContent = "...";
  dimsRow.appendChild(dimsLabel);
  dimsRow.appendChild(dimsValue);
  info.appendChild(dimsRow);
  void getDimensions(asset).then((dims) => {
    dimsValue.textContent = dims.w > 0 ? `${dims.w} \u00D7 ${dims.h} px` : "unknown";
  });

  // Category (editable dropdown)
  const catRow = document.createElement("div");
  catRow.className = "assets-detail-row";
  const catLabel = document.createElement("span");
  catLabel.className = "assets-detail-label";
  catLabel.textContent = "Category";
  catRow.appendChild(catLabel);

  const catSelect = document.createElement("select");
  catSelect.className = "assets-select";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "(none)";
  catSelect.appendChild(noneOpt);
  for (const cat of getState().assetCategories) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    if (asset.category === cat) opt.selected = true;
    catSelect.appendChild(opt);
  }
  catSelect.addEventListener("change", () => {
    assignCategory([asset.path], catSelect.value || null);
  });
  catRow.appendChild(catSelect);
  info.appendChild(catRow);

  detailPanel.appendChild(info);

  // "Used by" section
  const usages = findUsages(asset.path);
  if (usages.length > 0) {
    const section = document.createElement("div");
    section.className = "assets-detail-section";
    const h4 = document.createElement("h4");
    h4.textContent = "Used by";
    section.appendChild(h4);
    for (const usage of usages) {
      const item = document.createElement("div");
      item.className = "assets-detail-used-item";
      item.textContent = usage;
      section.appendChild(item);
    }
    detailPanel.appendChild(section);
  }
}

// ---------------------------------------------------------------------------
// Grid view render
// ---------------------------------------------------------------------------

/** Render the asset grid view. */
function renderGridView(sorted: AssetFile[]): void {
  const { selectedAssetPath, assetThumbSize } = getState();

  grid.innerHTML = "";
  grid.hidden = false;
  listEl.hidden = true;

  // Set CSS custom property for grid sizing
  const colSize = assetThumbSize + 24; // padding
  grid.style.setProperty("--thumb-size-col", `${colSize}px`);

  for (let i = 0; i < sorted.length; i++) {
    const asset = sorted[i]!;
    const item = document.createElement("div");
    item.className = "assets-grid-item";
    if (asset.path === selectedAssetPath) {
      item.classList.add("selected");
    }
    if (multiSelected.has(asset.path)) {
      item.classList.add("multi-selected");
    }

    // Draggable for scene editor + category assignment
    item.draggable = true;
    item.dataset["assetPath"] = asset.path;
    item.addEventListener("dragstart", (e) => {
      // Carry all selected paths if this item is part of multi-selection
      const paths = multiSelected.size > 0 && multiSelected.has(asset.path)
        ? [...multiSelected]
        : [asset.path];
      e.dataTransfer?.setData("text/plain", asset.path);
      e.dataTransfer?.setData("application/x-sajou-asset", asset.path);
      e.dataTransfer?.setData("application/x-sajou-asset-paths", JSON.stringify(paths));
    });

    const thumb = document.createElement("img");
    thumb.className = "assets-grid-thumb";
    thumb.src = asset.objectUrl;
    thumb.alt = asset.name;
    thumb.loading = "lazy";
    thumb.style.width = `${assetThumbSize}px`;
    thumb.style.height = `${assetThumbSize}px`;

    const name = document.createElement("span");
    name.className = "assets-grid-name";
    name.textContent = asset.name;
    name.title = asset.path;

    item.appendChild(thumb);
    item.appendChild(name);

    // Category badge
    if (asset.category) {
      const badge = document.createElement("span");
      badge.className = "assets-grid-badge";
      badge.textContent = asset.category;
      item.appendChild(badge);
    }

    // Click handler (with multi-select support)
    const idx = i;
    item.addEventListener("click", (e) => {
      handleAssetClick(asset.path, idx, sorted, e);
    });

    // Context menu
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const targets = multiSelected.size > 0 && multiSelected.has(asset.path)
        ? [...multiSelected]
        : [asset.path];
      showContextMenu(e.clientX, e.clientY, targets);
    });

    grid.appendChild(item);
  }
}

// ---------------------------------------------------------------------------
// List view render
// ---------------------------------------------------------------------------

/** Render the asset list view. */
function renderListView(sorted: AssetFile[]): void {
  const { selectedAssetPath } = getState();

  grid.hidden = true;
  listEl.hidden = false;
  listEl.innerHTML = "";

  // Header row
  const header = document.createElement("div");
  header.className = "assets-list-header";
  const columns: Array<{ key: typeof sortColumn; label: string }> = [
    { key: "name", label: "" }, // thumbnail column
    { key: "name", label: "Name" },
    { key: "path", label: "Path" },
    { key: "dims", label: "Dims" },
    { key: "size", label: "Size" },
    { key: "category", label: "Cat." },
  ];

  for (const col of columns) {
    const cell = document.createElement("span");
    cell.className = "assets-list-header-cell";
    if (col.label && sortColumn === col.key) {
      cell.classList.add("sorted");
      cell.textContent = `${col.label} ${sortAsc ? "\u25B2" : "\u25BC"}`;
    } else {
      cell.textContent = col.label;
    }
    if (col.label) {
      cell.addEventListener("click", () => {
        if (sortColumn === col.key) {
          sortAsc = !sortAsc;
        } else {
          sortColumn = col.key;
          sortAsc = true;
        }
        render();
      });
    }
    header.appendChild(cell);
  }
  listEl.appendChild(header);

  // Apply sort
  const listSorted = sortListAssets(sorted);

  // Rows
  for (let i = 0; i < listSorted.length; i++) {
    const asset = listSorted[i]!;
    const row = document.createElement("div");
    row.className = "assets-list-row";
    if (asset.path === selectedAssetPath) row.classList.add("selected");
    if (multiSelected.has(asset.path)) row.classList.add("multi-selected");

    // Draggable for category drag-drop
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      const paths = multiSelected.size > 0 && multiSelected.has(asset.path)
        ? [...multiSelected]
        : [asset.path];
      e.dataTransfer?.setData("text/plain", asset.path);
      e.dataTransfer?.setData("application/x-sajou-asset", asset.path);
      e.dataTransfer?.setData("application/x-sajou-asset-paths", JSON.stringify(paths));
    });

    // Thumbnail
    const thumb = document.createElement("img");
    thumb.className = "assets-list-thumb";
    thumb.src = asset.objectUrl;
    thumb.alt = asset.name;
    thumb.loading = "lazy";
    row.appendChild(thumb);

    // Name
    const nameCell = document.createElement("span");
    nameCell.className = "assets-list-cell";
    nameCell.textContent = asset.name;
    nameCell.title = asset.name;
    row.appendChild(nameCell);

    // Path
    const pathCell = document.createElement("span");
    pathCell.className = "assets-list-cell";
    pathCell.textContent = asset.path;
    pathCell.title = asset.path;
    row.appendChild(pathCell);

    // Dimensions (populated async)
    const dimsCell = document.createElement("span");
    dimsCell.className = "assets-list-cell";
    dimsCell.textContent = "...";
    row.appendChild(dimsCell);
    void getDimensions(asset).then((dims) => {
      dimsCell.textContent = dims.w > 0 ? `${dims.w}\u00D7${dims.h}` : "-";
    });

    // Size
    const sizeCell = document.createElement("span");
    sizeCell.className = "assets-list-cell";
    sizeCell.textContent = formatSize(asset.file.size);
    row.appendChild(sizeCell);

    // Category
    const catCell = document.createElement("span");
    catCell.className = "assets-list-cell";
    catCell.textContent = asset.category ?? "-";
    row.appendChild(catCell);

    // Click
    const idx = i;
    row.addEventListener("click", (e) => {
      handleAssetClick(asset.path, idx, listSorted, e);
    });

    // Context menu
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const targets = multiSelected.size > 0 && multiSelected.has(asset.path)
        ? [...multiSelected]
        : [asset.path];
      showContextMenu(e.clientX, e.clientY, targets);
    });

    listEl.appendChild(row);
  }
}

/** Sort assets for list view based on current sort column. */
function sortListAssets(assets: AssetFile[]): AssetFile[] {
  const dir = sortAsc ? 1 : -1;
  return [...assets].sort((a, b) => {
    switch (sortColumn) {
      case "name":
        return a.name.localeCompare(b.name) * dir;
      case "path":
        return a.path.localeCompare(b.path) * dir;
      case "size":
        return (a.file.size - b.file.size) * dir;
      case "category":
        return (a.category ?? "").localeCompare(b.category ?? "") * dir;
      case "dims":
        // Dims sort uses cached values (sync). Uncached items sort last.
        {
          const da = dimensionCache.get(a.path);
          const db = dimensionCache.get(b.path);
          const va = da ? da.w * da.h : -1;
          const vb = db ? db.w * db.h : -1;
          return (va - vb) * dir;
        }
      default:
        return 0;
    }
  });
}

// ---------------------------------------------------------------------------
// Click handling (multi-select)
// ---------------------------------------------------------------------------

/** Handle asset click with shift/ctrl multi-select. */
function handleAssetClick(
  path: string,
  index: number,
  sortedList: AssetFile[],
  e: MouseEvent,
): void {
  if (e.shiftKey && lastClickedIndex >= 0) {
    // Range selection
    const start = Math.min(lastClickedIndex, index);
    const end = Math.max(lastClickedIndex, index);
    if (!e.ctrlKey && !e.metaKey) {
      multiSelected.clear();
    }
    for (let i = start; i <= end; i++) {
      multiSelected.add(sortedList[i]!.path);
    }
    updateState({ selectedAssetPath: path });
  } else if (e.ctrlKey || e.metaKey) {
    // Toggle selection
    if (multiSelected.has(path)) {
      multiSelected.delete(path);
    } else {
      multiSelected.add(path);
    }
    lastClickedIndex = index;
    updateState({ selectedAssetPath: path });
  } else {
    // Normal click
    multiSelected.clear();
    lastClickedIndex = index;
    updateState({ selectedAssetPath: path });
  }
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

/** Main render function for the assets tab. */
function render(): void {
  const { assets, assetViewMode } = getState();

  if (assets.length === 0) {
    dropZone.hidden = false;
    grid.hidden = true;
    listEl.hidden = true;
    detailPanel.hidden = true;
    categoryBar.hidden = true;
    selectionBar.hidden = true;
    return;
  }

  dropZone.hidden = true;

  const filtered = getFilteredAssets();

  // Render category bar + filter dropdown + selection bar
  renderCategoryBar();
  updateCategoryFilterOptions();
  renderSelectionBar();

  // Render appropriate view
  if (assetViewMode === "list") {
    renderListView(filtered);
  } else {
    renderGridView(filtered);
  }

  // Render detail panel
  renderDetailPanel();

  // Update view toggle button states
  btnViewGrid.classList.toggle("active", assetViewMode === "grid");
  btnViewList.classList.toggle("active", assetViewMode === "list");

  // Hide thumb slider in list mode (only relevant to grid)
  thumbSlider.style.display = assetViewMode === "list" ? "none" : "";
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Handle dropped files/folders on the assets tab. */
async function handleDrop(e: DragEvent): Promise<void> {
  e.preventDefault();
  dropZone.classList.remove("drag-over");

  if (!e.dataTransfer) return;

  const items = e.dataTransfer.items;
  const allAssets: AssetFile[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      const results = await scanDirectory(
        entry as FileSystemDirectoryEntry,
        entry.name,
      );
      allAssets.push(...results);
    } else if (entry?.isFile && isImageFile(entry.name)) {
      const file = await new Promise<File>((resolve) => {
        (entry as FileSystemFileEntry).file(resolve);
      });
      allAssets.push({
        path: entry.name,
        name: entry.name,
        objectUrl: URL.createObjectURL(file),
        file,
        category: null,
      });
    }
  }

  mergeAssets(allAssets);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the assets tab. */
export function initAssetsTab(): void {
  // Search input
  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value.toLowerCase().trim();
    render();
  });

  // Category filter dropdown
  categoryFilter.addEventListener("change", () => {
    updateState({
      assetCategoryFilter: categoryFilter.value || null,
    });
  });

  // Thumbnail size slider
  thumbSlider.addEventListener("input", () => {
    updateState({ assetThumbSize: parseInt(thumbSlider.value, 10) });
  });

  // View mode toggle buttons
  btnViewGrid.addEventListener("click", () => {
    updateState({ assetViewMode: "grid" });
  });
  btnViewList.addEventListener("click", () => {
    updateState({ assetViewMode: "list" });
  });

  // Drop zone events
  const section = document.getElementById("section-assets")!;

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });
  dropZone.addEventListener("drop", (e) => {
    void handleDrop(e);
  });

  // Allow drop anywhere in the section
  section.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  section.addEventListener("dragleave", (e) => {
    if (!section.contains(e.relatedTarget as Node)) {
      dropZone.classList.remove("drag-over");
    }
  });
  section.addEventListener("drop", (e) => {
    void handleDrop(e);
  });

  // File picker button
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.className = "hidden-input";
  fileInput.setAttribute("webkitdirectory", "");
  fileInput.multiple = true;
  document.body.appendChild(fileInput);

  btnPick.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length > 0) {
      mergeAssets(scanFileList(fileInput.files));
      fileInput.value = "";
    }
  });

  // Close context menu on click outside / Escape
  document.addEventListener("click", (e) => {
    if (contextMenuEl && !contextMenuEl.contains(e.target as Node)) {
      closeContextMenu();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeContextMenu();
    }
  });

  // Sync thumb slider from state
  thumbSlider.value = String(getState().assetThumbSize);

  subscribe(render);
  render();
}
