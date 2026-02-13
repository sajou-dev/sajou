/**
 * Run mode spritesheet animator.
 *
 * During run mode, entities with spritesheet visuals should cycle through
 * their animation frames (idle, walk, etc.) — just like in the Preview.
 *
 * The editor's scene-renderer uses plain `Sprite` with a static first frame.
 * This module runs a `requestAnimationFrame` tick loop that swaps the sprite's
 * texture each frame, achieving the same effect as PixiJS `AnimatedSprite`
 * but without replacing the existing sprites.
 *
 * Lifecycle:
 *   startAnimations()  — scan entities, build frame textures, start rAF loop
 *   stopAnimations()   — stop loop, restore original static textures
 *   switchAnimation()  — change an entity's animation state mid-run
 */

import { Texture, Rectangle } from "pixi.js";
import type { Sprite } from "pixi.js";
import { getSceneState } from "../state/scene-state.js";
import { getEntityStore } from "../state/entity-store.js";
import { getEntitySpriteById, getCachedTexture } from "../canvas/scene-renderer.js";
import type { SpritesheetVisual, SpriteAnimation, PlacedEntity } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tracked animation state for a single entity sprite. */
interface AnimatedEntity {
  /** The placed entity instance ID. */
  placedId: string;
  /** The entity definition ID (for spritesheet lookup). */
  entityId: string;
  /** The PixiJS sprite being animated. */
  sprite: Sprite;
  /** Pre-sliced frame textures for the active animation. */
  frames: Texture[];
  /** FPS of this animation. */
  fps: number;
  /** Whether the animation loops. */
  loop: boolean;
  /** Current frame index. */
  currentFrame: number;
  /** Time accumulator (ms) since last frame change. */
  accumulator: number;
  /** The original texture to restore when stopping. */
  originalTexture: Texture;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** All currently animated entities, keyed by placedId for O(1) lookup. */
const animatedEntities = new Map<string, AnimatedEntity>();

/** rAF handle for cancellation. */
let rafId: number | null = null;

/** Timestamp of the previous tick (ms). */
let lastTime = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start spritesheet animations for all entities with spritesheet visuals.
 * Call this when entering run mode.
 */
export function startAnimations(): void {
  stopAnimations(); // Clean up any previous state

  const { entities } = getSceneState();
  const entityStore = getEntityStore();

  for (const placed of entities) {
    if (!placed.visible) continue;

    const def = entityStore.entities[placed.entityId];
    if (!def) continue;
    if (def.visual.type !== "spritesheet") continue;

    const sprite = getEntitySpriteById(placed.id);
    if (!sprite) continue;

    const visual = def.visual as SpritesheetVisual;
    const anim = resolveAnimation(visual, placed);
    if (!anim || anim.frames.length === 0) continue;

    const frameTextures = sliceFrames(visual, anim);
    if (frameTextures.length < 2) continue; // No point animating a single frame

    animatedEntities.set(placed.id, {
      placedId: placed.id,
      entityId: placed.entityId,
      sprite,
      frames: frameTextures,
      fps: anim.fps,
      loop: anim.loop !== false,
      currentFrame: 0,
      accumulator: 0,
      originalTexture: sprite.texture,
    });

    // Set first frame immediately
    sprite.texture = frameTextures[0]!;
  }

  if (animatedEntities.size === 0) return;

  // Start tick loop
  lastTime = performance.now();
  rafId = requestAnimationFrame(tick);

  console.log(
    `[run-mode-animator] Started — ${animatedEntities.size} animated entit${animatedEntities.size !== 1 ? "ies" : "y"}`,
  );
}

/**
 * Stop all spritesheet animations and restore original textures.
 * Call this when exiting run mode.
 */
export function stopAnimations(): void {
  // Cancel rAF
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Restore original textures
  for (const anim of animatedEntities.values()) {
    anim.sprite.texture = anim.originalTexture;
  }

  animatedEntities.clear();
}

/**
 * Switch a running entity to a different animation state.
 *
 * If the entity is already in the animator map, re-slices frames from the
 * new state and resets playback. If the entity was static (not in the map),
 * adds it and starts the rAF loop if needed.
 *
 * @param placedId  The placed entity instance ID.
 * @param newState  The animation state name (e.g., "dance", "walk", "idle").
 * @returns true if the switch succeeded, false if the entity or animation wasn't found.
 */
export function switchAnimation(placedId: string, newState: string): boolean {
  const entityStore = getEntityStore();

  // Find the placed entity
  const { entities } = getSceneState();
  const placed = entities.find((e) => e.id === placedId);
  if (!placed) return false;

  const def = entityStore.entities[placed.entityId];
  if (!def || def.visual.type !== "spritesheet") return false;

  const visual = def.visual as SpritesheetVisual;
  const targetAnim = visual.animations[newState];
  if (!targetAnim || targetAnim.frames.length === 0) return false;

  const frameTextures = sliceFrames(visual, targetAnim);
  if (frameTextures.length === 0) return false;

  const existing = animatedEntities.get(placedId);

  if (existing) {
    // Update existing entry: swap frames, reset playback
    existing.frames = frameTextures;
    existing.fps = targetAnim.fps;
    existing.loop = targetAnim.loop !== false;
    existing.currentFrame = 0;
    existing.accumulator = 0;
    existing.sprite.texture = frameTextures[0]!;
  } else {
    // Entity was static — add it to the animator
    const sprite = getEntitySpriteById(placedId);
    if (!sprite) return false;

    animatedEntities.set(placedId, {
      placedId,
      entityId: placed.entityId,
      sprite,
      frames: frameTextures,
      fps: targetAnim.fps,
      loop: targetAnim.loop !== false,
      currentFrame: 0,
      accumulator: 0,
      originalTexture: sprite.texture,
    });

    sprite.texture = frameTextures[0]!;

    // Ensure the rAF loop is running
    if (rafId === null) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Tick loop
// ---------------------------------------------------------------------------

/** rAF tick — advance all animations by elapsed time. */
function tick(now: number): void {
  const dt = now - lastTime;
  lastTime = now;

  for (const anim of animatedEntities.values()) {
    const msPerFrame = 1000 / anim.fps;
    anim.accumulator += dt;

    while (anim.accumulator >= msPerFrame) {
      anim.accumulator -= msPerFrame;
      anim.currentFrame++;

      if (anim.currentFrame >= anim.frames.length) {
        if (anim.loop) {
          anim.currentFrame = 0;
        } else {
          anim.currentFrame = anim.frames.length - 1;
          break;
        }
      }
    }

    // Apply the current frame texture
    anim.sprite.texture = anim.frames[anim.currentFrame]!;
  }

  rafId = requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Slice frame textures from a spritesheet for a given animation.
 *
 * Reads the full spritesheet texture from cache, computes the grid layout,
 * and creates individual Texture instances for each frame index.
 *
 * Reusable by both startAnimations() and switchAnimation().
 */
function sliceFrames(visual: SpritesheetVisual, anim: SpriteAnimation): Texture[] {
  const sheetTex = getCachedTexture(visual.source);
  if (!sheetTex) return [];

  const cols = visual.frameWidth > 0 ? Math.floor(sheetTex.width / visual.frameWidth) : 0;
  if (cols === 0) return [];

  const frameTextures: Texture[] = [];
  for (const frameIndex of anim.frames) {
    const fx = (frameIndex % cols) * visual.frameWidth;
    const fy = Math.floor(frameIndex / cols) * visual.frameHeight;

    // Bounds check
    if (fx + visual.frameWidth > sheetTex.width || fy + visual.frameHeight > sheetTex.height) {
      continue;
    }

    frameTextures.push(
      new Texture({
        source: sheetTex.source,
        frame: new Rectangle(fx, fy, visual.frameWidth, visual.frameHeight),
      }),
    );
  }

  return frameTextures;
}

/** Resolve the active animation for a placed entity's spritesheet visual. */
function resolveAnimation(
  visual: SpritesheetVisual,
  placed: PlacedEntity,
): SpriteAnimation | null {
  // Prefer active state, fall back to idle, then first available
  return (
    visual.animations[placed.activeState] ??
    visual.animations["idle"] ??
    Object.values(visual.animations)[0] ??
    null
  );
}
