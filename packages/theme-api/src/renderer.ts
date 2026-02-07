/**
 * Theme renderer interfaces for Sajou.
 *
 * A theme renderer is the bridge between the choreographer (which speaks
 * in abstract actions: move, spawn, flash) and the actual visual output
 * (which depends on the theme's rendering stack: PixiJS, Three.js, Canvas2D).
 *
 * The choreographer calls methods on ThemeRenderer. The theme implements
 * them using its chosen technology. The choreographer never knows what
 * rendering library is used.
 */

import type { EntityDefinition } from "./entity.js";

// ---------------------------------------------------------------------------
// Geometry types — shared coordinate system
// ---------------------------------------------------------------------------

/**
 * A 2D position in scene coordinates.
 * The coordinate system is defined by the theme's layout.
 */
export interface Position {
  /** Horizontal position. */
  readonly x: number;
  /** Vertical position. */
  readonly y: number;
}

/**
 * Style options for beam rendering (`drawBeam` primitive).
 */
export interface BeamStyle {
  /** Beam color as CSS color string. */
  readonly color?: string;
  /** Beam width in scene units. */
  readonly width?: number;
  /** Visual style variant. */
  readonly variant?: "solid" | "dashed" | "glow";
}

// ---------------------------------------------------------------------------
// Entity handle — opaque reference to a spawned entity instance
// ---------------------------------------------------------------------------

/**
 * An opaque handle to a live entity instance in the scene.
 *
 * Created by `spawnEntity`, passed to action methods like `move` and `destroy`.
 * The handle is owned by the theme renderer — the choreographer treats it
 * as an opaque token.
 */
export interface EntityHandle {
  /** Unique instance ID (e.g., "peon-42"). */
  readonly instanceId: string;
  /** The entity definition this instance was created from. */
  readonly definition: EntityDefinition;
}

// ---------------------------------------------------------------------------
// Theme renderer — the primitive execution contract
// ---------------------------------------------------------------------------

/**
 * The rendering contract that every Sajou theme must implement.
 *
 * Each method corresponds to a choreographer primitive. The choreographer
 * calls these methods in sequence (respecting timing and chaining) and
 * the theme renders the result.
 *
 * Methods that represent animations return a Promise that resolves when
 * the animation completes. This lets the choreographer chain actions
 * (e.g., move then flash) and handle interruptions.
 */
export interface ThemeRenderer {
  // --- Lifecycle ---

  /**
   * Initialize the renderer. Called once before any actions.
   * Use this to set up the rendering context (canvas, WebGL, etc.).
   */
  init(): Promise<void>;

  /**
   * Tear down the renderer. Called when the theme is unloaded.
   * Release all resources (textures, sounds, DOM nodes).
   */
  dispose(): void;

  /**
   * Called every frame by the host. The renderer should update
   * animations and redraw the scene.
   *
   * @param deltaMs - Milliseconds since the last tick.
   */
  tick(deltaMs: number): void;

  // --- Entity management ---

  /**
   * Spawn a new entity instance in the scene.
   *
   * @param entityId - The entity definition ID from the theme manifest.
   * @param position - Where to place the entity.
   * @param instanceId - Optional explicit instance ID. If omitted, the renderer generates one.
   * @returns A handle to the spawned instance.
   */
  spawnEntity(
    entityId: string,
    position: Position,
    instanceId?: string,
  ): EntityHandle;

  /**
   * Remove an entity instance from the scene.
   * The handle becomes invalid after this call.
   */
  destroyEntity(handle: EntityHandle): void;

  // --- Choreographer primitives ---

  /**
   * Move an entity to a new position over time.
   * Resolves when the entity reaches the destination.
   */
  move(
    handle: EntityHandle,
    to: Position,
    duration: number,
    easing?: string,
  ): Promise<void>;

  /**
   * Move an entity along a trajectory (arc, bezier, line).
   * Used for projectiles, messengers, flying objects.
   * Resolves when the entity arrives.
   */
  fly(
    handle: EntityHandle,
    to: Position,
    duration: number,
    easing?: string,
  ): Promise<void>;

  /**
   * Flash a visual effect on an entity or position.
   * Resolves when the flash animation completes.
   */
  flash(
    target: EntityHandle | Position,
    color: string,
    duration: number,
  ): Promise<void>;

  /**
   * Pulse a visual effect repeatedly on an entity or position.
   * Resolves after all repetitions complete.
   */
  pulse(
    target: EntityHandle | Position,
    color: string,
    duration: number,
    repeat: number,
  ): Promise<void>;

  /**
   * Draw a visual beam connecting two points.
   * Resolves when the beam animation completes.
   */
  drawBeam(
    from: Position,
    to: Position,
    duration: number,
    style?: BeamStyle,
  ): Promise<void>;

  /**
   * Display text progressively (typewriter effect).
   * Resolves when all text is displayed.
   */
  typeText(
    text: string,
    position: Position,
    speed: number,
  ): Promise<void>;

  /**
   * Play a sound effect.
   * Fire-and-forget — does not block the choreography sequence.
   */
  playSound(sound: string, volume?: number): void;

  /**
   * Set the animation state of an entity (e.g., "walk", "idle", "die").
   * The theme resolves the animation name to the correct visual representation
   * based on the entity's visual type.
   */
  setAnimation(handle: EntityHandle, animationName: string): void;
}
