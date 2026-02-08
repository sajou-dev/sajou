/**
 * TypeScript types for the Sajou entity visual config format.
 *
 * These types are aligned with entity-visual.schema.json — the JSON Schema
 * is the source of truth. When updating, change the schema first, then
 * update these types to match.
 */

// ---------------------------------------------------------------------------
// Source rectangle (sub-region crop)
// ---------------------------------------------------------------------------

/**
 * Sub-region crop rectangle for static sprites.
 * Defines a portion of the source image to use.
 */
export interface SourceRect {
  /** X offset in the source image (pixels). */
  readonly x: number;
  /** Y offset in the source image (pixels). */
  readonly y: number;
  /** Width of the crop region (pixels). */
  readonly w: number;
  /** Height of the crop region (pixels). */
  readonly h: number;
}

// ---------------------------------------------------------------------------
// Visual state types (discriminated union)
// ---------------------------------------------------------------------------

/**
 * A static visual state — single image, optionally cropped.
 *
 * Used for entities that don't animate in this state (buildings, arrows).
 */
export interface StaticVisualState {
  /** Discriminator: this is a static image. */
  readonly type: "static";
  /** Asset path relative to the theme's asset base path. */
  readonly asset: string;
  /** Optional sub-region crop for sprites that need a portion of the source. */
  readonly sourceRect?: SourceRect;
}

/**
 * A spritesheet visual state — animated frame sequence from a grid.
 *
 * The spritesheet is a grid of cells. A row contains one animation,
 * and `frameRow` selects which row.
 */
export interface SpritesheetVisualState {
  /** Discriminator: this is an animated spritesheet. */
  readonly type: "spritesheet";
  /** Asset path relative to the theme's asset base path. */
  readonly asset: string;
  /** Width of each frame cell in pixels. */
  readonly frameWidth: number;
  /** Height of each frame cell in pixels. */
  readonly frameHeight: number;
  /** Number of frames in this animation row. */
  readonly frameCount: number;
  /** Row index in the spritesheet grid (0-based). Default: 0. */
  readonly frameRow?: number;
  /** Playback speed in frames per second. */
  readonly fps: number;
  /** Whether the animation loops. Default: true. */
  readonly loop?: boolean;
}

/**
 * A visual state — discriminated union on the `type` field.
 *
 * Check `state.type` to narrow:
 * - `"static"` → `StaticVisualState`
 * - `"spritesheet"` → `SpritesheetVisualState`
 */
export type EntityVisualState = StaticVisualState | SpritesheetVisualState;

// ---------------------------------------------------------------------------
// Entity visual entry
// ---------------------------------------------------------------------------

/**
 * Visual configuration for a single entity.
 *
 * Defines display size, fallback color, and named visual states.
 * Every entity must have at least an `"idle"` state.
 */
export interface EntityVisualEntry {
  /** Display width in scene pixels. */
  readonly displayWidth: number;
  /** Display height in scene pixels. */
  readonly displayHeight: number;
  /** CSS hex color (e.g., '#4488ff') used as fallback when assets fail to load. */
  readonly fallbackColor: string;
  /** Named visual states. Must include at least `"idle"`. */
  readonly states: Readonly<Record<string, EntityVisualState>>;
}

// ---------------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------------

/**
 * Declarative visual configuration for all entities in a theme.
 *
 * This is the top-level structure of an `entity-visuals.json` file.
 * The `entities` map keys are entity IDs (e.g., "peon", "forge").
 */
export interface EntityVisualConfig {
  /** Map of entity ID to its visual configuration. */
  readonly entities: Readonly<Record<string, EntityVisualEntry>>;
}
