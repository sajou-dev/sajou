/**
 * Run mode spritesheet animator.
 *
 * During run mode, entities with spritesheet visuals cycle through
 * their animation frames (idle, walk, etc.).
 *
 * Uses a RenderAdapter to slice spritesheet frames and swap them
 * on each tick, rather than directly manipulating PixiJS Sprites.
 *
 * Lifecycle:
 *   startAnimations(adapter)  — scan entities, build frames, start rAF loop
 *   stopAnimations()          — stop loop, restore original frames
 *   switchAnimation()         — change an entity's animation state mid-run
 */

import type { RenderAdapter, FrameHandle } from "../canvas/render-adapter.js";
import { getSceneState } from "../state/scene-state.js";
import { getEntityStore } from "../state/entity-store.js";
import type { SpritesheetVisual, SpriteAnimation, PlacedEntity } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tracked animation state for a single entity. */
interface AnimatedEntity {
  /** The placed entity instance ID. */
  placedId: string;
  /** The entity definition ID (for spritesheet lookup). */
  entityId: string;
  /** Pre-sliced frame handles for the active animation. */
  frames: FrameHandle[];
  /** FPS of this animation. */
  fps: number;
  /** Whether the animation loops. */
  loop: boolean;
  /** Current frame index. */
  currentFrame: number;
  /** Time accumulator (ms) since last frame change. */
  accumulator: number;
  /** The original frame to restore when stopping. */
  originalFrame: FrameHandle;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** All currently animated entities, keyed by placedId for O(1) lookup. */
const animatedEntities = new Map<string, AnimatedEntity>();

/** The active render adapter (set on start, cleared on stop). */
let activeAdapter: RenderAdapter | null = null;

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
export function startAnimations(adapter: RenderAdapter): void {
  stopAnimations(); // Clean up any previous state
  activeAdapter = adapter;

  const { entities } = getSceneState();
  const entityStore = getEntityStore();

  for (const placed of entities) {
    if (!placed.visible) continue;

    const def = entityStore.entities[placed.entityId];
    if (!def) continue;
    if (def.visual.type !== "spritesheet") continue;

    const handle = adapter.getHandle(placed.id);
    if (!handle) continue;

    const visual = def.visual as SpritesheetVisual;
    const anim = resolveAnimation(visual, placed);
    if (!anim || anim.frames.length === 0) continue;

    const frameHandles = adapter.sliceFrames(
      visual.source,
      visual.frameWidth,
      visual.frameHeight,
      anim.frames,
    );
    if (frameHandles.length < 2) continue; // No point animating a single frame

    // Capture current frame for restoration
    const originalFrame = adapter.captureFrame(placed.id);
    if (!originalFrame) continue;

    animatedEntities.set(placed.id, {
      placedId: placed.id,
      entityId: placed.entityId,
      frames: frameHandles,
      fps: anim.fps,
      loop: anim.loop !== false,
      currentFrame: 0,
      accumulator: 0,
      originalFrame,
    });

    // Set first frame immediately
    adapter.setFrame(placed.id, frameHandles[0]!);
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
 * Stop all spritesheet animations and restore original frames.
 * Call this when exiting run mode.
 */
export function stopAnimations(): void {
  // Cancel rAF
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Restore original frames
  if (activeAdapter) {
    for (const anim of animatedEntities.values()) {
      activeAdapter.restoreFrame(anim.placedId, anim.originalFrame);
    }
  }

  animatedEntities.clear();
  activeAdapter = null;
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
  if (!activeAdapter) return false;

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

  const frameHandles = activeAdapter.sliceFrames(
    visual.source,
    visual.frameWidth,
    visual.frameHeight,
    targetAnim.frames,
  );
  if (frameHandles.length === 0) return false;

  const existing = animatedEntities.get(placedId);

  if (existing) {
    // Update existing entry: swap frames, reset playback
    existing.frames = frameHandles;
    existing.fps = targetAnim.fps;
    existing.loop = targetAnim.loop !== false;
    existing.currentFrame = 0;
    existing.accumulator = 0;
    activeAdapter.setFrame(placedId, frameHandles[0]!);
  } else {
    // Entity was static — add it to the animator
    const handle = activeAdapter.getHandle(placedId);
    if (!handle) return false;

    const originalFrame = activeAdapter.captureFrame(placedId);
    if (!originalFrame) return false;

    animatedEntities.set(placedId, {
      placedId,
      entityId: placed.entityId,
      frames: frameHandles,
      fps: targetAnim.fps,
      loop: targetAnim.loop !== false,
      currentFrame: 0,
      accumulator: 0,
      originalFrame,
    });

    activeAdapter.setFrame(placedId, frameHandles[0]!);

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

    // Apply the current frame
    if (activeAdapter) {
      activeAdapter.setFrame(anim.placedId, anim.frames[anim.currentFrame]!);
    }
  }

  rafId = requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
