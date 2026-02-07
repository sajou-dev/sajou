/**
 * PixiCommandSink — translates choreographer commands into PixiJS visuals.
 *
 * Implements the `CommandSink` interface from `@sajou/core`. Receives
 * frame-by-frame progress updates from the choreographer and renders
 * Tiny Swords (Pixel Frog) pixel art sprites with animated spritesheets.
 *
 * Call `init()` to preload PNG assets before starting the choreographer.
 * Falls back to colored rectangles for unknown entities.
 */

import {
  Graphics,
  Container,
  Sprite,
  Assets,
  AnimatedSprite,
  Rectangle,
  TilingSprite,
  Texture,
} from "pixi.js";
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
// Entity visual definitions — Tiny Swords asset pack
// ---------------------------------------------------------------------------

/** Spritesheet animation with its own PNG file. */
interface SpritesheetAnimDef {
  readonly asset: string;
  readonly frameCount: number;
  readonly fps: number;
  readonly loop: boolean;
}

/** Size, asset, and spritesheet info for each entity type. */
interface EntityVisualDef {
  /** Display width in scene pixels. */
  readonly displayWidth: number;
  /** Display height in scene pixels. */
  readonly displayHeight: number;
  /** Fallback color when assets fail to load. */
  readonly color: number;
  /** Primary asset path (relative to assetBasePath). */
  readonly asset: string;
  /** Frame size for horizontal spritesheet strips (square frames). */
  readonly frameSize?: number;
  /** Frame count in the primary spritesheet. */
  readonly frameCount?: number;
  /** Frames per second for primary animation. */
  readonly fps?: number;
  /** Whether primary animation loops. */
  readonly loop?: boolean;
  /** Additional named animations with separate spritesheet files. */
  readonly animations?: Readonly<Record<string, SpritesheetAnimDef>>;
}

/** Visual definitions keyed by entity name. */
const ENTITY_VISUALS: Readonly<Record<string, EntityVisualDef>> = {
  peon: {
    displayWidth: 64,
    displayHeight: 64,
    color: 0x4488ff,
    asset: "tiny-swords/Units/Blue Units/Pawn/Pawn_Idle.png",
    frameSize: 192,
    frameCount: 8,
    fps: 6,
    loop: true,
    animations: {
      run: {
        asset: "tiny-swords/Units/Blue Units/Pawn/Pawn_Run.png",
        frameCount: 6,
        fps: 10,
        loop: true,
      },
    },
  },
  pigeon: {
    displayWidth: 32,
    displayHeight: 32,
    color: 0xffffff,
    asset: "tiny-swords/Units/Blue Units/Archer/Arrow.png",
  },
  forge: {
    displayWidth: 80,
    displayHeight: 106,
    color: 0x8b4513,
    asset: "tiny-swords/Buildings/Blue Buildings/Barracks.png",
  },
  oracle: {
    displayWidth: 128,
    displayHeight: 102,
    color: 0x9933cc,
    asset: "tiny-swords/Buildings/Blue Buildings/Castle.png",
  },
  "gold-coins": {
    displayWidth: 48,
    displayHeight: 48,
    color: 0xffd700,
    asset: "tiny-swords/Terrain/Resources/Gold/Gold Resource/Gold_Resource.png",
  },
  explosion: {
    displayWidth: 80,
    displayHeight: 80,
    color: 0xff3300,
    asset: "tiny-swords/Particle FX/Explosion_01.png",
    frameSize: 192,
    frameCount: 8,
    fps: 16,
    loop: false,
  },
};

/** Default visual for unknown entities. */
const DEFAULT_VISUAL = { displayWidth: 24, displayHeight: 24, color: 0x888888 };

/** Terrain tile asset and extraction coordinates. */
const TERRAIN = {
  asset: "tiny-swords/Terrain/Tileset/Tilemap_color1.png",
  /** X offset of a clean interior grass tile in the tilemap. */
  tileX: 64,
  /** Y offset of a clean interior grass tile in the tilemap. */
  tileY: 64,
  /** Tile size in pixels. */
  tileSize: 64,
} as const;

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
  /** Base path for PNG assets. Must end with '/'. */
  readonly assetBasePath?: string;
}

/**
 * A `CommandSink` that renders choreographer commands using PixiJS.
 *
 * Entities are rendered as Tiny Swords pixel art sprites. Animated
 * entities (peon, explosion) use PixiJS AnimatedSprite with spritesheet
 * frame slicing. The terrain is a tiled grass background.
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

  /** Entity refs whose visuals were created by a flash action (temporary). */
  private readonly flashCreatedEntities = new Set<string>();

  /** Loaded textures for static sprites, keyed by entity name. */
  private readonly textures = new Map<string, Texture>();

  /**
   * Pre-sliced animation frame textures.
   * Outer key: entity name. Inner key: animation name ("default" for primary).
   */
  private readonly animFrames = new Map<string, Map<string, Texture[]>>();

  /** FPS values per entity per animation, for AnimatedSprite speed switching. */
  private readonly animFps = new Map<string, Map<string, number>>();

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
   * Preload PNG assets for all known entities and set up the terrain.
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
      // Load primary asset
      loadPromises.push(
        this.loadEntityAsset(name, def, `${base}${def.asset}`),
      );

      // Load additional animation assets
      if (def.animations) {
        for (const [animName, animDef] of Object.entries(def.animations)) {
          loadPromises.push(
            this.loadAnimationAsset(
              name,
              animName,
              animDef,
              def.frameSize ?? 0,
              `${base}${animDef.asset}`,
            ),
          );
        }
      }
    }

    // Load terrain tilemap
    loadPromises.push(this.loadTerrain(base));

    await Promise.all(loadPromises);
  }

  // =========================================================================
  // Asset loading helpers
  // =========================================================================

  /** Load and process a primary entity asset (static or spritesheet). */
  private async loadEntityAsset(
    name: string,
    def: EntityVisualDef,
    url: string,
  ): Promise<void> {
    try {
      const loaded = await Assets.load<Texture>(encodeURI(url));
      loaded.source.scaleMode = "nearest";

      if (def.frameSize && def.frameCount) {
        // Horizontal spritesheet strip: slice into individual frame textures
        const frames = this.sliceFrames(loaded, def.frameSize, def.frameCount);
        this.getOrCreateMap(this.animFrames, name).set("default", frames);
        this.getOrCreateMap(this.animFps, name).set("default", def.fps ?? 10);
      } else {
        // Static single-frame sprite
        this.textures.set(name, loaded);
      }
    } catch {
      // Asset failed to load — entity will use colored rectangle fallback
    }
  }

  /** Load and process an additional animation spritesheet. */
  private async loadAnimationAsset(
    entityName: string,
    animName: string,
    animDef: SpritesheetAnimDef,
    frameSize: number,
    url: string,
  ): Promise<void> {
    try {
      const texture = await Assets.load<Texture>(encodeURI(url));
      texture.source.scaleMode = "nearest";

      const frames = this.sliceFrames(texture, frameSize, animDef.frameCount);
      this.getOrCreateMap(this.animFrames, entityName).set(animName, frames);
      this.getOrCreateMap(this.animFps, entityName).set(animName, animDef.fps);
    } catch {
      // Animation asset failed to load — entity will use primary animation only
    }
  }

  /** Slice a horizontal spritesheet into individual frame textures. */
  private sliceFrames(
    texture: Texture,
    frameSize: number,
    frameCount: number,
  ): Texture[] {
    const frames: Texture[] = [];
    for (let i = 0; i < frameCount; i++) {
      frames.push(
        new Texture({
          source: texture.source,
          frame: new Rectangle(i * frameSize, 0, frameSize, frameSize),
        }),
      );
    }
    return frames;
  }

  /** Load the terrain tilemap and create a tiled grass background. */
  private async loadTerrain(base: string): Promise<void> {
    try {
      const tilemap = await Assets.load<Texture>(encodeURI(`${base}${TERRAIN.asset}`));
      tilemap.source.scaleMode = "nearest";

      const grassTile = new Texture({
        source: tilemap.source,
        frame: new Rectangle(
          TERRAIN.tileX,
          TERRAIN.tileY,
          TERRAIN.tileSize,
          TERRAIN.tileSize,
        ),
      });

      const { sceneWidth, sceneHeight } = this.manifest.layout;
      const bg = new TilingSprite({
        texture: grassTile,
        width: sceneWidth,
        height: sceneHeight,
      });

      // Insert at the very bottom of the display list
      this.app.stage.addChildAt(bg, 0);
    } catch {
      // Terrain failed to load — scene will show the solid background color
    }
  }

  /** Get or create an inner Map inside a nested Map structure. */
  private getOrCreateMap<V>(
    outer: Map<string, Map<string, V>>,
    key: string,
  ): Map<string, V> {
    let inner = outer.get(key);
    if (!inner) {
      inner = new Map();
      outer.set(key, inner);
    }
    return inner;
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

  /** Create a visual container for an entity, using sprites or fallback rect. */
  private createEntityVisual(entityRef: string): Container {
    const def = ENTITY_VISUALS[entityRef];
    const dw = def?.displayWidth ?? DEFAULT_VISUAL.displayWidth;
    const dh = def?.displayHeight ?? DEFAULT_VISUAL.displayHeight;
    const color = def?.color ?? DEFAULT_VISUAL.color;

    // Animated spritesheet entity?
    const entityFrameMap = this.animFrames.get(entityRef);
    if (entityFrameMap) {
      const defaultFrames = entityFrameMap.get("default");
      if (defaultFrames && defaultFrames.length > 0) {
        const isLoop = def?.loop ?? true;
        const anim = new AnimatedSprite(defaultFrames);
        anim.width = dw;
        anim.height = dh;
        anim.anchor.set(0.5, 0.5);
        anim.animationSpeed = (def?.fps ?? 10) / 60;
        anim.loop = isLoop;

        // One-shot animations auto-destroy when finished
        if (!isLoop) {
          anim.onComplete = () => {
            this.handleDestroy(entityRef);
          };
        }

        anim.play();
        return anim;
      }
    }

    // Static sprite with loaded texture?
    const texture = this.textures.get(entityRef);
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.width = dw;
      sprite.height = dh;
      sprite.anchor.set(0.5, 0.5);
      return sprite;
    }

    // Fallback: colored rectangle
    const gfx = new Graphics();
    gfx.rect(0, 0, dw, dh);
    gfx.fill(color);
    gfx.pivot.set(dw / 2, dh / 2);
    return gfx;
  }

  /** Switch an AnimatedSprite entity to a named animation. */
  private setEntityAnimation(entityRef: string, animName: string): void {
    const entity = this.entities.get(entityRef);
    if (!entity || !(entity instanceof AnimatedSprite)) return;

    const entityFrameMap = this.animFrames.get(entityRef);
    if (!entityFrameMap) return;

    const frames = entityFrameMap.get(animName);
    if (!frames || frames.length === 0) return;

    const fpsMap = this.animFps.get(entityRef);
    const fps = fpsMap?.get(animName) ?? 10;

    const def = ENTITY_VISUALS[entityRef];
    const isLoop = animName === "default"
      ? (def?.loop ?? true)
      : (def?.animations?.[animName]?.loop ?? true);

    entity.textures = frames;
    entity.animationSpeed = fps / 60;
    entity.loop = isLoop;
    entity.gotoAndPlay(0);
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

    // Switch to run animation for animated entities
    this.setEntityAnimation(entityRef, "run");

    // Flip sprite to face movement direction
    if (entity instanceof Sprite) {
      const direction = target.x >= entity.position.x ? 1 : -1;
      entity.scale.x = Math.abs(entity.scale.x) * direction;
    }
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
      const baseY = anim.startY + (anim.targetY - anim.startY) * progress;
      // arc offset: peak of -80px at the midpoint
      const arcOffset = -80 * 4 * progress * (1 - progress);
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

    // Switch back to idle animation
    this.setEntityAnimation(entityRef, "default");
  }

  // =========================================================================
  // Flash
  // =========================================================================

  private handleFlashStart(
    entityRef: string,
    params: Readonly<Record<string, unknown>>,
  ): void {
    // Flash targets a position, not necessarily a spawned entity.
    // If the entity doesn't exist, create a temporary flash rect
    // that will be cleaned up in handleFlashComplete.
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
      this.flashCreatedEntities.add(entityRef);
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

    if (this.flashCreatedEntities.has(entityRef)) {
      // Temporary flash visual — remove it entirely
      this.app.stage.removeChild(entity);
      entity.destroy();
      this.entities.delete(entityRef);
      this.flashCreatedEntities.delete(entityRef);
    } else {
      // Pre-existing entity (e.g. forge) — restore full opacity
      entity.alpha = 1;
    }
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
