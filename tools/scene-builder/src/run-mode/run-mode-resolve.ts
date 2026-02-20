/**
 * Run mode resolution helpers — shared entity and position lookup.
 *
 * Centralizes semantic ID → PlacedEntity resolution used by both
 * the CommandSink and the BindingExecutor.
 *
 * **Multi-instance support:** multiple placed entities may share the same
 * `semanticId` (e.g. three "peon" agents on scene). The `resolveAll*`
 * variants return every matching instance so that choreography steps and
 * bindings fan out to all of them. The single-match `resolveEntityId` /
 * `resolveEntity` are kept for backward compatibility in contexts that
 * expect at most one result.
 *
 * Entity resolution chain:
 *   semanticId → PlacedEntity[] (scene-state) → placedId[]
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

/**
 * Resolve a semantic entity ID to **all** matching placed entity IDs.
 *
 * Unlike {@link resolveEntityId} which returns only the first match, this
 * function returns every placed entity whose `semanticId` equals the given
 * value. Use this when a choreography step or binding must fan-out to all
 * instances sharing the same semantic role (e.g. three "peon" agents on scene).
 *
 * Returns an empty array when no entity matches.
 */
export function resolveAllEntityIds(semanticId: string): string[] {
  const { entities } = getSceneState();
  return entities
    .filter((e) => e.semanticId === semanticId)
    .map((e) => e.id);
}

/**
 * Resolve a semantic entity ID to **all** matching PlacedEntity objects.
 *
 * Multi-instance counterpart of {@link resolveEntity}. Returns every placed
 * entity whose `semanticId` matches, preserving scene order. Returns an empty
 * array when no entity matches.
 */
export function resolveAllEntities(semanticId: string): PlacedEntity[] {
  const { entities } = getSceneState();
  return entities.filter((e) => e.semanticId === semanticId);
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
