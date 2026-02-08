/**
 * Export module.
 *
 * Generates entity-visuals.json conforming to the @sajou/schema format
 * and bundles it with referenced assets into a downloadable zip file.
 */

import JSZip from "jszip";
import { getState, updateState } from "./app-state.js";
import type { EntityEntry, VisualState } from "./app-state.js";

// ---------------------------------------------------------------------------
// JSON generation
// ---------------------------------------------------------------------------

/** Convert a VisualState to a schema-conformant JSON object. */
function stateToJson(state: VisualState): Record<string, unknown> {
  if (state.type === "spritesheet") {
    const obj: Record<string, unknown> = {
      type: "spritesheet",
      asset: state.asset,
      frameSize: state.frameSize,
      frameCount: state.frameCount,
      fps: state.fps,
    };
    if (state.frameRow !== 0) {
      obj["frameRow"] = state.frameRow;
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
function generateJson(): string {
  const { entities } = getState();
  const output: Record<string, unknown> = {};

  for (const [id, entry] of Object.entries(entities)) {
    output[id] = entityToJson(entry);
  }

  return JSON.stringify({ entities: output }, null, 2);
}

// ---------------------------------------------------------------------------
// Zip export
// ---------------------------------------------------------------------------

/** Collect all unique asset paths referenced by entities. */
function collectReferencedAssets(): Set<string> {
  const paths = new Set<string>();
  const { entities } = getState();

  for (const entry of Object.values(entities)) {
    for (const state of Object.values(entry.states)) {
      if (state.asset) {
        paths.add(state.asset);
      }
    }
  }

  return paths;
}

/** Export entity-visuals.json + referenced assets as a zip download. */
export async function exportZip(): Promise<void> {
  const zip = new JSZip();

  // Add the JSON config
  const json = generateJson();
  zip.file("entity-visuals.json", json);

  // Add referenced assets
  const referencedPaths = collectReferencedAssets();
  const { assets } = getState();

  for (const path of referencedPaths) {
    const asset = assets.find((a) => a.path === path);
    if (asset) {
      // Read the file as ArrayBuffer
      const buffer = await asset.file.arrayBuffer();
      zip.file(path, buffer);
    }
  }

  // Generate and download
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "entity-visuals.zip";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// JSON import
// ---------------------------------------------------------------------------

/** Import an entity-visuals.json file to populate the editor. */
export function importJson(jsonText: string): void {
  try {
    const parsed = JSON.parse(jsonText) as { entities?: Record<string, unknown> };
    if (!parsed.entities || typeof parsed.entities !== "object") {
      alert("Invalid entity-visuals.json: missing 'entities' object.");
      return;
    }

    const entities: Record<string, EntityEntry> = {};

    for (const [id, raw] of Object.entries(parsed.entities)) {
      const entry = raw as Record<string, unknown>;
      const states: Record<string, VisualState> = {};

      const rawStates = entry["states"] as Record<string, Record<string, unknown>> | undefined;
      if (rawStates) {
        for (const [stateName, rawState] of Object.entries(rawStates)) {
          if (rawState["type"] === "spritesheet") {
            states[stateName] = {
              type: "spritesheet",
              asset: String(rawState["asset"] ?? ""),
              frameSize: Number(rawState["frameSize"] ?? 192),
              frameCount: Number(rawState["frameCount"] ?? 6),
              frameRow: Number(rawState["frameRow"] ?? 0),
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
