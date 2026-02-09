/**
 * Asset import module.
 *
 * Handles file scanning from drag & drop and file picker,
 * format detection, dimension caching, and GIF frame counting.
 * Ported from entity-editor/src/assets/assets-tab.ts with
 * GIF support and enhanced metadata.
 */

import type { AssetFile, AssetFormat } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS: Record<string, AssetFormat> = {
  ".png": "png",
  ".svg": "svg",
  ".webp": "webp",
  ".gif": "gif",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
};

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

/** Detect asset format from filename extension. */
export function detectFormat(name: string): AssetFormat {
  const lower = name.toLowerCase();
  for (const [ext, format] of Object.entries(IMAGE_EXTENSIONS)) {
    if (lower.endsWith(ext)) return format;
  }
  return "unknown";
}

/** Check if a filename is a supported image. */
export function isImageFile(name: string): boolean {
  return detectFormat(name) !== "unknown";
}

// ---------------------------------------------------------------------------
// Dimension detection
// ---------------------------------------------------------------------------

/** Load natural dimensions of an image from its object URL. */
export function detectDimensions(
  objectUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
    };
    img.src = objectUrl;
  });
}

// ---------------------------------------------------------------------------
// GIF frame count detection
// ---------------------------------------------------------------------------

/**
 * Count frames in an animated GIF using gifuct-js.
 * Returns 1 for static GIFs or if detection fails.
 */
export async function detectGifFrameCount(file: File): Promise<number> {
  try {
    const { parseGIF, decompressFrames } = await import("gifuct-js");
    const buffer = await file.arrayBuffer();
    const gif = parseGIF(buffer);
    const frames = decompressFrames(gif, true);
    return Math.max(1, frames.length);
  } catch {
    return 1;
  }
}

// ---------------------------------------------------------------------------
// File creation helper
// ---------------------------------------------------------------------------

/** Create an AssetFile from a File object. */
function createAssetFile(file: File, path: string, category: string): AssetFile {
  const format = detectFormat(file.name);
  return {
    path,
    name: file.name,
    objectUrl: URL.createObjectURL(file),
    file,
    category,
    format,
  };
}

/**
 * Enrich an AssetFile with dimensions and (for GIFs) frame count.
 * Mutates the asset in-place for performance.
 */
export async function enrichAssetMetadata(asset: AssetFile): Promise<void> {
  const dims = await detectDimensions(asset.objectUrl);
  asset.naturalWidth = dims.width;
  asset.naturalHeight = dims.height;

  if (asset.format === "gif") {
    asset.frameCount = await detectGifFrameCount(asset.file);
  }
}

// ---------------------------------------------------------------------------
// Directory scanning (FileSystemEntry API)
// ---------------------------------------------------------------------------

/** Recursively read all image files from a FileSystemDirectoryEntry. */
export async function scanDirectory(
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
      // Derive category from top-level folder name
      const category = basePath.split("/")[0] ?? "";
      results.push(createAssetFile(file, path, category));
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

// ---------------------------------------------------------------------------
// Public import functions
// ---------------------------------------------------------------------------

/** Import files from a FileList (flat file picker result). */
export function importFiles(files: FileList): AssetFile[] {
  const results: AssetFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    if (!isImageFile(file.name)) continue;
    const path = file.webkitRelativePath || file.name;
    const category = file.webkitRelativePath
      ? file.webkitRelativePath.split("/")[0] ?? ""
      : "";
    results.push(createAssetFile(file, path, category));
  }
  return results;
}

/** Import files/folders from a drag & drop DataTransferItemList. */
export async function importDroppedItems(
  items: DataTransferItemList,
): Promise<AssetFile[]> {
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
      allAssets.push(createAssetFile(file, entry.name, ""));
    }
  }

  return allAssets;
}
