/**
 * Scene import module.
 *
 * Opens a file picker for a ZIP archive, parses its contents,
 * and restores all three stores (scene-state, entity-store, asset-store).
 * Clears undo history to prevent stale references.
 *
 * Expected ZIP structure:
 *   scene.json      — scene layout
 *   entities.json   — entity definitions
 *   assets/         — image files
 */

import { unzipSync, strFromU8 } from "fflate";
import { setSceneState, resetSceneState } from "../state/scene-state.js";
import { setEntity, resetEntities } from "../state/entity-store.js";
import { addAssets, addCategory, resetAssets } from "../state/asset-store.js";
import { clearHistory } from "../state/undo.js";
import type {
  SceneState,
  EntityEntry,
  AssetFile,
  AssetFormat,
} from "../types.js";

// ---------------------------------------------------------------------------
// Import JSON types (match export format)
// ---------------------------------------------------------------------------

interface SceneExportJson {
  version: number;
  dimensions: SceneState["dimensions"];
  background: SceneState["background"];
  layers: SceneState["layers"];
  entities: SceneState["entities"];
  positions: SceneState["positions"];
  routes: SceneState["routes"];
}

interface EntityExportJson {
  version: number;
  entities: Record<string, EntityEntry>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Open a file picker constrained to .zip files. Returns null if cancelled. */
function pickZipFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip";
    input.style.display = "none";

    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      document.body.removeChild(input);
      resolve(file);
    });

    input.addEventListener("cancel", () => {
      document.body.removeChild(input);
      resolve(null);
    });

    document.body.appendChild(input);
    input.click();
  });
}

/** Detect asset format from filename extension. */
function detectFormat(filename: string): AssetFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".svg")) return "svg";
  if (lower.endsWith(".webp")) return "webp";
  if (lower.endsWith(".gif")) return "gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpeg";
  return "unknown";
}

/** Get MIME type for an asset file extension. */
function mimeTypeForExtension(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

/**
 * Parse and validate scene.json from ZIP.
 * Throws if JSON is malformed or missing required fields.
 */
function parseSceneJson(data: Uint8Array): SceneExportJson {
  const text = strFromU8(data);
  const parsed: unknown = JSON.parse(text);

  if (
    typeof parsed !== "object" || parsed === null ||
    !("dimensions" in parsed) ||
    !("layers" in parsed) ||
    !("entities" in parsed)
  ) {
    throw new Error("Invalid scene.json: missing required fields (dimensions, layers, entities)");
  }

  return parsed as SceneExportJson;
}

/**
 * Parse and validate entities.json from ZIP.
 * Throws if JSON is malformed or missing required fields.
 */
function parseEntitiesJson(data: Uint8Array): EntityExportJson {
  const text = strFromU8(data);
  const parsed: unknown = JSON.parse(text);

  if (
    typeof parsed !== "object" || parsed === null ||
    !("entities" in parsed)
  ) {
    throw new Error("Invalid entities.json: missing required field (entities)");
  }

  return parsed as EntityExportJson;
}

/**
 * Extract asset files from ZIP entries under assets/.
 * Creates File objects and object URLs for each image file.
 */
function extractAssets(
  zipEntries: Record<string, Uint8Array>,
): AssetFile[] {
  const results: AssetFile[] = [];

  for (const [path, data] of Object.entries(zipEntries)) {
    // Only process files under assets/
    if (!path.startsWith("assets/")) continue;

    // Skip empty entries (directories)
    if (data.length === 0) continue;

    const filename = path.split("/").pop() ?? path;
    const format = detectFormat(filename);

    // Skip non-image files
    if (format === "unknown") continue;

    const mime = mimeTypeForExtension(filename);
    // Copy into a plain ArrayBuffer so TS accepts it as BlobPart (TS 5.7+ Uint8Array generics)
    const bytes = new Uint8Array(data);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime });
    const file = new File([blob], filename, { type: mime });
    const objectUrl = URL.createObjectURL(blob);

    // Derive category from subfolder: "assets/spritesheets/x.png" → "spritesheets"
    const segments = path.split("/");
    const category = segments.length >= 3 ? segments[1] : "";

    results.push({
      path,
      name: filename,
      objectUrl,
      file,
      category,
      format,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import a scene from a ZIP file.
 *
 * Opens a file picker, reads the ZIP, and replaces the current
 * scene state, entity definitions, and assets with the imported data.
 * Clears undo/redo history.
 */
export async function importScene(): Promise<void> {
  const file = await pickZipFile();
  if (!file) return; // User cancelled

  const buffer = await file.arrayBuffer();
  const zipEntries = unzipSync(new Uint8Array(buffer));

  // Validate required files
  const sceneData = zipEntries["scene.json"];
  const entitiesData = zipEntries["entities.json"];

  if (!sceneData) {
    throw new Error("Invalid scene ZIP: missing scene.json");
  }
  if (!entitiesData) {
    throw new Error("Invalid scene ZIP: missing entities.json");
  }

  // Parse JSON files
  const sceneJson = parseSceneJson(sceneData);
  const entitiesJson = parseEntitiesJson(entitiesData);

  // Extract asset files
  const assetFiles = extractAssets(zipEntries);

  // --- Reset all stores ---
  resetAssets();
  resetEntities();
  resetSceneState();
  clearHistory();

  // --- Populate stores ---

  // 1. Assets
  addAssets(assetFiles);

  // Add categories derived from asset subfolders
  const categories = new Set(assetFiles.map((a) => a.category).filter(Boolean));
  for (const cat of categories) {
    addCategory(cat);
  }

  // 2. Entity definitions
  for (const [id, entry] of Object.entries(entitiesJson.entities)) {
    setEntity(id, entry);
  }

  // 3. Scene state
  setSceneState({
    dimensions: sceneJson.dimensions,
    background: sceneJson.background,
    layers: sceneJson.layers,
    // Backward-compat: old scenes may lack per-placement zIndex
    entities: sceneJson.entities.map((e, i) => ({
      ...e,
      zIndex: (e as { zIndex?: number }).zIndex ?? i,
    })),
    positions: sceneJson.positions ?? [],
    routes: sceneJson.routes ?? [],
  });
}
