/**
 * TypeScript types for the Stage scene format.
 *
 * Describes a complete Stage scene: board layout, zones, slots,
 * entities, lighting, and particles. All declarative — parsed by
 * both the Godot Stage and the TypeScript host.
 *
 * Aligned with stage-scene.schema.json — the JSON Schema is the source of truth.
 */

import type { BoardPosition, BoardBounds } from "./signal-types.js";

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

/** Top-level Stage scene description. */
export interface StageScene {
  /** Board layout and zones. */
  readonly board: StageBoard;
  /** Lighting configuration. */
  readonly lighting?: StageLightingConfig;
  /** Particle system definitions. */
  readonly particles?: Readonly<Record<string, StageParticleSystem>>;
  /** Entity placements. */
  readonly entities?: readonly StageEntity[];
}

/** The board — the spatial container for zones and entities. */
export interface StageBoard {
  /** Projection type. */
  readonly projection: "isometric" | "top-down";
  /** Camera angle in degrees (isometric default: 45). */
  readonly angle?: number;
  /** Named zones on the board. */
  readonly zones: readonly StageZone[];
}

/** A named region on the board with spatial bounds and ambiance. */
export interface StageZone {
  /** Unique zone identifier. */
  readonly id: string;
  /** Display label. */
  readonly label?: string;
  /** Elevation level (0 = ground). Higher values render above. */
  readonly elevation?: number;
  /** Spatial bounds on the board. */
  readonly bounds: BoardBounds;
  /** Ambient effects for this zone. */
  readonly ambiance?: StageZoneAmbiance;
  /** Named slots where entities can be placed. */
  readonly slots?: readonly StageSlot[];
  /** Connections to other zones (stairs, bridges, portals). */
  readonly connections?: readonly StageZoneConnection[];
}

/** A position within a zone where an entity can be placed. */
export interface StageSlot {
  /** Unique slot identifier. */
  readonly id: string;
  /** Position relative to the board origin. */
  readonly position: BoardPosition;
  /** Semantic role (e.g., "workstation", "standing", "guard_post"). */
  readonly role?: string;
}

/** Ambient effects for a zone — lighting mood, particles, sound. */
export interface StageZoneAmbiance {
  /** Lighting mood (references a lighting preset or descriptor). */
  readonly lighting?: string;
  /** Particle system key (references a key in StageScene.particles). */
  readonly particles?: string;
  /** Looping ambient sound identifier. */
  readonly soundLoop?: string;
}

/** Connection between two zones (stairs, bridge, portal). */
export interface StageZoneConnection {
  /** Target zone ID. */
  readonly to: string;
  /** Connection type. */
  readonly type: "stairs" | "bridge" | "portal" | "path";
  /** Path identifier for navigation. */
  readonly path?: string;
}

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

/** Complete lighting configuration for a scene. */
export interface StageLightingConfig {
  /** Global directional light. */
  readonly global?: StageLightGlobal;
  /** Point and spot light sources. */
  readonly sources?: readonly StageLightSource[];
}

/** Global directional light (sun, moon). */
export interface StageLightGlobal {
  /** Light type. */
  readonly type: "directional";
  /** Compass angle in degrees (0 = north, 90 = east). */
  readonly angle: number;
  /** Elevation angle in degrees above horizon. */
  readonly elevation: number;
  /** Light color as CSS hex. */
  readonly color: string;
  /** Intensity multiplier (1.0 = normal). */
  readonly intensity: number;
}

/** A positioned light source (torch, fire, lamp). */
export interface StageLightSource {
  /** Unique light identifier. */
  readonly id: string;
  /** Light type. */
  readonly type: "point" | "spot";
  /** Position on the board. */
  readonly position: BoardPosition;
  /** Light color as CSS hex. */
  readonly color: string;
  /** Intensity multiplier. */
  readonly intensity: number;
  /** Radius of effect in board units. */
  readonly radius: number;
  /** Optional flicker effect. */
  readonly flicker?: StageLightFlicker;
}

/** Flicker parameters for dynamic lights (torches, fires). */
export interface StageLightFlicker {
  /** Flicker speed (oscillations per second). */
  readonly speed: number;
  /** Flicker amount (0–1, fraction of intensity). */
  readonly amount: number;
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

/** A particle system definition. */
export interface StageParticleSystem {
  /** Emitter attachment — "zone:<id>" or "entity:<id>". */
  readonly emitter: string;
  /** Particle sprite path. */
  readonly sprite: string;
  /** Emitter type. Defaults to "radial". */
  readonly type?: "radial" | "directional";
  /** Max simultaneous particles. */
  readonly count: number;
  /** Particle lifetime range in seconds [min, max]. */
  readonly lifetime: readonly [number, number];
  /** Velocity range (for radial: per-axis min/max). */
  readonly velocity?: {
    readonly x: readonly [number, number];
    readonly y: readonly [number, number];
  };
  /** Direction vector (for directional emitters). */
  readonly direction?: BoardPosition;
  /** Speed range (for directional emitters) [min, max]. */
  readonly speed?: readonly [number, number];
  /** Color gradient over lifetime (CSS hex values). */
  readonly colorOverLife?: readonly string[];
  /** Particle size range [min, max]. */
  readonly size?: readonly [number, number];
  /** Whether particles glow (additive blending). */
  readonly glow?: boolean;
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** An entity placed on the Stage board. */
export interface StageEntity {
  /** Unique entity identifier. */
  readonly id: string;
  /** Display name. */
  readonly displayName?: string;
  /** Rig type for animation system. */
  readonly rig?: "humanoid" | "quadruped" | "flying" | "mechanical" | "static";
  /** Visual configuration. */
  readonly visual: StageEntityVisual;
  /** Available user interactions. */
  readonly interactions?: readonly StageEntityInteraction[];
  /** Slot this entity occupies. */
  readonly slot?: string;
  /** Current state (driven by agent signals). */
  readonly state?: string;
}

/** Visual properties for a Stage entity. */
export interface StageEntityVisual {
  /** Path to the spritesheet. */
  readonly spritesheet: string;
  /** Optional normal map for dynamic lighting. */
  readonly normalMap?: string;
  /** Frame dimensions [width, height] in pixels. */
  readonly frameSize: readonly [number, number];
  /** Named animations mapped to frame ranges. */
  readonly animations: Readonly<Record<string, StageEntityAnimation>>;
}

/** A named animation within an entity's spritesheet. */
export interface StageEntityAnimation {
  /** Frame indices in the spritesheet. */
  readonly frames: readonly number[];
  /** Playback speed in frames per second. */
  readonly fps: number;
  /** Whether the animation loops. Defaults to true. */
  readonly loop?: boolean;
}

/** An interaction the user can perform on an entity. */
export interface StageEntityInteraction {
  /** Interaction trigger type. */
  readonly type: "click" | "context_menu" | "drag";
  /** Signal type to emit (for click/drag). */
  readonly signal?: string;
  /** Display label. */
  readonly label?: string;
  /** Drag mode (for drag interactions). */
  readonly mode?: "drag_to_slot" | "drag_free";
  /** Context menu options (for context_menu type). */
  readonly options?: readonly StageContextMenuOption[];
}

/** A single option in a context menu. */
export interface StageContextMenuOption {
  /** Display label. */
  readonly label: string;
  /** Signal type to emit. */
  readonly signal: string;
  /** Drag mode if this option involves movement. */
  readonly mode?: "drag_to_slot" | "drag_free";
}
