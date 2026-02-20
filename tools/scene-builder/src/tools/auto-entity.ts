/**
 * Auto-entity creation.
 *
 * Pure functions that convert an imported AssetFile into a minimal
 * EntityEntry for instant drag-and-drop placement on the canvas.
 * Deterministic IDs ensure idempotency — dragging the same asset
 * twice reuses the entity definition rather than creating a duplicate.
 */

import type { AssetFile, EntityEntry, EntityVisual, SpriteAnimation } from "../types.js";
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

/**
 * Choose the correct EntityVisual type based on asset format and
 * auto-detected spritesheet hint (if available).
 */
function buildVisual(asset: AssetFile): EntityVisual {
  if (asset.format === "gif") {
    return { type: "gif", source: asset.path, fps: asset.detectedFps ?? 10, loop: true };
  }

  // Use spritesheet hint if detection confidence is high enough
  if (asset.spritesheetHint && asset.spritesheetHint.confidence >= 0.4) {
    const hint = asset.spritesheetHint;
    const animations: Record<string, SpriteAnimation> = {};

    for (const rowAnim of hint.rowAnimations) {
      const name = hint.rowAnimations.length === 1
        ? "default"
        : `row-${rowAnim.row}`;
      animations[name] = { frames: rowAnim.frames, fps: 10, loop: true };
    }

    // Fallback: at least one animation
    if (Object.keys(animations).length === 0) {
      animations["default"] = { frames: [0], fps: 10, loop: true };
    }

    return {
      type: "spritesheet",
      source: asset.path,
      frameWidth: hint.frameWidth,
      frameHeight: hint.frameHeight,
      animations,
    };
  }

  return { type: "sprite", source: asset.path };
}

/**
 * Create a minimal EntityEntry from an imported AssetFile.
 *
 * Uses the asset's natural dimensions (fallback 64×64), a deterministic
 * ID, and the `"auto"` tag to mark auto-created entities in the palette.
 * For spritesheets, uses frame dimensions instead of full image size.
 */
export function createEntityFromAsset(asset: AssetFile): EntityEntry {
  const id = assetPathToEntityId(asset.path);
  const visual = buildVisual(asset);

  // Use frame size for spritesheets, full image size for sprites/gifs
  let w: number;
  let h: number;
  if (visual.type === "spritesheet") {
    w = visual.frameWidth;
    h = visual.frameHeight;
  } else {
    w = asset.naturalWidth ?? 64;
    h = asset.naturalHeight ?? 64;
  }

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
    visual,
  };
}
