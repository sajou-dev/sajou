/**
 * Auto-entity creation.
 *
 * Pure functions that convert an imported AssetFile into a minimal
 * EntityEntry for instant drag-and-drop placement on the canvas.
 * Deterministic IDs ensure idempotency — dragging the same asset
 * twice reuses the entity definition rather than creating a duplicate.
 */

import type { AssetFile, EntityEntry, EntityVisual } from "../types.js";
import { getEntityStore } from "../state/entity-store.js";

// ---------------------------------------------------------------------------
// ID derivation
// ---------------------------------------------------------------------------

/**
 * Derive a deterministic entity ID from an asset path.
 *
 * Strips extension, replaces non-alphanumeric with hyphens, lowercases.
 * Example: `"units/peon-idle.png"` → `"units-peon-idle"`
 */
export function assetPathToEntityId(assetPath: string): string {
  return assetPath
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Find an existing entity whose visual references the given asset path.
 *
 * Two-pass lookup: first by deterministic ID (O(1) map hit), then by
 * scanning all entity `visual.source` fields (handles manually-created
 * entities referencing the same asset).
 */
export function findEntityForAsset(assetPath: string): EntityEntry | null {
  const { entities } = getEntityStore();

  // Fast path: deterministic ID match
  const deterministicId = assetPathToEntityId(assetPath);
  if (entities[deterministicId]) return entities[deterministicId]!;

  // Slow path: scan visual.source
  for (const entry of Object.values(entities)) {
    if (entry.visual.source === assetPath) return entry;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/** Choose the correct EntityVisual type based on asset format. */
function buildVisual(asset: AssetFile): EntityVisual {
  if (asset.format === "gif") {
    return { type: "gif", source: asset.path, fps: 10, loop: true };
  }
  return { type: "sprite", source: asset.path };
}

/**
 * Create a minimal EntityEntry from an imported AssetFile.
 *
 * Uses the asset's natural dimensions (fallback 64×64), a deterministic
 * ID, and the `"auto"` tag to mark auto-created entities in the palette.
 */
export function createEntityFromAsset(asset: AssetFile): EntityEntry {
  const id = assetPathToEntityId(asset.path);
  const w = asset.naturalWidth ?? 64;
  const h = asset.naturalHeight ?? 64;

  return {
    id,
    tags: ["auto"],
    displayWidth: w,
    displayHeight: h,
    fallbackColor: "#666666",
    defaults: {
      scale: 1,
      anchor: [0.5, 0.5],
      zIndex: 0,
      opacity: 1,
    },
    visual: buildVisual(asset),
  };
}
