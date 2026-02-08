/**
 * PixiCommandSink — translates choreographer commands into PixiJS visuals
 * for the Office theme.
 *
 * Implements the `CommandSink` interface from `@sajou/core`. Receives
 * frame-by-frame progress updates from the choreographer and renders
 * LimeZu pixel art sprites (Modern Office + Modern Interiors).
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
import type { EntityVisualConfig } from "@sajou/schema";

/** Default visual for unknown entities (no config found). */
const DEFAULT_VISUAL = { displayWidth: 24, displayHeight: 24, color: 0x888888 };

/**
 * Office floor terrain tile asset and extraction coordinates.
 * Uses the Room Builder Office tileset — gray office carpet tile.
 */
const TERRAIN = {
  asset: "modern-office/1_Room_Builder_Office/Room_Builder_Office_48x48.png",
  /** X offset of a clean interior floor tile in the tilemap. */
  tileX: 240,
  /** Y offset of a clean interior floor tile in the tilemap. */
  tileY: 384,
  /** Tile size in pixels. */
  tileSize: 48,
} as const;

// ---------------------------------------------------------------------------
// Static furniture layout — fills the office with decorative sprites
// ---------------------------------------------------------------------------

/**
 * A static decorative sprite placed in the scene.
 *
 * Uses LimeZu Modern Office Singles (48x48 pack, files numbered 1-339).
 * Each file is 96x144px (2x3 tiles), content centered with transparency.
 */
interface FurniturePiece {
  /** Singles sprite number (1-339). */
  readonly single: number;
  /** Scene X coordinate (center of sprite). */
  readonly x: number;
  /** Scene Y coordinate (bottom of sprite for floor items). */
  readonly y: number;
  /** Display scale multiplier (default: 1). */
  readonly scale?: number;
}

/**
 * A partition wall segment drawn as a colored rectangle.
 * Visually separates office zones.
 */
interface WallSegment {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Path template for Singles assets (48x48 variant). */
const SINGLES_PATH = "modern-office/4_Modern_Office_singles/48x48/Modern_Office_Singles_48x48_";

/*
 * Furniture identification (from pixel content analysis of 339 Singles):
 *
 *   249,254,259,264,269 — Large desk composites (5 wood colors)
 *   248,253,258,263,268 — Medium desks (same 5 colors)
 *   129-134             — Blue office chairs (dark & light variants)
 *   329-336             — Chairs in 4 colors (blue, red, gray, brown)
 *   275,276,311,312     — Server racks
 *   337,338,339         — Plants (small, medium, large — GREEN)
 *   175,176             — Tall bookcases
 *   98                  — Tall cabinet/shelf
 *   170-172             — Large reception/conference desks
 *   141-146             — Computer monitors
 *   164                 — Sofa/couch
 *   117-118             — Small box accessories
 *   320-322             — Large appliances (vending, copier)
 *   135,137             — Tall narrow items (coat rack/floor lamp)
 *   190                 — Manager desk (also used as entity)
 *   196-199             — Small cabinets / TV screens
 */

/**
 * Static furniture placements for the 4 office zones.
 *
 * Coordinates are in scene pixels (800x600).
 * anchor (0.5, 1.0): y = floor level where item sits.
 */
const OFFICE_FURNITURE: readonly FurniturePiece[] = [
  // ── ZONE 1: MANAGER OFFICE (top-left, x:0-290, y:0-200) ──

  // Tall bookshelf against the left wall
  { single: 175, x: 55, y: 185, scale: 0.65 },
  // Second bookshelf behind desk
  { single: 176, x: 55, y: 100, scale: 0.65 },
  // Plant in corner
  { single: 338, x: 260, y: 75, scale: 0.45 },
  // Wall decoration (warm beige frame)
  { single: 13, x: 160, y: 35, scale: 0.55 },
  // Small accessory on desk area
  { single: 117, x: 210, y: 130, scale: 0.55 },

  // ── ZONE 2: SERVER ROOM (top-right, x:510-800, y:0-200) ──

  // Extra static server rack (entity server-rack at 580, these are decor)
  { single: 276, x: 660, y: 175, scale: 0.65 },
  { single: 311, x: 740, y: 175, scale: 0.65 },
  // Tall cabinet in server room
  { single: 98, x: 550, y: 185, scale: 0.65 },
  // Small monitor on side
  { single: 141, x: 770, y: 55, scale: 0.55 },

  // ── ZONE 3: OPEN SPACE (x:20-780, y:220-440) ──

  // Row 1: 4 desks with chairs (y ~ 290-310)
  { single: 249, x: 110, y: 295, scale: 0.6 },
  { single: 329, x: 110, y: 320, scale: 0.55 },
  { single: 249, x: 260, y: 295, scale: 0.6 },
  { single: 329, x: 260, y: 320, scale: 0.55 },
  { single: 249, x: 410, y: 295, scale: 0.6 },
  { single: 329, x: 410, y: 320, scale: 0.55 },
  { single: 249, x: 560, y: 295, scale: 0.6 },
  { single: 329, x: 560, y: 320, scale: 0.55 },

  // Row 2: 4 desks with chairs (y ~ 380-410)
  { single: 254, x: 110, y: 385, scale: 0.6 },
  { single: 330, x: 110, y: 410, scale: 0.55 },
  { single: 254, x: 260, y: 385, scale: 0.6 },
  { single: 330, x: 260, y: 410, scale: 0.55 },
  { single: 254, x: 410, y: 385, scale: 0.6 },
  { single: 330, x: 410, y: 410, scale: 0.55 },
  { single: 254, x: 560, y: 385, scale: 0.6 },
  { single: 330, x: 560, y: 410, scale: 0.55 },

  // Scattered decoration in open space
  { single: 338, x: 720, y: 270, scale: 0.45 },  // Plant near wall
  { single: 135, x: 720, y: 415, scale: 0.6 },   // Coat rack / floor lamp

  // ── ZONE 4: ENTRANCE / RECEPTION (bottom-left, x:0-390, y:450-600) ──

  // Large reception desk
  { single: 170, x: 200, y: 560, scale: 0.65 },
  // Medium plant at entrance
  { single: 338, x: 55, y: 570, scale: 0.5 },
  // Small plant
  { single: 337, x: 350, y: 510, scale: 0.4 },
  // Small accessory on reception
  { single: 118, x: 230, y: 535, scale: 0.55 },

  // ── ZONE 5: BREAK ROOM (bottom-right, x:410-800, y:450-600) ──

  // Large appliance (vending machine / copier)
  { single: 320, x: 490, y: 575, scale: 0.65 },
  // Table with chairs
  { single: 253, x: 630, y: 555, scale: 0.6 },
  { single: 333, x: 605, y: 580, scale: 0.55 },
  { single: 334, x: 660, y: 580, scale: 0.55 },
  // Small plant in corner
  { single: 337, x: 760, y: 500, scale: 0.4 },
  // Small cabinet (replaced colorful sofa)
  { single: 198, x: 760, y: 575, scale: 0.6 },
];

/**
 * Partition wall segments that visually separate office zones.
 * Drawn as colored rectangles to suggest office partitions.
 */
const PARTITION_WALLS: readonly WallSegment[] = [
  // Manager office — right wall (vertical)
  { x: 290, y: 0, width: 6, height: 205 },
  // Manager office — bottom wall (horizontal)
  { x: 0, y: 200, width: 296, height: 6 },
  // Server room — left wall (vertical)
  { x: 510, y: 0, width: 6, height: 205 },
  // Server room — bottom wall (horizontal)
  { x: 510, y: 200, width: 290, height: 6 },
  // Hallway between manager and server (top center)
  { x: 296, y: 200, width: 214, height: 6 },
  // Bottom zone — top wall (horizontal, full width)
  { x: 0, y: 445, width: 800, height: 6 },
  // Break room — left wall (vertical)
  { x: 400, y: 451, width: 6, height: 149 },
];

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
 * layout position keys (like "managerDesk", "openSpace").
 *
 * Configurable at construction time.
 */
export type PositionAliasMap = Readonly<Record<string, string>>;

/** Default aliases for the Office theme's simple-task scenario. */
const DEFAULT_ALIASES: PositionAliasMap = {
  orchestrator: "managerDesk",
  "agent-solver": "openSpace",
};

// ---------------------------------------------------------------------------
// PixiCommandSink
// ---------------------------------------------------------------------------

/** Options for constructing an Office PixiCommandSink. */
export interface PixiCommandSinkOptions {
  /** Application instance. */
  readonly app: Application;
  /** Theme manifest with layout/scene info. */
  readonly manifest: ThemeManifest;
  /** Declarative entity visual configuration. */
  readonly entityVisuals: EntityVisualConfig;
  /** Optional position alias map. */
  readonly aliases?: PositionAliasMap;
  /** Base path for PNG assets. Must end with '/'. */
  readonly assetBasePath?: string;
}

/**
 * A `CommandSink` that renders choreographer commands using PixiJS
 * for the Office theme.
 *
 * Entities are rendered as LimeZu pixel art sprites. The terrain is
 * a tiled office floor background from the Room Builder Office tileset.
 *
 * @example
 * ```ts
 * const app = new Application();
 * await app.init({ width: 800, height: 600 });
 * const sink = new PixiCommandSink({
 *   app, manifest: officeManifest, entityVisuals,
 * });
 * await sink.init("/office-assets/");
 * const choreographer = new Choreographer({ clock, sink });
 * ```
 */
export class PixiCommandSink implements CommandSink {
  private readonly app: Application;
  private readonly manifest: ThemeManifest;
  private readonly entityVisuals: EntityVisualConfig;
  private readonly aliases: PositionAliasMap;
  private readonly assetBasePath: string;

  /** Spawned entity visuals, keyed by entityRef. */
  private readonly entities = new Map<string, Container>();

  /** In-flight animation state, keyed by `${performanceId}:${entityRef}`. */
  private readonly activeAnimations = new Map<string, AnimState>();

  /** Entity refs whose visuals were created by a flash action (temporary). */
  private readonly flashCreatedEntities = new Set<string>();

  /** Loaded textures for static sprites, keyed by `${entityName}:${stateName}`. */
  private readonly stateTextures = new Map<string, Texture>();

  /**
   * Pre-sliced animation frame textures.
   * Outer key: entity name. Inner key: state name.
   */
  private readonly animFrames = new Map<string, Map<string, Texture[]>>();

  /** FPS values per entity per animation, for AnimatedSprite speed switching. */
  private readonly animFps = new Map<string, Map<string, number>>();

  constructor(options: PixiCommandSinkOptions) {
    this.app = options.app;
    this.manifest = options.manifest;
    this.entityVisuals = options.entityVisuals;
    this.aliases = options.aliases ?? DEFAULT_ALIASES;
    this.assetBasePath = options.assetBasePath ?? "";
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

    // Validate entity visuals config
    const { validateEntityVisuals } = await import("./validate-entity-visuals.js");
    const result = validateEntityVisuals(this.entityVisuals);
    for (const warning of result.warnings) {
      console.warn(`[PixiCommandSink:Office] ${warning}`);
    }

    const loadPromises: Promise<void>[] = [];

    // Deduplicate asset loads — multiple states may share the same PNG
    const loadedAssets = new Map<string, Promise<Texture>>();

    const loadAsset = (url: string): Promise<Texture> => {
      let promise = loadedAssets.get(url);
      if (!promise) {
        promise = Assets.load<Texture>(encodeURI(url)).then((tex) => {
          tex.source.scaleMode = "nearest";
          return tex;
        });
        loadedAssets.set(url, promise);
      }
      return promise;
    };

    for (const [name, entry] of Object.entries(this.entityVisuals.entities)) {
      loadPromises.push(
        this.loadEntityStates(name, entry, base, loadAsset),
      );
    }

    // Load terrain tilemap
    loadPromises.push(this.loadTerrain(base));

    await Promise.all(loadPromises);

    // Build static furniture layer (after terrain, before entities)
    await this.buildStaticFurniture(base);
  }

  // =========================================================================
  // Asset loading helpers
  // =========================================================================

  /**
   * Load all visual states for an entity from the declarative config.
   *
   * Each state is either static (single image) or a spritesheet (animated).
   * Asset loads are deduplicated via the `loadAsset` function.
   */
  private async loadEntityStates(
    name: string,
    entry: import("@sajou/schema").EntityVisualEntry,
    base: string,
    loadAsset: (url: string) => Promise<Texture>,
  ): Promise<void> {
    for (const [stateName, state] of Object.entries(entry.states)) {
      try {
        const url = `${base}${state.asset}`;
        const loaded = await loadAsset(url);

        if (state.type === "spritesheet") {
          const row = state.frameRow ?? 0;
          const frames = this.sliceFrames(loaded, state.frameSize, state.frameCount, row);
          this.getOrCreateMap(this.animFrames, name).set(stateName, frames);
          this.getOrCreateMap(this.animFps, name).set(stateName, state.fps);
        } else if (state.sourceRect) {
          const cropped = new Texture({
            source: loaded.source,
            frame: new Rectangle(state.sourceRect.x, state.sourceRect.y, state.sourceRect.w, state.sourceRect.h),
          });
          this.stateTextures.set(`${name}:${stateName}`, cropped);
        } else {
          this.stateTextures.set(`${name}:${stateName}`, loaded);
        }
      } catch {
        // Asset failed to load — state will use fallback
      }
    }
  }

  /** Slice a spritesheet row into individual frame textures. */
  private sliceFrames(
    texture: Texture,
    frameSize: number,
    frameCount: number,
    row = 0,
  ): Texture[] {
    const frames: Texture[] = [];
    const y = row * frameSize;
    for (let i = 0; i < frameCount; i++) {
      frames.push(
        new Texture({
          source: texture.source,
          frame: new Rectangle(i * frameSize, y, frameSize, frameSize),
        }),
      );
    }
    return frames;
  }

  /** Load the terrain tilemap and create a tiled office floor background. */
  private async loadTerrain(base: string): Promise<void> {
    try {
      const tilemap = await Assets.load<Texture>(encodeURI(`${base}${TERRAIN.asset}`));
      tilemap.source.scaleMode = "nearest";

      const floorTile = new Texture({
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
        texture: floorTile,
        width: sceneWidth,
        height: sceneHeight,
      });

      // Insert at the very bottom of the display list
      this.app.stage.addChildAt(bg, 0);
    } catch {
      // Terrain failed to load — scene will show the solid background color
    }
  }

  /**
   * Build the static office furniture layer.
   *
   * Loads Singles PNGs, places furniture sprites at hardcoded positions,
   * and draws partition walls to divide the office into zones.
   * This layer sits between the terrain floor and the dynamic entities.
   */
  private async buildStaticFurniture(base: string): Promise<void> {
    const furnitureLayer = new Container();

    // Deduplicate asset loads — same single number used for multiple desks/chairs
    const textureCache = new Map<number, Texture | null>();

    const loadSingle = async (num: number): Promise<Texture | null> => {
      if (textureCache.has(num)) {
        return textureCache.get(num) ?? null;
      }
      try {
        const url = `${base}${SINGLES_PATH}${String(num)}.png`;
        const tex = await Assets.load<Texture>(encodeURI(url));
        tex.source.scaleMode = "nearest";
        textureCache.set(num, tex);
        return tex;
      } catch {
        textureCache.set(num, null);
        return null;
      }
    };

    // Load all unique singles in parallel
    const uniqueSingles = [...new Set(OFFICE_FURNITURE.map((f) => f.single))];
    await Promise.all(uniqueSingles.map((n) => loadSingle(n)));

    // Place furniture sprites
    for (const piece of OFFICE_FURNITURE) {
      const tex = textureCache.get(piece.single);
      if (!tex) continue;

      const sprite = new Sprite(tex);
      sprite.anchor.set(0.5, 1.0);
      sprite.position.set(piece.x, piece.y);
      if (piece.scale !== undefined) {
        sprite.scale.set(piece.scale);
      }
      furnitureLayer.addChild(sprite);
    }

    // Draw partition walls
    const walls = new Graphics();
    for (const seg of PARTITION_WALLS) {
      walls.rect(seg.x, seg.y, seg.width, seg.height);
    }
    walls.fill(0x6b7b8d);
    furnitureLayer.addChild(walls);

    // Insert furniture layer above terrain (index 1) but below entities
    const insertIndex = Math.min(1, this.app.stage.children.length);
    this.app.stage.addChildAt(furnitureLayer, insertIndex);
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
   * 1. Direct layout position match (e.g., "managerDesk" -> {x:400, y:80})
   * 2. Alias map (e.g., "orchestrator" -> "managerDesk" -> {x:400, y:80})
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
    const entry = this.entityVisuals.entities[entityRef];
    const dw = entry?.displayWidth ?? DEFAULT_VISUAL.displayWidth;
    const dh = entry?.displayHeight ?? DEFAULT_VISUAL.displayHeight;
    const color = entry
      ? parseInt(entry.fallbackColor.replace("#", ""), 16)
      : DEFAULT_VISUAL.color;

    // Resolve idle state config
    const idleState = entry?.states["idle"];

    // Animated spritesheet entity (idle state)?
    const entityFrameMap = this.animFrames.get(entityRef);
    if (entityFrameMap) {
      const idleFrames = entityFrameMap.get("idle");
      if (idleFrames && idleFrames.length > 0) {
        const isLoop = idleState?.type === "spritesheet" ? (idleState.loop ?? true) : true;
        const fps = idleState?.type === "spritesheet" ? idleState.fps : 10;
        const anim = new AnimatedSprite(idleFrames);
        anim.width = dw;
        anim.height = dh;
        anim.anchor.set(0.5, 0.5);
        anim.animationSpeed = fps / 60;
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

    // Static sprite with loaded texture (idle state)?
    const texture = this.stateTextures.get(`${entityRef}:idle`);
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

  /** Switch an AnimatedSprite entity to a named animation state. */
  private setEntityAnimation(entityRef: string, stateName: string): void {
    const entity = this.entities.get(entityRef);
    if (!entity || !(entity instanceof AnimatedSprite)) return;

    const entityFrameMap = this.animFrames.get(entityRef);
    if (!entityFrameMap) return;

    const frames = entityFrameMap.get(stateName);
    if (!frames || frames.length === 0) return;

    const fpsMap = this.animFps.get(entityRef);
    const fps = fpsMap?.get(stateName) ?? 10;

    // Look up loop setting from the declarative config
    const entry = this.entityVisuals.entities[entityRef];
    const stateConfig = entry?.states[stateName];
    const isLoop = stateConfig?.type === "spritesheet" ? (stateConfig.loop ?? true) : true;

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
    this.setEntityAnimation(entityRef, "idle");
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
      // Pre-existing entity (e.g. server-rack) — restore full opacity
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
