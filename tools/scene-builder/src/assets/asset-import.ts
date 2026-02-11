/**
 * Asset import module.
 *
 * Handles file scanning from drag & drop and file picker,
 * format detection, dimension caching, GIF frame counting,
 * and spritesheet grid auto-detection.
 */

import type { AssetFile, AssetFormat } from "../types.js";
import { detectSpritesheetGrid } from "./spritesheet-detect.js";

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
// Image loading & dimension detection
// ---------------------------------------------------------------------------

/** Load an HTMLImageElement from an object URL. Returns null on error. */
export function loadImageElement(objectUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = objectUrl;
  });
}

// ---------------------------------------------------------------------------
// GIF frame count detection
// ---------------------------------------------------------------------------

/**
 * Extract metadata from an animated GIF using gifuct-js.
 *
 * Returns frame count and average FPS derived from frame delays.
 * Falls back to { frameCount: 1, fps: 10 } on error.
 */
export async function detectGifMetadata(file: File): Promise<{ frameCount: number; fps: number }> {
  try {
    const { parseGIF, decompressFrames } = await import("gifuct-js");
    const buffer = await file.arrayBuffer();
    const gif = parseGIF(buffer);
    // Pass false to skip building pixel patches (faster)
    const frames = decompressFrames(gif, false);
    const frameCount = Math.max(1, frames.length);
    // delay is in centiseconds (1/100th of a second)
    const totalDelay = frames.reduce((sum, f) => sum + (f.delay || 10), 0);
    const avgDelayCentis = totalDelay / frameCount;
    const fps = Math.round(100 / Math.max(1, avgDelayCentis));
    return { frameCount, fps };
  } catch {
    return { frameCount: 1, fps: 10 };
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
 * Enrich an AssetFile with dimensions, GIF metadata, and spritesheet hints.
 * Mutates the asset in-place for performance.
 */
export async function enrichAssetMetadata(asset: AssetFile): Promise<void> {
  const img = await loadImageElement(asset.objectUrl);
  asset.naturalWidth = img?.naturalWidth ?? 0;
  asset.naturalHeight = img?.naturalHeight ?? 0;

  // GIF metadata: frame count + native FPS
  if (asset.format === "gif") {
    const meta = await detectGifMetadata(asset.file);
    asset.frameCount = meta.frameCount;
    asset.detectedFps = meta.fps;
  }

  // Spritesheet auto-detection for formats with alpha
  if (img && (asset.format === "png" || asset.format === "webp")) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w >= 64 && h >= 32) {
      const hint = detectSpritesheetGrid(img, asset.name);
      if (hint) {
        asset.spritesheetHint = hint;
      }
    }
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
