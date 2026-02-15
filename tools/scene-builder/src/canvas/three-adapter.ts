/**
 * Three.js implementation of RenderAdapter.
 *
 * Wraps Three.js entity mesh records (from scene-renderer) behind
 * DisplayObjectHandle so that run-mode code (sink, animator, bindings)
 * can operate without knowing the concrete renderer.
 *
 * Entity coordinates:
 *   - handle.x ↔ group.position.x (scene X = world X)
 *   - handle.y ↔ group.position.z (scene Y = world Z)
 *   - handle.tint ↔ material.color (numeric hex)
 *   - handle.alpha ↔ material.opacity
 *   - handle.visible ↔ group.visible
 *   - handle.scale ↔ group.scale (x = x, y = z)
 *   - handle.rotation ↔ -group.rotation.y
 */

import { setUVFrame } from "@sajou/stage";
import type {
  RenderAdapter,
  DisplayObjectHandle,
  FrameHandle,
} from "./render-adapter.js";
import type { EntityMeshRecord } from "./scene-renderer.js";

// ---------------------------------------------------------------------------
// ThreeFrameHandle — wraps UV coordinates as a FrameHandle
// ---------------------------------------------------------------------------

/** Concrete FrameHandle holding UV frame coordinates. */
interface ThreeFrameHandle extends FrameHandle {
  readonly frameX: number;
  readonly frameY: number;
  readonly frameW: number;
  readonly frameH: number;
  readonly texW: number;
  readonly texH: number;
}

/** Type guard for ThreeFrameHandle. */
function isThreeFrame(h: FrameHandle): h is ThreeFrameHandle {
  return "frameX" in h;
}

/** Create a ThreeFrameHandle from UV coordinates. */
function wrapUVFrame(
  frameX: number, frameY: number,
  frameW: number, frameH: number,
  texW: number, texH: number,
): ThreeFrameHandle {
  return {
    __brand: "FrameHandle" as const,
    frameX, frameY, frameW, frameH, texW, texH,
  };
}

// ---------------------------------------------------------------------------
// ThreeHandle — wraps EntityMeshRecord as DisplayObjectHandle
// ---------------------------------------------------------------------------

/**
 * Wraps a Three.js entity mesh record as a DisplayObjectHandle.
 *
 * Maps 2D scene coordinates (x, y) to Three.js world coordinates:
 * - handle.x ↔ group.position.x
 * - handle.y ↔ group.position.z
 * - handle.rotation ↔ -group.rotation.y (negate for 2D→3D)
 */
function wrapRecord(record: EntityMeshRecord): DisplayObjectHandle {
  const { group, material } = record;

  return {
    get x() { return group.position.x; },
    set x(v: number) { group.position.x = v; },

    get y() { return group.position.z; },
    set y(v: number) { group.position.z = v; },

    get visible() { return group.visible; },
    set visible(v: boolean) { group.visible = v; },

    get alpha() { return material.opacity; },
    set alpha(v: number) { material.opacity = v; },

    get tint() {
      return material.color.getHex();
    },
    set tint(v: number) {
      material.color.setHex(v);
    },

    scale: {
      get x() { return group.scale.x; },
      set x(v: number) { group.scale.x = v; },
      get y() { return group.scale.z; },
      set y(v: number) { group.scale.z = v; },
      set(x: number, y?: number) {
        group.scale.x = x;
        group.scale.z = y ?? x;
      },
    },

    get rotation() { return -group.rotation.y; },
    set rotation(v: number) { group.rotation.y = -v; },
  };
}

// ---------------------------------------------------------------------------
// ThreeAdapter
// ---------------------------------------------------------------------------

/** Resolve an entity mesh record by placed entity ID. */
type RecordResolver = (placedId: string) => EntityMeshRecord | null;

/** Resolve a cached Three.js texture size by asset path. */
type TextureSizeResolver = (assetPath: string) => { width: number; height: number } | null;

/**
 * Create a RenderAdapter backed by Three.js entity mesh records.
 *
 * @param getRecord  Resolve placedId → EntityMeshRecord (from scene-renderer).
 * @param getTexSize  Resolve assetPath → texture dimensions.
 */
export function createThreeAdapter(
  getRecord: RecordResolver,
  getTexSize: TextureSizeResolver,
): RenderAdapter {
  /** Cache: placedId → wrapped handle. */
  const handleCache = new Map<string, DisplayObjectHandle>();

  return {
    getHandle(placedId: string): DisplayObjectHandle | null {
      const record = getRecord(placedId);
      if (!record) {
        handleCache.delete(placedId);
        return null;
      }

      let handle = handleCache.get(placedId);
      if (!handle) {
        handle = wrapRecord(record);
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
      const texSize = getTexSize(assetPath);
      if (!texSize) return [];

      const cols = frameWidth > 0 ? Math.floor(texSize.width / frameWidth) : 0;
      if (cols === 0) return [];

      const frames: FrameHandle[] = [];
      for (const idx of frameIndices) {
        const fx = (idx % cols) * frameWidth;
        const fy = Math.floor(idx / cols) * frameHeight;

        if (fx + frameWidth > texSize.width || fy + frameHeight > texSize.height) {
          continue;
        }

        frames.push(wrapUVFrame(
          fx, fy, frameWidth, frameHeight,
          texSize.width, texSize.height,
        ));
      }
      return frames;
    },

    setFrame(placedId: string, frame: FrameHandle): void {
      const record = getRecord(placedId);
      if (!record || !isThreeFrame(frame)) return;
      setUVFrame(
        record.mesh,
        frame.frameX, frame.frameY,
        frame.frameW, frame.frameH,
        frame.texW, frame.texH,
      );
    },

    captureFrame(placedId: string): FrameHandle | null {
      const record = getRecord(placedId);
      if (!record) return null;

      // Read current UV coordinates from geometry
      const uv = record.mesh.geometry.getAttribute("uv");
      if (!uv) return null;

      // Reconstruct frame rect from UV values
      // PlaneGeometry UVs: BL(u0,v0), BR(u1,v0), TL(u0,v1), TR(u1,v1)
      const u0 = uv.getX(0);
      const v0 = uv.getY(0);
      const u1 = uv.getX(1);
      const v1 = uv.getY(2);

      // We need the texture dimensions to convert back to pixels
      // Try to find them from the material's map
      const map = record.material.map;
      if (!map?.image) {
        // No texture — return a generic full-frame handle
        return wrapUVFrame(0, 0, 1, 1, 1, 1);
      }

      const texW = (map.image as HTMLImageElement).naturalWidth || map.image.width;
      const texH = (map.image as HTMLImageElement).naturalHeight || map.image.height;

      const frameX = u0 * texW;
      const frameY = (1 - v1) * texH;
      const frameW = (u1 - u0) * texW;
      const frameH = (v1 - v0) * texH;

      return wrapUVFrame(frameX, frameY, frameW, frameH, texW, texH);
    },

    restoreFrame(placedId: string, frame: FrameHandle): void {
      const record = getRecord(placedId);
      if (!record || !isThreeFrame(frame)) return;
      setUVFrame(
        record.mesh,
        frame.frameX, frame.frameY,
        frame.frameW, frame.frameH,
        frame.texW, frame.texH,
      );
    },
  };
}
