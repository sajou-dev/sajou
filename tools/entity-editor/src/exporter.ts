/**
 * Export module.
 *
 * Generates entity-visuals.json and scene-layout.json conforming
 * to the @sajou/schema format and bundles them with referenced
 * assets into a downloadable zip file.
 */

import JSZip from "jszip";
import { getState, updateState, createDefaultSceneState } from "./app-state.js";
import type { AssetFile, EntityEntry, VisualState } from "./app-state.js";
import type { SceneLayoutJson, SceneState } from "./types.js";

// ---------------------------------------------------------------------------
// Entity JSON generation
// ---------------------------------------------------------------------------

/** Convert a VisualState to a schema-conformant JSON object. */
function stateToJson(state: VisualState): Record<string, unknown> {
  if (state.type === "spritesheet") {
    const obj: Record<string, unknown> = {
      type: "spritesheet",
      asset: state.asset,
      frameWidth: state.frameWidth,
      frameHeight: state.frameHeight,
      frameCount: state.frameCount,
      fps: state.fps,
    };
    if (state.frameRow !== 0) {
      obj["frameRow"] = state.frameRow;
    }
    if (state.frameStart) {
      obj["frameStart"] = state.frameStart;
    }
    if (!state.loop) {
      obj["loop"] = false;
    }
    return obj;
  }

  // Static
  const obj: Record<string, unknown> = {
    type: "static",
    asset: state.asset,
  };
  if (state.sourceRect) {
    obj["sourceRect"] = {
      x: state.sourceRect.x,
      y: state.sourceRect.y,
      w: state.sourceRect.w,
      h: state.sourceRect.h,
    };
  }
  return obj;
}

/** Convert an EntityEntry to a schema-conformant JSON object. */
function entityToJson(entry: EntityEntry): Record<string, unknown> {
  const states: Record<string, unknown> = {};
  for (const [name, state] of Object.entries(entry.states)) {
    states[name] = stateToJson(state);
  }

  return {
    displayWidth: entry.displayWidth,
    displayHeight: entry.displayHeight,
    fallbackColor: entry.fallbackColor,
    states,
  };
}

/** Generate the full entity-visuals.json content. */
function generateEntityJson(): string {
  const { entities } = getState();
  const output: Record<string, unknown> = {};

  for (const [id, entry] of Object.entries(entities)) {
    output[id] = entityToJson(entry);
  }

  return JSON.stringify({ entities: output }, null, 2);
}

// ---------------------------------------------------------------------------
// Scene JSON generation
// ---------------------------------------------------------------------------

/** Generate the scene-layout.json content. */
function generateSceneJson(scene: SceneState): string {
  const layout: SceneLayoutJson = {
    sceneWidth: scene.sceneWidth,
    sceneHeight: scene.sceneHeight,
    ground: { color: scene.ground.color },
    positions: { ...scene.positions },
    decorations: scene.decorations.map((d) => ({ ...d })),
    walls: scene.walls.map((w) => ({ ...w, points: w.points.map((p) => ({ ...p })) })),
    routes: scene.routes.map((r) => ({ ...r })),
  };

  return JSON.stringify(layout, null, 2);
}

// ---------------------------------------------------------------------------
// Zip export
// ---------------------------------------------------------------------------

/** Collect all unique asset paths referenced by entities and scene. */
function collectReferencedAssets(): Set<string> {
  const paths = new Set<string>();
  const { entities, scene } = getState();

  // Entity assets
  for (const entry of Object.values(entities)) {
    for (const state of Object.values(entry.states)) {
      if (state.asset) {
        paths.add(state.asset);
      }
    }
  }

  // Scene decoration assets
  for (const decor of scene.decorations) {
    if (decor.asset) {
      paths.add(decor.asset);
    }
  }

  // (Ground is just a color — no asset references)

  return paths;
}

/** Generate asset-categories.json for the zip. */
function generateAssetCategoriesJson(): string {
  const { assetCategories, assets } = getState();
  const assignments: Record<string, string> = {};
  for (const asset of assets) {
    if (asset.category) {
      assignments[asset.path] = asset.category;
    }
  }
  return JSON.stringify({ categories: assetCategories, assignments }, null, 2);
}

/** Export entity-visuals.json + scene-layout.json + asset-categories.json + referenced assets as a zip download. */
export async function exportZip(): Promise<void> {
  const zip = new JSZip();

  // Add entity visuals JSON
  const entityJson = generateEntityJson();
  zip.file("entity-visuals.json", entityJson);

  // Add scene layout JSON
  const { scene } = getState();
  const sceneJson = generateSceneJson(scene);
  zip.file("scene-layout.json", sceneJson);

  // Add asset categories JSON
  const categoriesJson = generateAssetCategoriesJson();
  zip.file("asset-categories.json", categoriesJson);

  // Add referenced assets
  const referencedPaths = collectReferencedAssets();
  const { assets } = getState();

  for (const path of referencedPaths) {
    const asset = assets.find((a) => a.path === path);
    if (asset) {
      const buffer = await asset.file.arrayBuffer();
      zip.file(path, buffer);
    }
  }

  // Generate and download
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "theme-config.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// JSON import
// ---------------------------------------------------------------------------

/** Import a zip file exported by the editor (JSONs + asset files). */
export async function importZip(file: File): Promise<void> {
  try {
    const zip = await JSZip.loadAsync(file);

    // Extract JSON configs
    const entityFile = zip.file("entity-visuals.json");
    const sceneFile = zip.file("scene-layout.json");
    const categoriesFile = zip.file("asset-categories.json");

    // Parse categories first so we can assign them during asset creation
    let categories: string[] = [];
    let assignments: Record<string, string> = {};
    if (categoriesFile) {
      const catText = await categoriesFile.async("string");
      const catParsed = JSON.parse(catText) as Record<string, unknown>;
      categories = (catParsed["categories"] as string[] | undefined) ?? [];
      assignments = (catParsed["assignments"] as Record<string, string> | undefined) ?? {};
    }

    // Extract asset files (everything that isn't a .json)
    const assetFiles: AssetFile[] = [];
    const promises: Promise<void>[] = [];

    zip.forEach((relativePath, entry) => {
      if (entry.dir) return;
      if (relativePath.endsWith(".json")) return;

      promises.push(
        entry.async("blob").then((blob) => {
          const name = relativePath.split("/").pop() ?? relativePath;
          const mimeType = name.endsWith(".svg") ? "image/svg+xml" : `image/${name.split(".").pop()}`;
          const assetFileObj = new File([blob], name, { type: mimeType });
          const objectUrl = URL.createObjectURL(blob);
          assetFiles.push({
            path: relativePath,
            name,
            objectUrl,
            file: assetFileObj,
            category: assignments[relativePath] ?? null,
          });
        }),
      );
    });

    await Promise.all(promises);

    // Merge assets into state (avoid duplicates by path)
    const existing = getState().assets;
    const existingPaths = new Set(existing.map((a) => a.path));
    const merged = [...existing];
    for (const a of assetFiles) {
      if (!existingPaths.has(a.path)) {
        merged.push(a);
      }
    }

    // Merge categories
    const existingCategories = getState().assetCategories;
    const allCategories = [...new Set([...existingCategories, ...categories])];

    updateState({ assets: merged, assetCategories: allCategories });

    // Import entity visuals
    if (entityFile) {
      const text = await entityFile.async("string");
      importJson(text);
    }

    // Import scene layout
    if (sceneFile) {
      const text = await sceneFile.async("string");
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed["sceneWidth"] !== undefined) {
        importSceneLayout(parsed);
      }
    }
  } catch (e) {
    alert(`Failed to import zip: ${String(e)}`);
  }
}

/** Import an entity-visuals.json file to populate the editor. */
export function importJson(jsonText: string): void {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;

    // Try scene-layout.json format
    if (parsed["sceneWidth"] !== undefined) {
      importSceneLayout(parsed);
      return;
    }

    // Try entity-visuals.json format
    if (!parsed["entities"] || typeof parsed["entities"] !== "object") {
      alert("Invalid JSON: expected entity-visuals.json or scene-layout.json format.");
      return;
    }

    const rawEntities = parsed["entities"] as Record<string, unknown>;
    const entities: Record<string, EntityEntry> = {};

    for (const [id, raw] of Object.entries(rawEntities)) {
      const entry = raw as Record<string, unknown>;
      const states: Record<string, VisualState> = {};

      const rawStates = entry["states"] as Record<string, Record<string, unknown>> | undefined;
      if (rawStates) {
        for (const [stateName, rawState] of Object.entries(rawStates)) {
          if (rawState["type"] === "spritesheet") {
            // Backward compat: accept old `frameSize` as fallback for both dimensions
            const legacySize = rawState["frameSize"] as number | undefined;
            states[stateName] = {
              type: "spritesheet",
              asset: String(rawState["asset"] ?? ""),
              frameWidth: Number(rawState["frameWidth"] ?? legacySize ?? 192),
              frameHeight: Number(rawState["frameHeight"] ?? legacySize ?? 192),
              frameCount: Number(rawState["frameCount"] ?? 6),
              frameRow: Number(rawState["frameRow"] ?? 0),
              frameStart: Number(rawState["frameStart"] ?? 0),
              fps: Number(rawState["fps"] ?? 10),
              loop: rawState["loop"] !== false,
            };
          } else {
            const sr = rawState["sourceRect"] as Record<string, number> | undefined;
            states[stateName] = {
              type: "static",
              asset: String(rawState["asset"] ?? ""),
              ...(sr ? { sourceRect: { x: sr["x"] ?? 0, y: sr["y"] ?? 0, w: sr["w"] ?? 64, h: sr["h"] ?? 64 } } : {}),
            };
          }
        }
      }

      entities[id] = {
        displayWidth: Number(entry["displayWidth"] ?? 64),
        displayHeight: Number(entry["displayHeight"] ?? 64),
        fallbackColor: String(entry["fallbackColor"] ?? "#888888"),
        states,
      };
    }

    const firstId = Object.keys(entities)[0] ?? null;
    const firstState = firstId ? Object.keys(entities[firstId]!.states)[0] ?? null : null;

    updateState({
      entities,
      selectedEntityId: firstId,
      selectedStateName: firstState,
    });
  } catch (e) {
    alert(`Failed to parse JSON: ${String(e)}`);
  }
}

/** Import a scene-layout.json to populate the scene editor. */
function importSceneLayout(parsed: Record<string, unknown>): void {
  const base = createDefaultSceneState();

  const rawGround = parsed["ground"] as Record<string, unknown> | undefined;
  const sceneW = Number(parsed["sceneWidth"] ?? base.sceneWidth);
  const sceneH = Number(parsed["sceneHeight"] ?? base.sceneHeight);

  const groundColor = String(rawGround?.["color"] ?? base.ground.color);

  const scene: SceneState = {
    sceneWidth: sceneW,
    sceneHeight: sceneH,
    ground: { color: groundColor },
    positions: {},
    decorations: [],
    walls: [],
    routes: [],
  };

  // Import positions
  const rawPositions = parsed["positions"] as Record<string, Record<string, number>> | undefined;
  if (rawPositions) {
    for (const [name, pos] of Object.entries(rawPositions)) {
      const color = (pos as Record<string, unknown>)["color"];
      scene.positions[name] = {
        x: Number(pos["x"] ?? 0),
        y: Number(pos["y"] ?? 0),
        ...(color ? { color: String(color) } : {}),
      };
    }
  }

  // Import decorations
  const rawDecorations = parsed["decorations"] as Array<Record<string, unknown>> | undefined;
  if (rawDecorations) {
    for (const raw of rawDecorations) {
      scene.decorations.push({
        id: String(raw["id"] ?? `d${Date.now()}`),
        asset: String(raw["asset"] ?? ""),
        x: Number(raw["x"] ?? 0),
        y: Number(raw["y"] ?? 0),
        displayWidth: Number(raw["displayWidth"] ?? 64),
        displayHeight: Number(raw["displayHeight"] ?? 64),
        rotation: Number(raw["rotation"] ?? 0),
        layer: Number(raw["layer"] ?? 0),
      });
    }
  }

  // Import walls
  const rawWalls = parsed["walls"] as Array<Record<string, unknown>> | undefined;
  if (rawWalls) {
    for (const raw of rawWalls) {
      const rawPoints = raw["points"] as Array<Record<string, number>> | undefined;
      scene.walls.push({
        id: String(raw["id"] ?? `w${Date.now()}`),
        points: rawPoints?.map((p) => ({ x: Number(p["x"] ?? 0), y: Number(p["y"] ?? 0) })) ?? [],
        thickness: Number(raw["thickness"] ?? 4),
        color: String(raw["color"] ?? "#333333"),
      });
    }
  }

  // Import routes
  const rawRoutes = parsed["routes"] as Array<Record<string, unknown>> | undefined;
  if (rawRoutes) {
    for (const raw of rawRoutes) {
      const routeName = raw["name"] as string | undefined;
      scene.routes.push({
        id: String(raw["id"] ?? `r${Date.now()}`),
        from: String(raw["from"] ?? ""),
        to: String(raw["to"] ?? ""),
        ...(routeName ? { name: routeName } : {}),
      });
    }
  }

  updateState({
    scene,
    activeTab: "scene",
  });
}
