/**
 * Scene import module.
 *
 * Opens a file picker for a ZIP archive, displays a selection dialog,
 * and selectively restores stores based on the user's choices.
 * Clears undo history to prevent stale references.
 *
 * 4-phase flow:
 *   1. pickZipFile()       — file picker
 *   2. parseZip()          — parse all sections + count
 *   3. showImportDialog()  — user selects sections
 *   4. applyImport()       — selective reset + populate
 *
 * Expected ZIP structure:
 *   scene.json            — scene layout
 *   entities.json         — entity definitions
 *   choreographies.json   — choreography definitions + wire connections (optional, backward-compat)
 *   shaders.json          — shader definitions (optional)
 *   assets/               — image files
 */

import { unzipSync, strFromU8 } from "fflate";
import { getSceneState, setSceneState, resetSceneState } from "../state/scene-state.js";
import { setEntity, resetEntities } from "../state/entity-store.js";
import { addAssets, addCategory, resetAssets } from "../state/asset-store.js";
import { setChoreographyState, resetChoreographyState } from "../state/choreography-state.js";
import { setWiringState, resetWiringState } from "../state/wiring-state.js";
import { setBindingState, resetBindingState } from "../state/binding-store.js";
import { clearHistory } from "../state/undo.js";
import { forcePersistAll } from "../state/persistence.js";
import { autoWireConnectedSources } from "../state/auto-wire.js";
import { setShaderState, resetShaderState } from "../shader-editor/shader-state.js";
import { showImportDialog } from "./import-dialog.js";
import type { ImportSelection, ZipSummary } from "./import-dialog.js";
import type { ShaderEditorState } from "../shader-editor/shader-types.js";
import type {
  SceneState,
  EntityEntry,
  AssetFile,
  AssetFormat,
  ChoreographyDef,
  EntityBinding,
  LightingState,
  ParticleEmitterState,
} from "../types.js";
import { createDefaultLighting } from "../state/scene-state.js";
import type { WireConnection } from "../state/wiring-state.js";

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
  /** Optional — older exports may lack zone data. */
  zoneTypes?: SceneState["zoneTypes"];
  /** Optional — older exports may lack zone data. */
  zoneGrid?: SceneState["zoneGrid"];
  /** Optional — older exports may lack lighting data. */
  lighting?: LightingState;
  /** Optional — older exports may lack particle data. */
  particles?: ParticleEmitterState[];
}

interface EntityExportJson {
  version: number;
  entities: Record<string, EntityEntry>;
}

interface ChoreographyExportJson {
  version: number;
  choreographies: ChoreographyDef[];
  wires: WireConnection[];
  bindings?: EntityBinding[];
}

/** All parsed contents from a ZIP archive. */
interface ZipContents {
  sceneJson: SceneExportJson;
  entitiesJson: EntityExportJson;
  choreoJson: ChoreographyExportJson | null;
  shaderDefs: ShaderEditorState["shaders"] | null;
  assetFiles: AssetFile[];
  summary: ZipSummary;
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
 * Parse choreographies.json from ZIP. Returns null if absent (backward-compat).
 */
function parseChoreoJson(data: Uint8Array | undefined): ChoreographyExportJson | null {
  if (!data) return null;
  const text = strFromU8(data);
  const parsed: unknown = JSON.parse(text);

  if (
    typeof parsed !== "object" || parsed === null ||
    !("choreographies" in parsed)
  ) {
    return null; // Malformed — skip silently
  }

  return parsed as ChoreographyExportJson;
}

/**
 * Parse shaders.json from ZIP. Returns null if absent (backward-compat).
 */
function parseShaderJson(data: Uint8Array | undefined): ShaderEditorState["shaders"] | null {
  if (!data) return null;
  const text = strFromU8(data);
  const parsed: unknown = JSON.parse(text);

  if (
    typeof parsed !== "object" || parsed === null ||
    !("shaders" in parsed)
  ) {
    return null; // Malformed — skip silently
  }

  return (parsed as { shaders: ShaderEditorState["shaders"] }).shaders;
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
// Phase 2 — Parse ZIP contents
// ---------------------------------------------------------------------------

/** Parse a ZIP file into structured contents with summary counts. */
function parseZip(zipEntries: Record<string, Uint8Array>): ZipContents {
  const sceneData = zipEntries["scene.json"];
  const entitiesData = zipEntries["entities.json"];

  if (!sceneData) {
    throw new Error("Invalid scene ZIP: missing scene.json");
  }
  if (!entitiesData) {
    throw new Error("Invalid scene ZIP: missing entities.json");
  }

  const sceneJson = parseSceneJson(sceneData);
  const entitiesJson = parseEntitiesJson(entitiesData);
  const choreoJson = parseChoreoJson(zipEntries["choreographies.json"]);
  const shaderDefs = parseShaderJson(zipEntries["shaders.json"]);
  const assetFiles = extractAssets(zipEntries);

  const summary: ZipSummary = {
    entityPlacements: sceneJson.entities.length,
    entityDefinitions: Object.keys(entitiesJson.entities).length,
    assetFiles: assetFiles.length,
    choreographies: choreoJson?.choreographies.length ?? 0,
    wires: choreoJson?.wires.length ?? 0,
    bindings: choreoJson?.bindings?.length ?? 0,
    shaders: shaderDefs?.length ?? 0,
  };

  return { sceneJson, entitiesJson, choreoJson, shaderDefs, assetFiles, summary };
}

// ---------------------------------------------------------------------------
// Phase 4 — Apply import (selective)
// ---------------------------------------------------------------------------

/** Apply parsed ZIP contents to stores based on the user's selection. */
async function applyImport(contents: ZipContents, selection: ImportSelection): Promise<void> {
  const { sceneJson, entitiesJson, choreoJson, shaderDefs, assetFiles } = contents;

  // Reset only the selected sections
  if (selection.entitiesAndAssets) {
    resetAssets();
    resetEntities();
  }
  if (selection.visualLayout) {
    resetSceneState();
  }
  if (selection.choreographiesAndWiring) {
    resetChoreographyState();
    resetWiringState();
    resetBindingState();
  }
  if (selection.shaders) {
    resetShaderState();
  }

  clearHistory();

  // --- Populate selected sections ---

  // Entities & Assets
  if (selection.entitiesAndAssets) {
    addAssets(assetFiles);

    const categories = new Set(assetFiles.map((a) => a.category).filter(Boolean));
    for (const cat of categories) {
      addCategory(cat);
    }

    for (const [id, entry] of Object.entries(entitiesJson.entities)) {
      setEntity(id, entry);
    }
  }

  // Visual layout
  if (selection.visualLayout) {
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
      zoneTypes: sceneJson.zoneTypes ?? getSceneState().zoneTypes,
      zoneGrid: sceneJson.zoneGrid ?? getSceneState().zoneGrid,
      lighting: sceneJson.lighting ?? createDefaultLighting(),
      particles: sceneJson.particles ?? [],
    });
  }

  // Choreographies + wires + bindings
  if (selection.choreographiesAndWiring && choreoJson) {
    setChoreographyState({
      choreographies: choreoJson.choreographies ?? [],
      selectedChoreographyId: null,
      selectedStepId: null,
    });
    // Filter out signal→signal-type wires — sources are session-ephemeral
    // and not included in exports, so these wires would be orphaned.
    // Auto-wire will re-create them for connected sources.
    const persistentWires = (choreoJson.wires ?? []).filter(
      (w) => w.fromZone !== "signal",
    );
    setWiringState({
      wires: persistentWires,
      draggingWireId: null,
    });
    if (choreoJson.bindings && choreoJson.bindings.length > 0) {
      setBindingState({ bindings: choreoJson.bindings });
    }
  }

  // Shaders
  if (selection.shaders && shaderDefs && shaderDefs.length > 0) {
    setShaderState({
      shaders: shaderDefs,
      selectedShaderId: shaderDefs[0].id,
      activeMode: "glsl",
      playing: true,
    });
  }

  // Persist imported state immediately so it survives a page reload
  await forcePersistAll();

  // Auto-wire connected sources to imported choreography signal types
  autoWireConnectedSources();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import a scene from a ZIP file.
 *
 * 4-phase flow:
 *   1. File picker
 *   2. Parse all sections + summary counts
 *   3. Import selection dialog
 *   4. Selective apply + auto-wire
 */
export async function importScene(): Promise<void> {
  // Phase 1 — File picker
  const file = await pickZipFile();
  if (!file) return;

  // Phase 2 — Parse ZIP
  const buffer = await file.arrayBuffer();
  const zipEntries = unzipSync(new Uint8Array(buffer));
  const contents = parseZip(zipEntries);

  // Phase 3 — Import selection dialog
  const selection = await showImportDialog(contents.summary);
  if (!selection) return; // User cancelled

  // Phase 4 — Apply
  await applyImport(contents, selection);
}
