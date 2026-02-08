/**
 * Asset browser module.
 *
 * Handles drag & drop of asset folders, file picker, recursive scanning
 * for PNG/SVG files, and displays a file tree with thumbnails.
 * Clicking an asset selects it for binding to an entity state.
 */

import {
  getState,
  updateState,
  subscribe,
} from "./app-state.js";
import type { AssetFile } from "./app-state.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const dropZone = document.getElementById("asset-drop-zone")!;
const assetTree = document.getElementById("asset-tree")!;
const btnPickFiles = document.getElementById("btn-pick-files")!;

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = new Set([".png", ".svg", ".jpg", ".jpeg", ".webp"]);

/** Check if a filename is an image we support. */
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

    // webkitRelativePath gives the folder-relative path
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

// ---------------------------------------------------------------------------
// Tree rendering
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  asset?: AssetFile;
}

/** Build a tree structure from flat file paths. */
function buildTree(assets: AssetFile[]): TreeNode {
  const root: TreeNode = { name: "", children: new Map() };

  for (const asset of assets) {
    const parts = asset.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, children: new Map() });
      }
      node = node.children.get(part)!;
    }
    const fileName = parts[parts.length - 1]!;
    node.children.set(fileName, {
      name: fileName,
      children: new Map(),
      asset,
    });
  }

  return root;
}

/** Render a tree node into the DOM. */
function renderTreeNode(node: TreeNode, container: HTMLElement): void {
  // Sort: folders first, then files, both alphabetically
  const entries = [...node.children.entries()].sort(([, a], [, b]) => {
    const aIsFolder = a.children.size > 0 && !a.asset;
    const bIsFolder = b.children.size > 0 && !b.asset;
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const [, child] of entries) {
    if (child.asset) {
      // File node
      const item = document.createElement("div");
      item.className = "asset-item";
      if (getState().selectedAssetPath === child.asset.path) {
        item.classList.add("selected");
      }
      item.dataset["assetPath"] = child.asset.path;

      const thumb = document.createElement("img");
      thumb.className = "asset-thumb";
      thumb.src = child.asset.objectUrl;
      thumb.alt = child.name;
      thumb.loading = "lazy";

      const name = document.createElement("span");
      name.className = "asset-filename";
      name.textContent = child.name;

      item.appendChild(thumb);
      item.appendChild(name);

      item.addEventListener("click", () => {
        selectAsset(child.asset!.path);
      });

      container.appendChild(item);
    } else if (child.children.size > 0) {
      // Folder node
      const folder = document.createElement("div");
      folder.className = "asset-folder";

      const header = document.createElement("div");
      header.className = "asset-folder-name";

      const icon = document.createElement("span");
      icon.className = "folder-icon";
      icon.textContent = "\u25BE"; // down triangle

      const label = document.createElement("span");
      label.textContent = child.name;

      header.appendChild(icon);
      header.appendChild(label);

      const childContainer = document.createElement("div");
      childContainer.className = "asset-folder-children";

      header.addEventListener("click", () => {
        header.classList.toggle("collapsed");
        childContainer.classList.toggle("hidden");
      });

      folder.appendChild(header);
      folder.appendChild(childContainer);
      container.appendChild(folder);

      renderTreeNode(child, childContainer);
    }
  }
}

/** Select an asset in the browser and bind it to the current state if applicable. */
function selectAsset(path: string): void {
  const state = getState();

  // Bind to current state if one is selected
  if (state.selectedEntityId && state.selectedStateName) {
    const entity = state.entities[state.selectedEntityId];
    if (entity) {
      const visualState = entity.states[state.selectedStateName];
      if (visualState) {
        visualState.asset = path;
      }
    }
  }

  updateState({ selectedAssetPath: path });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Re-render the asset tree. */
function render(): void {
  const { assets } = getState();

  assetTree.innerHTML = "";

  if (assets.length === 0) {
    dropZone.hidden = false;
    return;
  }

  dropZone.hidden = true;
  const tree = buildTree(assets);
  renderTreeNode(tree, assetTree);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Handle dropped files/folders. */
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

  if (allAssets.length > 0) {
    // Merge with existing assets (don't replace)
    const existing = getState().assets;
    const existingPaths = new Set(existing.map((a) => a.path));
    const newAssets = allAssets.filter((a) => !existingPaths.has(a.path));
    updateState({ assets: [...existing, ...newAssets] });
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the asset browser module. */
export function initAssetBrowser(): void {
  // Drag & drop
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

  // Also allow drop on the whole asset panel
  const panel = document.getElementById("panel-assets")!;
  panel.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  panel.addEventListener("dragleave", (e) => {
    if (!panel.contains(e.relatedTarget as Node)) {
      dropZone.classList.remove("drag-over");
    }
  });
  panel.addEventListener("drop", (e) => {
    void handleDrop(e);
  });

  // File picker button
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.className = "hidden-input";
  fileInput.setAttribute("webkitdirectory", "");
  fileInput.multiple = true;
  document.body.appendChild(fileInput);

  btnPickFiles.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length > 0) {
      const newAssets = scanFileList(fileInput.files);
      if (newAssets.length > 0) {
        const existing = getState().assets;
        const existingPaths = new Set(existing.map((a) => a.path));
        const fresh = newAssets.filter((a) => !existingPaths.has(a.path));
        updateState({ assets: [...existing, ...fresh] });
      }
      fileInput.value = "";
    }
  });

  // Subscribe to state changes
  subscribe(render);
  render();
}
