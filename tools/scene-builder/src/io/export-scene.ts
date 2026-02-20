/**
 * Scene export module.
 *
 * Gathers scene state, entity definitions, and referenced assets
 * into a ZIP archive (via fflate) and triggers a browser download.
 * A dialog lets the user choose which sections to include.
 *
 * ZIP structure (all sections selected):
 *   scene.json            — scene layout (dimensions, background, layers, placed entities, positions, routes)
 *   entities.json         — entity definitions (visual config, defaults, tags)
 *   choreographies.json   — choreography definitions + wire connections + bindings
 *   shaders.json          — shader definitions (optional)
 *   p5.json               — sketch definitions (optional)
 *   assets/               — referenced image files (sprites/, spritesheets/, gifs/)
 */

import { zipSync, strToU8 } from "fflate";
import { getSceneState } from "../state/scene-state.js";
import { getEntityStore } from "../state/entity-store.js";
import { getAssetStore } from "../state/asset-store.js";
import { getChoreographyState } from "../state/choreography-state.js";
import { getWiringState, type WireConnection } from "../state/wiring-state.js";
import { getBindingState } from "../state/binding-store.js";
import { getShaderState } from "../shader-editor/shader-state.js";
import type { ShaderEditorState } from "../shader-editor/shader-types.js";
import { getSketchState } from "../sketch-editor/sketch-state.js";
import type { SketchEditorState } from "../sketch-editor/sketch-types.js";
import { showExportDialog } from "./export-dialog.js";
import type { ExportSelection, ExportSummary } from "./export-dialog.js";
import type {
  SceneState,
  EntityEntry,
  EntityVisual,
  AssetFile,
  ChoreographyDef,
  EntityBinding,
} from "../types.js";

// ---------------------------------------------------------------------------
// Export JSON types (versioned for forward compat)
// ---------------------------------------------------------------------------

interface SceneExportJson {
  version: 1;
  dimensions: SceneState["dimensions"];
  background: SceneState["background"];
  layers: SceneState["layers"];
  entities: SceneState["entities"];
  positions: SceneState["positions"];
  routes: SceneState["routes"];
  zoneTypes: SceneState["zoneTypes"];
  zoneGrid: SceneState["zoneGrid"];
  lighting: SceneState["lighting"];
  particles: SceneState["particles"];
}

interface EntityExportJson {
  version: 1;
  entities: Record<string, EntityEntry>;
}

interface ChoreographyExportJson {
  version: 1;
  choreographies: ChoreographyDef[];
  wires: WireConnection[];
  bindings: EntityBinding[];
}

interface ShaderExportJson {
  version: 1;
  shaders: ShaderEditorState["shaders"];
}

interface P5ExportJson {
  version: 1;
  sketches: SketchEditorState["sketches"];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect all unique asset paths referenced by entity visual configs.
 * Scans `visual.source` on every entity definition.
 */
function collectReferencedAssetPaths(
  entities: Record<string, EntityEntry>,
): Set<string> {
  const paths = new Set<string>();
  for (const entity of Object.values(entities)) {
    paths.add(entity.visual.source);
    if (entity.sounds) {
      for (const soundPath of Object.values(entity.sounds)) {
        paths.add(soundPath);
      }
    }
  }
  return paths;
}

/**
 * Determine the ZIP subfolder for an asset based on the visual type
 * of the entity that references it.
 */
function folderForVisualType(visualType: EntityVisual["type"]): string {
  switch (visualType) {
    case "spritesheet": return "assets/spritesheets";
    case "gif": return "assets/gifs";
    default: return "assets/sprites";
  }
}

/**
 * Build a mapping from original asset-store paths to ZIP-relative paths.
 * Categorizes into subfolders based on entity visual type.
 * Handles filename collisions by appending a numeric suffix.
 */
function buildAssetPathMapping(
  referencedPaths: Set<string>,
  assets: AssetFile[],
  entities: Record<string, EntityEntry>,
): Map<string, string> {
  // Build reverse lookup: assetPath → visual type (first-seen wins)
  const pathToType = new Map<string, EntityVisual["type"]>();
  for (const entity of Object.values(entities)) {
    if (!pathToType.has(entity.visual.source)) {
      pathToType.set(entity.visual.source, entity.visual.type);
    }
  }

  const usedNames = new Set<string>();
  const mapping = new Map<string, string>();

  for (const originalPath of referencedPaths) {
    const asset = assets.find((a) => a.path === originalPath);
    if (!asset) continue;

    const visualType = pathToType.get(originalPath) ?? "sprite";
    const folder = folderForVisualType(visualType);

    let zipPath = `${folder}/${asset.name}`;

    // Handle filename collisions
    let counter = 2;
    while (usedNames.has(zipPath)) {
      const dotIdx = asset.name.lastIndexOf(".");
      const stem = dotIdx >= 0 ? asset.name.slice(0, dotIdx) : asset.name;
      const ext = dotIdx >= 0 ? asset.name.slice(dotIdx) : "";
      zipPath = `${folder}/${stem}-${counter}${ext}`;
      counter++;
    }

    usedNames.add(zipPath);
    mapping.set(originalPath, zipPath);
  }

  return mapping;
}

/**
 * Clone entity definitions with visual.source paths rewritten
 * from original asset-store paths to ZIP-relative paths.
 */
function rewriteEntityPaths(
  entities: Record<string, EntityEntry>,
  pathMapping: Map<string, string>,
): Record<string, EntityEntry> {
  const result: Record<string, EntityEntry> = {};

  for (const [id, entity] of Object.entries(entities)) {
    const mappedSource = pathMapping.get(entity.visual.source);
    const newVisual: EntityVisual = mappedSource
      ? { ...entity.visual, source: mappedSource }
      : { ...entity.visual };

    let newSounds: Record<string, string> | undefined;
    if (entity.sounds) {
      newSounds = {};
      for (const [event, soundPath] of Object.entries(entity.sounds)) {
        newSounds[event] = pathMapping.get(soundPath) ?? soundPath;
      }
    }

    result[id] = { ...entity, visual: newVisual, sounds: newSounds };
  }

  return result;
}

/** Read a File object as a Uint8Array. */
async function fileToUint8Array(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

/** Trigger a browser download of binary data. */
function downloadBlob(data: Uint8Array, filename: string): void {
  // Copy into a plain ArrayBuffer so TS accepts it as BlobPart (TS 5.7+ Uint8Array generics)
  const bytes = new Uint8Array(data);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------

/** Compute export summary counts from current state. */
function computeExportSummary(): ExportSummary {
  const sceneState = getSceneState();
  const entityStore = getEntityStore();
  const assetStore = getAssetStore();
  const choreoState = getChoreographyState();
  const wiringState = getWiringState();
  const bindingState = getBindingState();
  const shaderState = getShaderState();
  const p5State = getSketchState();

  const persistentWires = wiringState.wires.filter(
    (w) => w.fromZone !== "signal",
  );

  return {
    entityPlacements: sceneState.entities.length,
    entityDefinitions: Object.keys(entityStore.entities).length,
    assetFiles: assetStore.assets.length,
    choreographies: choreoState.choreographies.length,
    wires: persistentWires.length,
    bindings: bindingState.bindings.length,
    shaders: shaderState.shaders.length,
    p5Sketches: p5State.sketches.length,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export the current scene as a ZIP file.
 *
 * Shows a selection dialog, then gathers the chosen sections
 * into a ZIP archive and triggers a browser download.
 */
export async function exportScene(): Promise<void> {
  // Phase 1 — Compute summary and show selection dialog
  const summary = computeExportSummary();
  const selection = await showExportDialog(summary);
  if (!selection) return; // User cancelled

  // Phase 2 — Gather selected sections
  const zipData: Record<string, Uint8Array> = {};

  // Scene layout
  if (selection.visualLayout) {
    const sceneState = getSceneState();
    const sceneJson: SceneExportJson = {
      version: 1,
      dimensions: sceneState.dimensions,
      background: sceneState.background,
      layers: sceneState.layers,
      entities: sceneState.entities,
      positions: sceneState.positions,
      routes: sceneState.routes,
      zoneTypes: sceneState.zoneTypes,
      zoneGrid: sceneState.zoneGrid,
      lighting: sceneState.lighting,
      particles: sceneState.particles,
    };
    zipData["scene.json"] = strToU8(JSON.stringify(sceneJson, null, 2));
  }

  // Entities & Assets
  if (selection.entitiesAndAssets) {
    const entityStore = getEntityStore();
    const assetStore = getAssetStore();

    const referencedPaths = collectReferencedAssetPaths(entityStore.entities);
    const pathMapping = buildAssetPathMapping(
      referencedPaths,
      assetStore.assets,
      entityStore.entities,
    );
    const exportedEntities = rewriteEntityPaths(entityStore.entities, pathMapping);

    const entitiesJson: EntityExportJson = {
      version: 1,
      entities: exportedEntities,
    };
    zipData["entities.json"] = strToU8(JSON.stringify(entitiesJson, null, 2));

    // Read referenced asset files into the ZIP
    for (const [originalPath, zipPath] of pathMapping) {
      const asset = assetStore.assets.find((a) => a.path === originalPath);
      if (!asset) continue;
      zipData[zipPath] = await fileToUint8Array(asset.file);
    }
  }

  // Choreographies + Wiring + Bindings
  if (selection.choreographiesAndWiring) {
    const choreoState = getChoreographyState();
    const wiringState = getWiringState();
    const bindingState = getBindingState();

    // Exclude signal→signal-type wires — sources are session-ephemeral
    const persistentWires = wiringState.wires.filter(
      (w) => w.fromZone !== "signal",
    );

    const choreoJson: ChoreographyExportJson = {
      version: 1,
      choreographies: choreoState.choreographies,
      wires: persistentWires,
      bindings: bindingState.bindings,
    };
    zipData["choreographies.json"] = strToU8(JSON.stringify(choreoJson, null, 2));
  }

  // Shaders
  if (selection.shaders) {
    const shaderState = getShaderState();
    if (shaderState.shaders.length > 0) {
      const shaderJson: ShaderExportJson = {
        version: 1,
        shaders: shaderState.shaders,
      };
      zipData["shaders.json"] = strToU8(JSON.stringify(shaderJson, null, 2));
    }
  }

  // p5 Sketches
  if (selection.p5Sketches) {
    const p5State = getSketchState();
    if (p5State.sketches.length > 0) {
      const p5Json: P5ExportJson = {
        version: 1,
        sketches: p5State.sketches,
      };
      zipData["p5.json"] = strToU8(JSON.stringify(p5Json, null, 2));
    }
  }

  // Phase 3 — Create ZIP and trigger download
  const zipped = zipSync(zipData);
  downloadBlob(zipped, "scene-export.zip");
}
