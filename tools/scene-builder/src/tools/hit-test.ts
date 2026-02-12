/**
 * Shared hit-testing utilities for scene elements.
 *
 * Provides proximity-based hit testing for positions (waypoints)
 * and AABB hit testing for entities (binding drag targets).
 */

import { getSceneState } from "../state/scene-state.js";
import { getEntityStore } from "../state/entity-store.js";
import type { SceneLayer } from "../types.js";

/** Default hit-test radius in scene coordinates (pixels). */
const DEFAULT_RADIUS = 20;

/**
 * Hit-test against scene positions (waypoints).
 *
 * Returns the ID of the closest position within `radius`, or null.
 * When multiple positions overlap, returns the nearest.
 */
export function hitTestPosition(sx: number, sy: number, radius = DEFAULT_RADIUS): string | null {
  const { positions } = getSceneState();
  let closest: string | null = null;
  let closestDist = radius;

  for (const pos of positions) {
    const dx = pos.x - sx;
    const dy = pos.y - sy;
    const dist = Math.hypot(dx, dy);
    if (dist < closestDist) {
      closestDist = dist;
      closest = pos.id;
    }
  }

  return closest;
}

/**
 * AABB hit-test against placed entities with a semanticId (actors only).
 *
 * Returns the topmost hit entity info, or null.
 * Entities without a semanticId are skipped (decor cannot receive bindings).
 * Hidden entities and entities on hidden/locked layers are skipped.
 */
export function hitTestEntity(sx: number, sy: number): {
  placedId: string;
  semanticId: string;
} | null {
  const { entities, layers } = getSceneState();
  const entityStore = getEntityStore();

  // Build layer lookup
  const layerMap = new Map<string, SceneLayer>();
  for (const l of layers) layerMap.set(l.id, l);

  // Sort by effective zIndex descending (topmost first)
  const sorted = [...entities].sort((a, b) => {
    const la = layerMap.get(a.layerId);
    const lb = layerMap.get(b.layerId);
    const za = (la?.order ?? 0) * 10000 + a.zIndex;
    const zb = (lb?.order ?? 0) * 10000 + b.zIndex;
    return zb - za;
  });

  for (const placed of sorted) {
    // Only actors (entities with semanticId) are valid binding targets
    if (!placed.semanticId) continue;
    if (!placed.visible) continue;

    // Skip entities on hidden or locked layers
    const layer = layerMap.get(placed.layerId);
    if (layer && (!layer.visible || layer.locked)) continue;

    const def = entityStore.entities[placed.entityId];
    const w = (def?.displayWidth ?? 32) * placed.scale;
    const h = (def?.displayHeight ?? 32) * placed.scale;
    const ax = def?.defaults.anchor?.[0] ?? 0.5;
    const ay = def?.defaults.anchor?.[1] ?? 0.5;

    const left = placed.x - w * ax;
    const top = placed.y - h * ay;

    if (sx >= left && sx <= left + w && sy >= top && sy <= top + h) {
      return { placedId: placed.id, semanticId: placed.semanticId };
    }
  }

  return null;
}
