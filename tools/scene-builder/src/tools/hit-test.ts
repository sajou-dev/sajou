/**
 * Shared hit-testing utilities for scene elements.
 *
 * Provides proximity-based hit testing for positions (waypoints),
 * used by select-tool for Alt+drag topology associations.
 */

import { getSceneState } from "../state/scene-state.js";

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
