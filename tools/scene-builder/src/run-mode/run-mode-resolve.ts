/**
 * Run mode resolution helpers — shared entity and position lookup.
 *
 * Centralizes semantic ID → PlacedEntity → PixiJS Sprite resolution
 * used by both the CommandSink and the BindingExecutor.
 *
 * Entity resolution chain:
 *   semanticId → PlacedEntity (scene-state) → Sprite (scene-renderer)
 *
 * Position resolution:
 *   position name → ScenePosition (scene-state) → { x, y }
 */

import type { Sprite } from "pixi.js";
import { getSceneState } from "../state/scene-state.js";
import { getEntitySpriteById } from "../canvas/scene-renderer.js";
import type { PlacedEntity } from "../types.js";

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
 * Resolve a semantic entity ID directly to its PixiJS Sprite.
 * Combines entity lookup + sprite lookup in one call.
 * Returns null if entity or sprite not found.
 */
export function resolveSprite(semanticId: string): Sprite | null {
  const placedId = resolveEntityId(semanticId);
  if (!placedId) return null;
  return getEntitySpriteById(placedId);
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
