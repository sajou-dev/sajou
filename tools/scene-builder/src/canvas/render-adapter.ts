/**
 * Renderer adapter abstraction.
 *
 * Decouples run-mode (CommandSink, animator, bindings) from the
 * concrete rendering library (PixiJS, Three.js). Each renderer
 * implements RenderAdapter; run-mode code operates on opaque
 * DisplayObjectHandle instances instead of Sprite objects.
 *
 * Property semantics match the PlacedEntity model:
 *   - position: pixels (scene coordinates)
 *   - rotation: radians
 *   - scale: uniform or per-axis
 *   - tint: 0xRRGGBB numeric
 *   - alpha: 0–1
 */

// ---------------------------------------------------------------------------
// DisplayObjectHandle — opaque proxy for a rendered entity
// ---------------------------------------------------------------------------

/**
 * Opaque handle to a rendered display object.
 *
 * Run-mode code reads/writes properties via this interface instead
 * of accessing PixiJS Sprite or Three.js Mesh directly.
 */
export interface DisplayObjectHandle {
  /** Position in scene pixels. */
  x: number;
  y: number;

  /** Visibility. */
  visible: boolean;

  /** Opacity (0–1). */
  alpha: number;

  /** Tint color as numeric hex (0xRRGGBB). 0xffffff = no tint. */
  tint: number;

  /**
   * Per-axis scale.
   *
   * Supports both uniform `set(v)` and per-axis `set(x, y)`.
   * `x` and `y` are read/write for direction-flip logic.
   */
  scale: {
    x: number;
    y: number;
    set(x: number, y?: number): void;
  };

  /** Rotation in radians. */
  rotation: number;
}

// ---------------------------------------------------------------------------
// FrameHandle — opaque token for a sliced spritesheet frame
// ---------------------------------------------------------------------------

/**
 * Opaque token representing a single spritesheet frame.
 *
 * Created by RenderAdapter.sliceFrames(), applied by setFrame().
 * The internal data depends on the renderer: PixiJS stores a Texture,
 * Three.js stores UV coordinates.
 */
export interface FrameHandle {
  /** Discriminator for adapter-internal identification. */
  readonly __brand: "FrameHandle";
}

// ---------------------------------------------------------------------------
// RenderAdapter — renderer abstraction for run-mode
// ---------------------------------------------------------------------------

/**
 * Adapter between run-mode logic and a concrete renderer.
 *
 * Provides entity lookup, spritesheet frame management, and the
 * ability to snapshot/restore frame state for animation lifecycle.
 */
export interface RenderAdapter {
  /**
   * Resolve a placed entity ID to its display object handle.
   * Returns null if the entity has no rendered representation.
   */
  getHandle(placedId: string): DisplayObjectHandle | null;

  /**
   * Slice spritesheet frames from a cached texture.
   *
   * @param assetPath  Asset path used as texture cache key.
   * @param frameWidth  Width of a single frame in pixels.
   * @param frameHeight  Height of a single frame in pixels.
   * @param frameIndices  Array of frame indices to extract (grid layout, L→R T→B).
   * @returns Array of opaque frame handles, or empty array if texture not cached.
   */
  sliceFrames(
    assetPath: string,
    frameWidth: number,
    frameHeight: number,
    frameIndices: readonly number[],
  ): FrameHandle[];

  /**
   * Apply a sliced frame to an entity's display object.
   * Used by the animator to swap spritesheet frames.
   */
  setFrame(placedId: string, frame: FrameHandle): void;

  /**
   * Capture the current frame of a display object for later restoration.
   * Returns null if the entity has no rendered representation.
   */
  captureFrame(placedId: string): FrameHandle | null;

  /**
   * Restore a previously captured frame to a display object.
   */
  restoreFrame(placedId: string, frame: FrameHandle): void;
}
