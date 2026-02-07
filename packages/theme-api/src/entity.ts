/**
 * Declarative entity format for Sajou themes.
 *
 * An entity is a visual thing that exists in the scene: a character, a building,
 * a particle effect, a beam of light. Entities are declared in JSON by themes
 * and referenced by ID in choreographies.
 *
 * Design: ADR-002 — Layered format with visual type nesting.
 */

// ---------------------------------------------------------------------------
// Visual types — discriminated union on `type` field
// ---------------------------------------------------------------------------

/**
 * The set of visual representation types supported by the entity format.
 * Themes declare which types they support in their capabilities.
 */
export type VisualType = "sprite" | "spritesheet" | "model3d" | "particle";

/**
 * A static image entity (PNG, SVG, WebP).
 * Simplest visual type — a single image with no animation frames.
 */
export interface SpriteVisual {
  /** Discriminator for visual type. */
  readonly type: "sprite";
  /** Path to the image asset, relative to the theme's asset root. */
  readonly source: string;
}

/**
 * A frame sequence for a spritesheet animation.
 */
export interface SpriteAnimation {
  /** Ordered frame indices from the spritesheet. */
  readonly frames: readonly number[];
  /** Playback speed in frames per second. */
  readonly fps: number;
  /** Whether the animation loops. Defaults to true. */
  readonly loop?: boolean;
}

/**
 * An animated entity using a spritesheet atlas.
 * Each named animation is a sequence of frames from the sheet.
 */
export interface SpritesheetVisual {
  /** Discriminator for visual type. */
  readonly type: "spritesheet";
  /** Path to the spritesheet image, relative to asset root. */
  readonly source: string;
  /** Width of a single frame in pixels. */
  readonly frameWidth: number;
  /** Height of a single frame in pixels. */
  readonly frameHeight: number;
  /** Named animations defined as frame sequences. */
  readonly animations: Readonly<Record<string, SpriteAnimation>>;
}

/**
 * A clip reference for a 3D model animation.
 */
export interface ModelAnimation {
  /** Name of the animation clip in the glTF file. */
  readonly clip: string;
  /** Whether the animation loops. Defaults to true. */
  readonly loop?: boolean;
}

/**
 * A 3D model entity (glTF/GLB).
 * Supports skeletal animations referenced by clip name.
 */
export interface Model3dVisual {
  /** Discriminator for visual type. */
  readonly type: "model3d";
  /** Path to the glTF/GLB file, relative to asset root. */
  readonly source: string;
  /** Named animations referencing clips in the model. */
  readonly animations?: Readonly<Record<string, ModelAnimation>>;
}

/**
 * Configuration for a particle emitter.
 */
export interface ParticleEmitterConfig {
  /** Maximum number of particles alive at once. */
  readonly maxParticles: number;
  /** Particle lifetime in milliseconds. */
  readonly lifetime: number;
  /** Emission rate in particles per second. */
  readonly rate: number;
  /** Particle speed range [min, max]. */
  readonly speed: readonly [number, number];
  /** Particle scale range [min, max]. */
  readonly scale?: readonly [number, number];
  /** Start color as CSS color string. */
  readonly startColor?: string;
  /** End color as CSS color string. */
  readonly endColor?: string;
  /** Particle sprite source, relative to asset root. If omitted, renderer uses default. */
  readonly sprite?: string;
}

/**
 * A particle system entity.
 * Rendered as an emitter that spawns and manages particles.
 */
export interface ParticleVisual {
  /** Discriminator for visual type. */
  readonly type: "particle";
  /** Particle emitter configuration. */
  readonly emitter: ParticleEmitterConfig;
}

/**
 * Discriminated union of all visual representations.
 * Dispatch on `visual.type` to determine the rendering strategy.
 */
export type EntityVisual =
  | SpriteVisual
  | SpritesheetVisual
  | Model3dVisual
  | ParticleVisual;

// ---------------------------------------------------------------------------
// Entity defaults — shared by all visual types
// ---------------------------------------------------------------------------

/**
 * Default presentation properties for an entity.
 * Applied on spawn, can be overridden by choreography actions.
 */
export interface EntityDefaults {
  /** Scale factor. 1.0 is original size. */
  readonly scale?: number;
  /** Anchor point as [x, y] normalized (0–1). [0.5, 1.0] = bottom-center. */
  readonly anchor?: readonly [number, number];
  /** Drawing order. Higher values render on top. */
  readonly zIndex?: number;
  /** Initial opacity (0–1). */
  readonly opacity?: number;
}

// ---------------------------------------------------------------------------
// Entity definition — the full declarative format
// ---------------------------------------------------------------------------

/**
 * A complete entity definition as declared in a theme manifest.
 *
 * The entity format uses a layered approach (ADR-002):
 * - **Identity**: `id`, `tags` — how the choreographer references this entity
 * - **Presentation**: `defaults` — shared layout/placement properties
 * - **Visual**: `visual` — type-specific rendering data (sprite, spritesheet, model3d, particle)
 * - **Audio**: `sounds` — event-keyed sound effects
 *
 * @example
 * ```json
 * {
 *   "id": "peon",
 *   "tags": ["unit", "worker"],
 *   "defaults": { "scale": 1.0, "anchor": [0.5, 1.0], "zIndex": 10 },
 *   "visual": {
 *     "type": "spritesheet",
 *     "source": "entities/peon-sheet.png",
 *     "frameWidth": 64,
 *     "frameHeight": 64,
 *     "animations": {
 *       "idle": { "frames": [0], "fps": 1 },
 *       "walk": { "frames": [0, 1, 2, 3], "fps": 12, "loop": true }
 *     }
 *   },
 *   "sounds": { "spawn": "sfx/peon-ready.ogg" }
 * }
 * ```
 */
export interface EntityDefinition {
  /** Unique entity identifier within the theme. Referenced by choreographies. */
  readonly id: string;
  /** Tags for group targeting (e.g., `"entity": "tag:worker"`). */
  readonly tags?: readonly string[];
  /** Default presentation properties. */
  readonly defaults?: EntityDefaults;
  /** Visual representation — discriminated union on `visual.type`. */
  readonly visual: EntityVisual;
  /** Sound effects keyed by event name (spawn, die, hit, etc.). Values are asset paths. */
  readonly sounds?: Readonly<Record<string, string>>;
}
