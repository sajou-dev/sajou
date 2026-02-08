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
import type { EntityVisualConfig } from "@sajou/schema";

/** Default visual for unknown entities (no config found). */
const DEFAULT_VISUAL = { displayWidth: 24, displayHeight: 24, color: 0x888888 };

/** Terrain tile asset and extraction coordinates (update-010 pack). */
const TERRAIN = {
  asset: "tiny-swords-update-010/Terrain/Ground/Tilemap_Flat.png",
  /** X offset of a clean interior grass tile in the tilemap. */
  tileX: 64,
  /** Y offset of a clean interior grass tile in the tilemap. */
  tileY: 64,
  /** Tile size in pixels. */
  tileSize: 64,
} as const;

// ---------------------------------------------------------------------------
// Static decoration layout — fills the village with trees, rocks, fences
// ---------------------------------------------------------------------------

/** A static decorative sprite placed in the scene. */
interface DecorationPiece {
  /** Asset path relative to theme base. */
  readonly asset: string;
  /** Scene X coordinate (center of sprite). */
  readonly x: number;
  /** Scene Y coordinate (bottom of sprite). */
  readonly y: number;
  /** Display width in pixels. */
  readonly displayWidth: number;
  /** Display height in pixels. */
  readonly displayHeight: number;
  /** Optional source rectangle for extracting a portion of the image. */
  readonly sourceRect?: { x: number; y: number; w: number; h: number };
}

/**
 * Static village decorations placed around buildings and paths.
 *
 * Coordinates are in scene pixels (800x600).
 * Anchor (0.5, 1.0): y = ground level where item sits.
 */
const VILLAGE_DECORATIONS: readonly DecorationPiece[] = [
  // ── Tree stumps — vertical mass at scene edges ──
  { asset: "tiny-swords/Terrain/Resources/Wood/Trees/Stump 1.png",
    x: 60, y: 160, displayWidth: 56, displayHeight: 72 },
  { asset: "tiny-swords/Terrain/Resources/Wood/Trees/Stump 2.png",
    x: 740, y: 150, displayWidth: 56, displayHeight: 72 },
  { asset: "tiny-swords/Terrain/Resources/Wood/Trees/Stump 3.png",
    x: 50, y: 460, displayWidth: 56, displayHeight: 72 },
  { asset: "tiny-swords/Terrain/Resources/Wood/Trees/Stump 1.png",
    x: 750, y: 440, displayWidth: 56, displayHeight: 72 },

  // ── Rocks — scattered along paths ──
  { asset: "tiny-swords/Terrain/Decorations/Rocks/Rock1.png",
    x: 280, y: 180, displayWidth: 32, displayHeight: 32 },
  { asset: "tiny-swords/Terrain/Decorations/Rocks/Rock2.png",
    x: 520, y: 190, displayWidth: 28, displayHeight: 28 },
  { asset: "tiny-swords/Terrain/Decorations/Rocks/Rock3.png",
    x: 330, y: 460, displayWidth: 30, displayHeight: 30 },
  { asset: "tiny-swords/Terrain/Decorations/Rocks/Rock1.png",
    x: 490, y: 480, displayWidth: 28, displayHeight: 28 },

  // ── Deco sprites (update-010) — small pebbles and scatter ──
  { asset: "tiny-swords-update-010/Deco/01.png",
    x: 200, y: 430, displayWidth: 28, displayHeight: 28 },
  { asset: "tiny-swords-update-010/Deco/03.png",
    x: 600, y: 420, displayWidth: 24, displayHeight: 24 },
  { asset: "tiny-swords-update-010/Deco/06.png",
    x: 350, y: 250, displayWidth: 24, displayHeight: 24 },
  { asset: "tiny-swords-update-010/Deco/09.png",
    x: 460, y: 240, displayWidth: 24, displayHeight: 24 },
  { asset: "tiny-swords-update-010/Deco/11.png",
    x: 100, y: 370, displayWidth: 24, displayHeight: 24 },
  { asset: "tiny-swords-update-010/Deco/11.png",
    x: 700, y: 360, displayWidth: 24, displayHeight: 24 },

  // ── Tall deco items — fence posts / signposts along edges ──
  { asset: "tiny-swords-update-010/Deco/16.png",
    x: 300, y: 135, displayWidth: 28, displayHeight: 56 },
  { asset: "tiny-swords-update-010/Deco/17.png",
    x: 500, y: 135, displayWidth: 28, displayHeight: 56 },
  { asset: "tiny-swords-update-010/Deco/16.png",
    x: 250, y: 570, displayWidth: 28, displayHeight: 56 },
  { asset: "tiny-swords-update-010/Deco/17.png",
    x: 550, y: 570, displayWidth: 28, displayHeight: 56 },
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
  /** Declarative entity visual configuration. */
  readonly entityVisuals: EntityVisualConfig;
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
 * const sink = new PixiCommandSink({
 *   app, manifest: citadelManifest, entityVisuals,
 * });
 * await sink.init("/assets/");
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

  /** Loaded textures for static sprites, keyed by `${entityName}:${stateName}`. */
  private readonly stateTextures = new Map<string, Texture>();

  /**
   * Pre-sliced animation frame textures.
   * Outer key: entity name. Inner key: state name (e.g., "idle", "run").
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
      console.warn(`[PixiCommandSink] ${warning}`);
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

    // Build static decoration layer (after terrain, before entities)
    await this.buildStaticDecoration(base);
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
          const start = state.frameStart ?? 0;
          const frames = this.sliceFrames(loaded, state.frameWidth, state.frameHeight, state.frameCount, row, start);
          this.getOrCreateMap(this.animFrames, name).set(stateName, frames);
          this.getOrCreateMap(this.animFps, name).set(stateName, state.fps);
        } else if (state.sourceRect) {
          const sr = state.sourceRect;
          const cropped = new Texture({
            source: loaded.source,
            frame: new Rectangle(sr.x, sr.y, sr.w, sr.h),
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
    frameWidth: number,
    frameHeight: number,
    frameCount: number,
    row = 0,
    frameStart = 0,
  ): Texture[] {
    const frames: Texture[] = [];
    const y = row * frameHeight;
    for (let i = 0; i < frameCount; i++) {
      frames.push(
        new Texture({
          source: texture.source,
          frame: new Rectangle((frameStart + i) * frameWidth, y, frameWidth, frameHeight),
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

  /**
   * Build the static village decoration layer.
   *
   * Loads tree stumps, rocks, and deco sprites, places them at
   * hardcoded positions to give the scene a populated village feel.
   * This layer sits between the terrain and the dynamic entities.
   */
  private async buildStaticDecoration(base: string): Promise<void> {
    const decoLayer = new Container();

    // Deduplicate asset loads — same asset may appear multiple times
    const textureCache = new Map<string, Texture | null>();

    const loadDeco = async (asset: string): Promise<Texture | null> => {
      if (textureCache.has(asset)) {
        return textureCache.get(asset) ?? null;
      }
      try {
        const url = `${base}${asset}`;
        const tex = await Assets.load<Texture>(encodeURI(url));
        tex.source.scaleMode = "nearest";
        textureCache.set(asset, tex);
        return tex;
      } catch {
        textureCache.set(asset, null);
        return null;
      }
    };

    // Load all unique assets in parallel
    const uniqueAssets = [...new Set(VILLAGE_DECORATIONS.map((d) => d.asset))];
    await Promise.all(uniqueAssets.map((a) => loadDeco(a)));

    // Place decoration sprites
    for (const piece of VILLAGE_DECORATIONS) {
      const tex = textureCache.get(piece.asset);
      if (!tex) continue;

      let finalTex = tex;
      if (piece.sourceRect) {
        finalTex = new Texture({
          source: tex.source,
          frame: new Rectangle(
            piece.sourceRect.x,
            piece.sourceRect.y,
            piece.sourceRect.w,
            piece.sourceRect.h,
          ),
        });
      }

      const sprite = new Sprite(finalTex);
      sprite.anchor.set(0.5, 1.0);
      sprite.width = piece.displayWidth;
      sprite.height = piece.displayHeight;
      sprite.position.set(piece.x, piece.y);
      decoLayer.addChild(sprite);
    }

    // Insert decoration layer above terrain (index 1) but below entities
    const insertIndex = Math.min(1, this.app.stage.children.length);
    this.app.stage.addChildAt(decoLayer, insertIndex);
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

        // One-shot animations: hide immediately on last frame, then destroy.
        // Setting visible=false prevents the fallback rectangle flash that
        // occurs if a render pass happens between onComplete and destroy.
        if (!isLoop) {
          anim.onComplete = () => {
            anim.visible = false;
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
      entity.visible = false;
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
    _params: Readonly<Record<string, unknown>>,
  ): void {
    const entity = this.entities.get(entityRef);
    if (!entity) return;

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
