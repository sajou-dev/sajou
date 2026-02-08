/**
 * Assets tab module.
 *
 * Full-width asset browser with grid layout, search/filter,
 * and drag & drop support. This is the standalone Assets tab
 * (not the compact sidebar used in the Entities tab).
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
const dropZone = document.getElementById("assets-drop-zone")!;
const grid = document.getElementById("assets-grid")!;
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
// Search filter
// ---------------------------------------------------------------------------

let searchTerm = "";

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Render the asset grid. */
function render(): void {
  const { assets, selectedAssetPath } = getState();

  grid.innerHTML = "";

  if (assets.length === 0) {
    dropZone.hidden = false;
    return;
  }

  dropZone.hidden = true;

  // Filter by search
  const filtered = searchTerm
    ? assets.filter((a) =>
        a.path.toLowerCase().includes(searchTerm) ||
        a.name.toLowerCase().includes(searchTerm),
      )
    : assets;

  // Sort alphabetically by path
  const sorted = [...filtered].sort((a, b) => a.path.localeCompare(b.path));

  for (const asset of sorted) {
    const item = document.createElement("div");
    item.className = "assets-grid-item";
    if (asset.path === selectedAssetPath) {
      item.classList.add("selected");
    }

    // Make draggable for scene editor
    item.draggable = true;
    item.dataset["assetPath"] = asset.path;
    item.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", asset.path);
      e.dataTransfer?.setData("application/x-sajou-asset", asset.path);
    });

    const thumb = document.createElement("img");
    thumb.className = "assets-grid-thumb";
    thumb.src = asset.objectUrl;
    thumb.alt = asset.name;
    thumb.loading = "lazy";

    const name = document.createElement("span");
    name.className = "assets-grid-name";
    name.textContent = asset.name;
    name.title = asset.path;

    item.appendChild(thumb);
    item.appendChild(name);

    item.addEventListener("click", () => {
      updateState({ selectedAssetPath: asset.path });
    });

    grid.appendChild(item);
  }
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

  subscribe(render);
  render();
}
