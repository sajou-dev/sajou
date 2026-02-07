/**
 * PixiCommandSink — translates choreographer commands into PixiJS visuals.
 *
 * Implements the `CommandSink` interface from `@sajou/core`. Receives
 * frame-by-frame progress updates from the choreographer and moves
 * SVG sprites accordingly.
 *
 * Call `init()` to preload SVG assets before starting the choreographer.
 * Falls back to colored rectangles for unknown entities.
 */

import { Graphics, Container, Sprite, Assets } from "pixi.js";
import type { Application, Texture } from "pixi.js";
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
// Entity visual definitions
// ---------------------------------------------------------------------------

/** Size and asset info for each entity type. */
interface EntityVisualDef {
  readonly width: number;
  readonly height: number;
  /** Fallback color when SVG is not loaded. */
  readonly color: number;
  /** SVG asset filename (relative to assetBasePath). */
  readonly asset: string;
}

/** Visual definitions keyed by entity name. */
const ENTITY_VISUALS: Readonly<Record<string, EntityVisualDef>> = {
  peon:         { width: 32, height: 32, color: 0x4488ff, asset: "peon.svg" },
  pigeon:       { width: 24, height: 24, color: 0xffffff, asset: "pigeon.svg" },
  forge:        { width: 48, height: 48, color: 0x8b4513, asset: "forge.svg" },
  oracle:       { width: 48, height: 48, color: 0x9933cc, asset: "oracle.svg" },
  "gold-coins": { width: 20, height: 20, color: 0xffd700, asset: "gold-coins.svg" },
  explosion:    { width: 32, height: 32, color: 0xff3300, asset: "explosion.svg" },
};

/** Default visual for unknown entities. */
const DEFAULT_VISUAL: Omit<EntityVisualDef, "asset"> = { width: 24, height: 24, color: 0x888888 };

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

/** Options for constructing a PixiCommandSink. */
export interface PixiCommandSinkOptions {
  /** Application instance. */
  readonly app: Application;
  /** Theme manifest with layout/scene info. */
  readonly manifest: ThemeManifest;
  /** Optional position alias map. */
  readonly aliases?: PositionAliasMap;
  /** Base path for SVG assets. Must end with '/'. */
  readonly assetBasePath?: string;
}

/**
 * A `CommandSink` that renders choreographer commands using PixiJS.
 *
 * Entities are rendered as SVG sprites when assets are preloaded, with
 * fallback to colored rectangles. Animated actions (move, fly, flash)
 * interpolate per-frame using the progress value from the choreographer.
 *
 * @example
 * ```ts
 * const app = new Application();
 * await app.init({ width: 800, height: 600 });
 * const sink = new PixiCommandSink(app, citadelManifest);
 * await sink.init("/assets/");
 * const choreographer = new Choreographer({ clock, sink });
 * ```
 */
export class PixiCommandSink implements CommandSink {
  private readonly app: Application;
  private readonly manifest: ThemeManifest;
  private readonly aliases: PositionAliasMap;
  private readonly assetBasePath: string;

  /** Spawned entity visuals, keyed by entityRef. */
  private readonly entities = new Map<string, Container>();

  /** In-flight animation state, keyed by `${performanceId}:${entityRef}`. */
  private readonly activeAnimations = new Map<string, AnimState>();

  /** Loaded textures, keyed by entity name. */
  private readonly textures = new Map<string, Texture>();

  constructor(app: Application, manifest: ThemeManifest, aliases?: PositionAliasMap);
  constructor(options: PixiCommandSinkOptions);
  constructor(
    appOrOptions: Application | PixiCommandSinkOptions,
    manifest?: ThemeManifest,
    aliases?: PositionAliasMap,
  ) {
    if ("app" in appOrOptions && "manifest" in appOrOptions) {
      // Options object form
      const opts = appOrOptions as PixiCommandSinkOptions;
      this.app = opts.app;
      this.manifest = opts.manifest;
      this.aliases = opts.aliases ?? DEFAULT_ALIASES;
      this.assetBasePath = opts.assetBasePath ?? "";
    } else {
      // Legacy positional form
      this.app = appOrOptions as Application;
      this.manifest = manifest!;
      this.aliases = aliases ?? DEFAULT_ALIASES;
      this.assetBasePath = "";
    }
  }

  /**
   * Preload SVG assets for all known entities.
   *
   * Call this before starting the choreographer to ensure sprites
   * are available synchronously during spawn.
   *
   * @param basePath - Override for the asset base path
   */
  async init(basePath?: string): Promise<void> {
    const base = basePath ?? this.assetBasePath;
    if (!base) return;

    const loadPromises: Promise<void>[] = [];

    for (const [name, def] of Object.entries(ENTITY_VISUALS)) {
      const url = `${base}${def.asset}`;
      loadPromises.push(
        Assets.load<Texture>(url)
          .then((texture) => {
            this.textures.set(name, texture);
          })
          .catch(() => {
            // Silently fall back to rect for this entity
          }),
      );
    }

    await Promise.all(loadPromises);
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
   * 1. Direct layout position match (e.g., "oracle" -> {x:400, y:80})
   * 2. Alias map (e.g., "orchestrator" -> "oracle" -> {x:400, y:80})
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
  // Entity creation
  // =========================================================================

  /** Create a visual container for an entity, using SVG sprite or fallback rect. */
  private createEntityVisual(entityRef: string): Container {
    const texture = this.textures.get(entityRef);
    const def = ENTITY_VISUALS[entityRef];

    if (texture) {
      const sprite = new Sprite(texture);
      sprite.width = def?.width ?? DEFAULT_VISUAL.width;
      sprite.height = def?.height ?? DEFAULT_VISUAL.height;
      sprite.anchor.set(0.5, 0.5);
      return sprite;
    }

    // Fallback: colored rectangle
    const visual = def ?? DEFAULT_VISUAL;
    const gfx = new Graphics();
    gfx.rect(0, 0, visual.width, visual.height);
    gfx.fill(visual.color);
    gfx.pivot.set(visual.width / 2, visual.height / 2);
    return gfx;
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

    const container = this.createEntityVisual(entityRef);

    const at = params["at"] as string | undefined;
    if (at) {
      const pos = this.resolvePosition(at);
      container.position.set(pos.x, pos.y);
    }

    this.app.stage.addChild(container);
    this.entities.set(entityRef, container);
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

    // For "fly", add a vertical offset for the arc visual:
    // parabolic Y offset peaks at progress=0.5
    let y: number;
    if (action === "fly") {
      const linearT = progress;
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
