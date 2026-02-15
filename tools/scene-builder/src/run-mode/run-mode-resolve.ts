/**
 * Run mode resolution helpers — shared entity and position lookup.
 *
 * Centralizes semantic ID → PlacedEntity resolution used by both
 * the CommandSink and the BindingExecutor.
 *
 * Entity resolution chain:
 *   semanticId → PlacedEntity (scene-state) → placedId
 *
 * Position resolution:
 *   position name → ScenePosition (scene-state) → { x, y }
 */

import { getSceneState } from "../state/scene-state.js";
import type { PlacedEntity, SceneRoute } from "../types.js";

// ---------------------------------------------------------------------------
// Entity resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a semantic entity ID to a placed entity ID (instance ID).
 * Returns null if no entity with that semanticId exists in the scene.
 */
export function resolveEntityId(semanticId: string): string | null {
  const { entities } = getSceneState();
  const placed = entities.find((e) => e.semanticId === semanticId);
  return placed?.id ?? null;
}

/**
 * Resolve a semantic entity ID to the full PlacedEntity object.
 * Returns null if no entity with that semanticId exists in the scene.
 */
export function resolveEntity(semanticId: string): PlacedEntity | null {
  const { entities } = getSceneState();
  return entities.find((e) => e.semanticId === semanticId) ?? null;
}

// ---------------------------------------------------------------------------
// Position resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a position name to scene coordinates.
 * Returns null if no position with that name exists.
 */
export function resolvePosition(name: string): { x: number; y: number } | null {
  const { positions } = getSceneState();
  const pos = positions.find((p) => p.name === name);
  return pos ? { x: pos.x, y: pos.y } : null;
}

// ---------------------------------------------------------------------------
// Route resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a route name to its full SceneRoute object.
 * Returns null if no route with that name exists.
 */
export function resolveRoute(name: string): SceneRoute | null {
  const { routes } = getSceneState();
  return routes.find((r) => r.name === name) ?? null;
}
