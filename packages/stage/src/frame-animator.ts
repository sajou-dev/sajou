/**
 * Frame animator for spritesheet-based sprites.
 *
 * Cycles UV frames on sprite meshes using an accumulator pattern.
 * Each animated entity tracks its own FPS, frame list, and timing.
 * Call tick(dt) every frame to advance all animations.
 */

import type * as THREE from "three";
import { setUVFrame } from "./sprite-mesh.js";

/** Frame definition for animation. */
export interface FrameDef {
  /** Frame X position in pixels. */
  readonly x: number;
  /** Frame Y position in pixels. */
  readonly y: number;
  /** Frame width in pixels. */
  readonly w: number;
  /** Frame height in pixels. */
  readonly h: number;
}

/** Animation state for a single entity. */
export interface AnimationState {
  /** The mesh to animate. */
  readonly mesh: THREE.Mesh;
  /** Computed frames (pixel rects). */
  readonly frames: readonly FrameDef[];
  /** Texture width in pixels. */
  readonly texW: number;
  /** Texture height in pixels. */
  readonly texH: number;
  /** Frames per second. */
  fps: number;
  /** Whether to loop. */
  loop: boolean;
  /** Current frame index. */
  currentFrame: number;
  /** Time accumulator in ms. */
  accumulator: number;
}

/**
 * Frame animator — manages spritesheet UV cycling for multiple entities.
 */
export class FrameAnimator {
  private readonly animations = new Map<string, AnimationState>();

  /**
   * Register an animation for an entity.
   *
   * @param id  Unique identifier (entity ID).
   * @param mesh  The sprite mesh to animate.
   * @param frames  Array of frame pixel rects.
   * @param texW  Texture width in pixels.
   * @param texH  Texture height in pixels.
   * @param fps  Animation speed.
   * @param loop  Whether to loop.
   */
  add(
    id: string,
    mesh: THREE.Mesh,
    frames: readonly FrameDef[],
    texW: number,
    texH: number,
    fps: number,
    loop: boolean,
  ): void {
    this.animations.set(id, {
      mesh,
      frames,
      texW,
      texH,
      fps,
      loop,
      currentFrame: 0,
      accumulator: 0,
    });

    // Set initial frame
    if (frames.length > 0) {
      const f = frames[0]!;
      setUVFrame(mesh, f.x, f.y, f.w, f.h, texW, texH);
    }
  }

  /** Remove an animation. */
  remove(id: string): void {
    this.animations.delete(id);
  }

  /** Check if an entity has an active animation. */
  has(id: string): boolean {
    return this.animations.has(id);
  }

  /**
   * Switch an entity's animation to new frames.
   * Resets playback to frame 0.
   */
  switchFrames(
    id: string,
    frames: readonly FrameDef[],
    fps: number,
    loop: boolean,
  ): void {
    const anim = this.animations.get(id);
    if (!anim) return;

    anim.fps = fps;
    anim.loop = loop;
    anim.currentFrame = 0;
    anim.accumulator = 0;

    // TypeScript: we need to cast because readonly
    (anim as { frames: readonly FrameDef[] }).frames = frames;

    if (frames.length > 0) {
      const f = frames[0]!;
      setUVFrame(anim.mesh, f.x, f.y, f.w, f.h, anim.texW, anim.texH);
    }
  }

  /**
   * Advance all animations by the given delta time.
   *
   * @param dt  Delta time in milliseconds since last tick.
   */
  tick(dt: number): void {
    for (const anim of this.animations.values()) {
      if (anim.frames.length < 2) continue;

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

      const f = anim.frames[anim.currentFrame]!;
      setUVFrame(anim.mesh, f.x, f.y, f.w, f.h, anim.texW, anim.texH);
    }
  }

  /** Remove all animations. */
  clear(): void {
    this.animations.clear();
  }

  /** Number of active animations. */
  get size(): number {
    return this.animations.size;
  }
}
