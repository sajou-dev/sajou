/**
 * PixiJS implementation of RenderAdapter.
 *
 * Wraps PixiJS Sprite instances behind DisplayObjectHandle so that
 * run-mode code (sink, animator, bindings) can operate without
 * importing pixi.js directly.
 */

import { Texture, Rectangle } from "pixi.js";
import type { Sprite } from "pixi.js";
import type {
  RenderAdapter,
  DisplayObjectHandle,
  FrameHandle,
} from "./render-adapter.js";

// ---------------------------------------------------------------------------
// PixiFrameHandle — wraps a PixiJS Texture as a FrameHandle
// ---------------------------------------------------------------------------

/** Concrete FrameHandle holding a PixiJS Texture. */
interface PixiFrameHandle extends FrameHandle {
  readonly texture: Texture;
}

/** Type guard for PixiFrameHandle. */
function isPixiFrame(h: FrameHandle): h is PixiFrameHandle {
  return "texture" in h;
}

/** Create a PixiFrameHandle from a Texture. */
function wrapTexture(texture: Texture): PixiFrameHandle {
  return { __brand: "FrameHandle" as const, texture };
}

// ---------------------------------------------------------------------------
// PixiHandle — wraps a Sprite as DisplayObjectHandle
// ---------------------------------------------------------------------------

/**
 * Wraps a PixiJS Sprite as a DisplayObjectHandle.
 *
 * Property reads/writes delegate directly to the Sprite.
 * The wrapper is a lightweight proxy — no cloning or caching.
 */
function wrapSprite(sprite: Sprite): DisplayObjectHandle {
  return {
    get x() { return sprite.x; },
    set x(v: number) { sprite.x = v; },

    get y() { return sprite.y; },
    set y(v: number) { sprite.y = v; },

    get visible() { return sprite.visible; },
    set visible(v: boolean) { sprite.visible = v; },

    get alpha() { return sprite.alpha; },
    set alpha(v: number) { sprite.alpha = v; },

    get tint() { return sprite.tint as number; },
    set tint(v: number) { sprite.tint = v; },

    scale: {
      get x() { return sprite.scale.x; },
      set x(v: number) { sprite.scale.x = v; },
      get y() { return sprite.scale.y; },
      set y(v: number) { sprite.scale.y = v; },
      set(x: number, y?: number) { sprite.scale.set(x, y ?? x); },
    },

    get rotation() { return sprite.rotation; },
    set rotation(v: number) { sprite.rotation = v; },
  };
}

// ---------------------------------------------------------------------------
// PixiAdapter
// ---------------------------------------------------------------------------

/** Resolve a PixiJS Sprite by placed entity ID. */
type SpriteResolver = (placedId: string) => Sprite | null;

/** Resolve a cached base texture by asset path. */
type TextureResolver = (assetPath: string) => Texture | null;

/**
 * Create a RenderAdapter backed by PixiJS Sprites.
 *
 * @param getSprite  Resolve placedId → Sprite (from scene-renderer).
 * @param getTexture  Resolve assetPath → cached base Texture.
 */
export function createPixiAdapter(
  getSprite: SpriteResolver,
  getTexture: TextureResolver,
): RenderAdapter {
  /** Cache: placedId → wrapped handle (avoids re-creating per access). */
  const handleCache = new Map<string, DisplayObjectHandle>();

  return {
    getHandle(placedId: string): DisplayObjectHandle | null {
      // Check if sprite still exists (it might have been destroyed)
      const sprite = getSprite(placedId);
      if (!sprite) {
        handleCache.delete(placedId);
        return null;
      }

      let handle = handleCache.get(placedId);
      if (!handle) {
        handle = wrapSprite(sprite);
        handleCache.set(placedId, handle);
      }
      return handle;
    },

    sliceFrames(
      assetPath: string,
      frameWidth: number,
      frameHeight: number,
      frameIndices: readonly number[],
    ): FrameHandle[] {
      const sheetTex = getTexture(assetPath);
      if (!sheetTex) return [];

      const cols = frameWidth > 0 ? Math.floor(sheetTex.width / frameWidth) : 0;
      if (cols === 0) return [];

      const frames: FrameHandle[] = [];
      for (const idx of frameIndices) {
        const fx = (idx % cols) * frameWidth;
        const fy = Math.floor(idx / cols) * frameHeight;

        // Bounds check
        if (fx + frameWidth > sheetTex.width || fy + frameHeight > sheetTex.height) {
          continue;
        }

        frames.push(
          wrapTexture(
            new Texture({
              source: sheetTex.source,
              frame: new Rectangle(fx, fy, frameWidth, frameHeight),
            }),
          ),
        );
      }
      return frames;
    },

    setFrame(placedId: string, frame: FrameHandle): void {
      const sprite = getSprite(placedId);
      if (!sprite || !isPixiFrame(frame)) return;
      sprite.texture = frame.texture;
    },

    captureFrame(placedId: string): FrameHandle | null {
      const sprite = getSprite(placedId);
      if (!sprite) return null;
      return wrapTexture(sprite.texture);
    },

    restoreFrame(placedId: string, frame: FrameHandle): void {
      const sprite = getSprite(placedId);
      if (!sprite || !isPixiFrame(frame)) return;
      sprite.texture = frame.texture;
    },
  };
}
