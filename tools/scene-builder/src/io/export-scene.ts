/**
 * Scene export module.
 *
 * Gathers scene state, entity definitions, and referenced assets
 * into a ZIP archive (via fflate) and triggers a browser download.
 *
 * ZIP structure:
 *   scene.json            — scene layout (dimensions, background, layers, placed entities, positions, routes)
 *   entities.json         — entity definitions (visual config, defaults, tags)
 *   choreographies.json   — choreography definitions + wire connections
 *   assets/               — referenced image files (sprites/, spritesheets/, gifs/)
 */

import { zipSync, strToU8 } from "fflate";
import { getSceneState } from "../state/scene-state.js";
import { getEntityStore } from "../state/entity-store.js";
import { getAssetStore } from "../state/asset-store.js";
import { getChoreographyState } from "../state/choreography-state.js";
import { getWiringState, type WireConnection } from "../state/wiring-state.js";
import { getBindingState } from "../state/binding-store.js";
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
// Public API
// ---------------------------------------------------------------------------

/**
 * Export the current scene as a ZIP file.
 *
 * Gathers scene state, entity definitions, and referenced assets.
 * Only assets actually referenced by entity visuals are included.
 * Triggers a browser download of the resulting ZIP.
 */
export async function exportScene(): Promise<void> {
  const sceneState = getSceneState();
  const entityStore = getEntityStore();
  const assetStore = getAssetStore();

  // 1. Collect referenced assets
  const referencedPaths = collectReferencedAssetPaths(entityStore.entities);

  // 2. Build path mapping (original → ZIP-relative)
  const pathMapping = buildAssetPathMapping(
    referencedPaths,
    assetStore.assets,
    entityStore.entities,
  );

  // 3. Rewrite entity visual paths for the ZIP
  const exportedEntities = rewriteEntityPaths(entityStore.entities, pathMapping);

  // 4. Build scene.json
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

  // 5. Build entities.json
  const entitiesJson: EntityExportJson = {
    version: 1,
    entities: exportedEntities,
  };

  // 6. Build choreographies.json (choreography definitions + wire graph + bindings)
  const choreoState = getChoreographyState();
  const wiringState = getWiringState();
  const bindingState = getBindingState();

  // Exclude signal→signal-type wires — sources are session-ephemeral
  // and won't exist on re-import, creating orphaned references
  const persistentWires = wiringState.wires.filter(
    (w) => w.fromZone !== "signal",
  );

  const choreoJson: ChoreographyExportJson = {
    version: 1,
    choreographies: choreoState.choreographies,
    wires: persistentWires,
    bindings: bindingState.bindings,
  };

  // 7. Build ZIP data structure
  const zipData: Record<string, Uint8Array> = {
    "scene.json": strToU8(JSON.stringify(sceneJson, null, 2)),
    "entities.json": strToU8(JSON.stringify(entitiesJson, null, 2)),
    "choreographies.json": strToU8(JSON.stringify(choreoJson, null, 2)),
  };

  // 8. Read referenced asset files into the ZIP
  for (const [originalPath, zipPath] of pathMapping) {
    const asset = assetStore.assets.find((a) => a.path === originalPath);
    if (!asset) continue;
    zipData[zipPath] = await fileToUint8Array(asset.file);
  }

  // 9. Create ZIP and trigger download
  const zipped = zipSync(zipData);
  downloadBlob(zipped, "scene-export.zip");
}
