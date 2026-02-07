/**
 * PixiCommandSink — translates choreographer commands into PixiJS visuals.
 *
 * Implements the `CommandSink` interface from `@sajou/core`. Receives
 * frame-by-frame progress updates from the choreographer and moves
 * placeholder rectangles accordingly.
 *
 * V1 uses colored rectangles as entity placeholders (no sprites yet).
 */

import { Graphics, Container } from "pixi.js";
import type { Application } from "pixi.js";
import type {
  CommandSink,
  ActionStartCommand,
  ActionUpdateCommand,
  ActionCompleteCommand,
  ActionExecuteCommand,
  InterruptCommand,
} from "@sajou/core";
import type { ThemeManifest } from "@sajou/theme-api";

// ---------------------------------------------------------------------------
// Entity visual definitions (placeholder rects for V1)
// ---------------------------------------------------------------------------

/** Color and size for placeholder entity visuals. */
interface EntityVisualDef {
  readonly width: number;
  readonly height: number;
  readonly color: number;
}

/** Placeholder visual definitions keyed by entity name. */
const ENTITY_VISUALS: Readonly<Record<string, EntityVisualDef>> = {
  peon:        { width: 32, height: 32, color: 0x4488ff },
  pigeon:      { width: 16, height: 16, color: 0xffffff },
  forge:       { width: 48, height: 48, color: 0x8b4513 },
  oracle:      { width: 64, height: 64, color: 0x9933cc },
  "gold-coins": { width: 12, height: 12, color: 0xffd700 },
  explosion:   { width: 20, height: 20, color: 0xff3300 },
};

/** Default visual for unknown entities. */
const DEFAULT_VISUAL: EntityVisualDef = { width: 24, height: 24, color: 0x888888 };

// ---------------------------------------------------------------------------
// Animation state for in-flight actions
// ---------------------------------------------------------------------------

/** Tracks the start and target positions for an animated move/fly action. */
interface AnimState {
  readonly startX: number;
  readonly startY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly action: string;
}

// ---------------------------------------------------------------------------
// Position alias map — semantic names → layout positions
// ---------------------------------------------------------------------------

/**
 * Maps signal payload values (like "orchestrator", "agent-solver") to
 * layout position keys (like "oracle", "center").
 *
 * Configurable at construction time.
 */
export type PositionAliasMap = Readonly<Record<string, string>>;

/** Default aliases for the Citadel theme's simple-task scenario. */
const DEFAULT_ALIASES: PositionAliasMap = {
  orchestrator: "oracle",
  "agent-solver": "center",
};

// ---------------------------------------------------------------------------
// PixiCommandSink
// ---------------------------------------------------------------------------

/**
 * A `CommandSink` that renders choreographer commands using PixiJS.
 *
 * Entities are colored rectangles positioned on the stage. Animated actions
 * (move, fly, flash) interpolate per-frame using the progress value from
 * the choreographer.
 *
 * @example
 * ```ts
 * const app = new Application();
 * await app.init({ width: 800, height: 600 });
 * const sink = new PixiCommandSink(app, citadelManifest);
 * const choreographer = new Choreographer({ clock, sink });
 * ```
 */
export class PixiCommandSink implements CommandSink {
  private readonly app: Application;
  private readonly manifest: ThemeManifest;
  private readonly aliases: PositionAliasMap;

  /** Spawned entity visuals, keyed by entityRef. */
  private readonly entities = new Map<string, Container>();

  /** In-flight animation state, keyed by `${performanceId}:${entityRef}`. */
  private readonly activeAnimations = new Map<string, AnimState>();

  constructor(
    app: Application,
    manifest: ThemeManifest,
    aliases?: PositionAliasMap,
  ) {
    this.app = app;
    this.manifest = manifest;
    this.aliases = aliases ?? DEFAULT_ALIASES;
  }

  // =========================================================================
  // CommandSink implementation
  // =========================================================================

  /** Handle the start of an animated action (move, fly, flash). */
  onActionStart(command: ActionStartCommand): void {
    const { action, entityRef, params, performanceId } = command;

    if (action === "move" || action === "fly") {
      this.handleMoveStart(performanceId, entityRef, params);
      return;
    }

    if (action === "flash") {
      this.handleFlashStart(entityRef, params);
      return;
    }

    // wait and other animated actions: no-op visual
  }

  /** Handle a frame update for an animated action. */
  onActionUpdate(command: ActionUpdateCommand): void {
    const { action, entityRef, progress, performanceId } = command;

    if (action === "move" || action === "fly") {
      this.handleMoveUpdate(performanceId, entityRef, progress, action);
      return;
    }

    if (action === "flash") {
      this.handleFlashUpdate(entityRef, progress);
      return;
    }
  }

  /** Handle completion of an animated action. */
  onActionComplete(command: ActionCompleteCommand): void {
    const { action, entityRef, performanceId } = command;

    if (action === "move" || action === "fly") {
      this.handleMoveComplete(performanceId, entityRef);
      return;
    }

    if (action === "flash") {
      this.handleFlashComplete(entityRef);
      return;
    }
  }

  /** Handle an instant action (spawn, destroy, playSound). */
  onActionExecute(command: ActionExecuteCommand): void {
    const { action, entityRef, params } = command;

    if (action === "spawn") {
      this.handleSpawn(entityRef, params);
      return;
    }

    if (action === "destroy") {
      this.handleDestroy(entityRef);
      return;
    }

    // playSound: no-op in V1 (no audio system yet)
  }

  /** Handle a performance interruption. */
  onInterrupt(_command: InterruptCommand): void {
    // No-op for V1 — could flash red or shake the screen
  }

  // =========================================================================
  // Position resolution
  // =========================================================================

  /**
   * Resolve a semantic name to pixel coordinates.
   *
   * Resolution order:
   * 1. Direct layout position match (e.g., "oracle" → {x:400, y:80})
   * 2. Alias map (e.g., "orchestrator" → "oracle" → {x:400, y:80})
   * 3. Fallback: scene center
   */
  resolvePosition(name: string): { x: number; y: number } {
    const positions = this.manifest.layout.positions;

    // Direct match
    const direct = positions[name];
    if (direct) {
      return { x: direct.x, y: direct.y };
    }

    // Alias
    const aliasKey = this.aliases[name];
    if (aliasKey) {
      const aliased = positions[aliasKey];
      if (aliased) {
        return { x: aliased.x, y: aliased.y };
      }
    }

    // Fallback: center of the scene
    return {
      x: this.manifest.layout.sceneWidth / 2,
      y: this.manifest.layout.sceneHeight / 2,
    };
  }

  // =========================================================================
  // Spawn / Destroy
  // =========================================================================

  private handleSpawn(
    entityRef: string,
    params: Readonly<Record<string, unknown>>,
  ): void {
    // Remove existing if already spawned
    this.handleDestroy(entityRef);

    const visual = ENTITY_VISUALS[entityRef] ?? DEFAULT_VISUAL;
    const gfx = new Graphics();
    gfx.rect(0, 0, visual.width, visual.height);
    gfx.fill(visual.color);
    // Center the pivot
    gfx.pivot.set(visual.width / 2, visual.height / 2);

    const at = params["at"] as string | undefined;
    if (at) {
      const pos = this.resolvePosition(at);
      gfx.position.set(pos.x, pos.y);
    }

    this.app.stage.addChild(gfx);
    this.entities.set(entityRef, gfx);
  }

  private handleDestroy(entityRef: string): void {
    const entity = this.entities.get(entityRef);
    if (entity) {
      this.app.stage.removeChild(entity);
      entity.destroy();
      this.entities.delete(entityRef);
    }
  }

  // =========================================================================
  // Move / Fly
  // =========================================================================

  private handleMoveStart(
    performanceId: string,
    entityRef: string,
    params: Readonly<Record<string, unknown>>,
  ): void {
    const entity = this.entities.get(entityRef);
    if (!entity) return;

    const to = params["to"] as string | undefined;
    if (!to) return;

    const target = this.resolvePosition(to);
    const key = `${performanceId}:${entityRef}`;

    this.activeAnimations.set(key, {
      startX: entity.position.x,
      startY: entity.position.y,
      targetX: target.x,
      targetY: target.y,
      action: "move",
    });
  }

  private handleMoveUpdate(
    performanceId: string,
    entityRef: string,
    progress: number,
    action: string,
  ): void {
    const entity = this.entities.get(entityRef);
    if (!entity) return;

    const key = `${performanceId}:${entityRef}`;
    const anim = this.activeAnimations.get(key);
    if (!anim) return;

    // Linear interpolation for x
    const x = anim.startX + (anim.targetX - anim.startX) * progress;

    // For "fly", the easing function already provides the arc in the progress value.
    // But we also add a vertical offset for the arc visual:
    // parabolic Y offset peaks at progress=0.5
    let y: number;
    if (action === "fly") {
      const linearT = progress; // progress is already eased by choreographer (arc)
      // Re-compute linear progress from position for the Y arc.
      // Since progress is already arc-eased, we use a simpler approach:
      // Just lerp Y the same as X and add an upward arc offset.
      const baseY = anim.startY + (anim.targetY - anim.startY) * progress;
      // arc offset: peak of -80px at the midpoint
      const arcOffset = -80 * 4 * linearT * (1 - linearT);
      y = baseY + arcOffset;
    } else {
      y = anim.startY + (anim.targetY - anim.startY) * progress;
    }

    entity.position.set(x, y);
  }

  private handleMoveComplete(
    performanceId: string,
    entityRef: string,
  ): void {
    const key = `${performanceId}:${entityRef}`;
    const anim = this.activeAnimations.get(key);
    if (!anim) return;

    const entity = this.entities.get(entityRef);
    if (entity) {
      entity.position.set(anim.targetX, anim.targetY);
    }

    this.activeAnimations.delete(key);
  }

  // =========================================================================
  // Flash
  // =========================================================================

  private handleFlashStart(
    entityRef: string,
    params: Readonly<Record<string, unknown>>,
  ): void {
    // Flash targets a position, not necessarily a spawned entity.
    // If the entity doesn't exist, spawn a temporary flash rect.
    let entity = this.entities.get(entityRef);
    if (!entity) {
      const pos = this.resolvePosition(entityRef);
      const colorStr = params["color"] as string | undefined;
      const colorNum = colorStr ? parseInt(colorStr.replace("#", ""), 16) : 0xffffff;

      const gfx = new Graphics();
      gfx.rect(0, 0, 40, 40);
      gfx.fill(colorNum);
      gfx.pivot.set(20, 20);
      gfx.position.set(pos.x, pos.y);

      this.app.stage.addChild(gfx);
      this.entities.set(entityRef, gfx);
      entity = gfx;
    }

    entity.alpha = 1;
  }

  private handleFlashUpdate(entityRef: string, progress: number): void {
    const entity = this.entities.get(entityRef);
    if (!entity) return;

    // Fade out: alpha goes from 1 to 0 as progress goes from 0 to 1
    entity.alpha = 1 - progress;
  }

  private handleFlashComplete(entityRef: string): void {
    const entity = this.entities.get(entityRef);
    if (!entity) return;

    entity.alpha = 1;
  }

  // =========================================================================
  // Public helpers
  // =========================================================================

  /**
   * Pre-spawn an entity at a named position.
   * Useful for setting up the initial scene before choreographies run.
   */
  preSpawn(entityRef: string, positionName: string): void {
    this.handleSpawn(entityRef, { at: positionName });
  }

  /** Get the PixiJS container for a spawned entity (for debugging). */
  getEntity(entityRef: string): Container | undefined {
    return this.entities.get(entityRef);
  }
}
