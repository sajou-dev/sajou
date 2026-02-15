/**
 * Shared hit-testing utilities for scene elements.
 *
 * Provides proximity-based hit testing for positions (waypoints)
 * and AABB hit testing for entities (binding drag targets).
 * In isometric mode, billboard entities use screen-space projection
 * for accurate hit testing against the standing sprite.
 */

import { getSceneState } from "../state/scene-state.js";
import { getEditorState } from "../state/editor-state.js";
import { getEntityStore } from "../state/entity-store.js";
import { worldToScreen, getOverlayCanvas } from "../canvas/canvas.js";
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

/** Result of an entity hit-test. */
export interface EntityHitResult {
  /** Placed entity instance ID. */
  placedId: string;
  /** Entity definition ID (e.g. "refugee-2"). */
  entityId: string;
  /** Semantic actor ID, or null if the entity has none (decor). */
  semanticId: string | null;
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
  const hit = hitTestAnyEntity(sx, sy);
  if (hit && hit.semanticId) return { placedId: hit.placedId, semanticId: hit.semanticId };
  return null;
}

/**
 * AABB hit-test against ANY placed entity (including decor without semanticId).
 *
 * Returns the topmost hit entity info (with nullable semanticId), or null.
 * Hidden entities and entities on hidden/locked layers are skipped.
 */
export function hitTestAnyEntity(sx: number, sy: number): EntityHitResult | null {
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
      return {
        placedId: placed.id,
        entityId: placed.entityId,
        semanticId: placed.semanticId ?? null,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Screen-space hit-test (isometric billboard support)
// ---------------------------------------------------------------------------

/** Sorted entity list for hit-testing (z-order descending). */
function sortedEntities() {
  const { entities, layers } = getSceneState();
  const layerMap = new Map<string, SceneLayer>();
  for (const l of layers) layerMap.set(l.id, l);

  const sorted = [...entities].sort((a, b) => {
    const la = layerMap.get(a.layerId);
    const lb = layerMap.get(b.layerId);
    const za = (la?.order ?? 0) * 10000 + a.zIndex;
    const zb = (lb?.order ?? 0) * 10000 + b.zIndex;
    return zb - za;
  });

  return { sorted, layerMap };
}

/**
 * Screen-space hit-test for isometric mode.
 *
 * Billboard entities are tested against their screen-projected bounding box
 * (the standing sprite). Flat entities use their scene-coordinate AABB
 * projected to screen space.
 *
 * @param clientX - Mouse clientX from the MouseEvent.
 * @param clientY - Mouse clientY from the MouseEvent.
 * @returns The topmost hit entity's placed ID, or null.
 */
export function hitTestScreenSpace(clientX: number, clientY: number): string | null {
  if (getEditorState().viewMode !== "isometric") return null;

  const canvas = getOverlayCanvas();
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;

  const entityStore = getEntityStore();
  const { sorted, layerMap } = sortedEntities();

  for (const placed of sorted) {
    if (!placed.visible) continue;
    const layer = layerMap.get(placed.layerId);
    if (layer && (!layer.visible || layer.locked)) continue;

    const def = entityStore.entities[placed.entityId];
    if (!def) continue;

    const w = def.displayWidth * placed.scale;
    const h = def.displayHeight * placed.scale;
    const ax = def.defaults.anchor?.[0] ?? 0.5;

    if (!def.defaults.flat) {
      // Billboard: test screen-projected vertical bounds
      const bottomPt = worldToScreen(placed.x, 0, placed.y);
      const topPt = worldToScreen(placed.x, h, placed.y);
      const pxPerUnit = Math.abs(bottomPt.y - topPt.y) / h;
      const screenW = w * pxPerUnit;
      const screenH = Math.abs(bottomPt.y - topPt.y);
      const selLeft = bottomPt.x - screenW * ax;
      const selTop = topPt.y;

      if (mx >= selLeft && mx <= selLeft + screenW &&
          my >= selTop && my <= selTop + screenH) {
        return placed.id;
      }
    } else {
      // Flat entity: project scene AABB corners to screen
      const ay = def.defaults.anchor?.[1] ?? 0.5;
      const left = placed.x - w * ax;
      const top = placed.y - h * ay;

      // Project all 4 corners (iso transforms rectangles to parallelograms)
      const tl = worldToScreen(left, 0, top);
      const tr = worldToScreen(left + w, 0, top);
      const bl = worldToScreen(left, 0, top + h);
      const br = worldToScreen(left + w, 0, top + h);

      const xs = [tl.x, tr.x, bl.x, br.x];
      const ys = [tl.y, tr.y, bl.y, br.y];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      if (mx >= minX && mx <= maxX && my >= minY && my <= maxY) {
        return placed.id;
      }
    }
  }

  return null;
}
