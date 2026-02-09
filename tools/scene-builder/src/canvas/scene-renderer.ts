/**
 * Scene renderer module.
 *
 * Syncs SceneState → PixiJS display objects. Subscribes to state changes
 * and diffs the display list to add/remove/update sprites.
 * Handles background fill, placed entities (with layer-based z-ordering),
 * and selection overlay.
 *
 * Ported from entity-editor/src/scene/scene-renderer.ts, adapted
 * for the entity-centric PlacedEntity model with generic scene layers.
 */

import { Graphics, Sprite, Texture, ImageSource, Rectangle } from "pixi.js";
import { getSceneState, subscribeScene } from "../state/scene-state.js";
import { getEditorState, subscribeEditor } from "../state/editor-state.js";
import { getEntityStore, subscribeEntities } from "../state/entity-store.js";
import { getAssetStore, subscribeAssets } from "../state/asset-store.js";
import { getLayers } from "./canvas.js";
import type { PlacedEntity, EntityEntry, SceneLayer } from "../types.js";

// ---------------------------------------------------------------------------
// Texture cache
// ---------------------------------------------------------------------------

const textureCache = new Map<string, Texture>();

/** Find the object URL for an asset path from the asset store. */
function findAssetUrl(assetPath: string): string | null {
  const asset = getAssetStore().assets.find((a) => a.path === assetPath);
  return asset?.objectUrl ?? null;
}

/**
 * Load and cache a texture from an asset path.
 *
 * We bypass PixiJS Assets.load() because blob URLs don't carry
 * file extension hints and PixiJS can't detect the parser to use.
 * Instead we load the image via HTMLImageElement and wrap it
 * in a Texture manually.
 */
async function loadTexture(assetPath: string): Promise<Texture | null> {
  const cached = textureCache.get(assetPath);
  if (cached) return cached;

  const url = findAssetUrl(assetPath);
  if (!url) return null;

  try {
    const img = await loadImage(url);
    const source = new ImageSource({ resource: img, scaleMode: "nearest" });
    const tex = new Texture({ source });
    textureCache.set(assetPath, tex);
    return tex;
  } catch {
    return null;
  }
}

/** Load an HTMLImageElement from a URL. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Layer helpers
// ---------------------------------------------------------------------------

/** Build a lookup map of layer ID → SceneLayer for fast access. */
function buildLayerMap(): Map<string, SceneLayer> {
  const { layers } = getSceneState();
  const map = new Map<string, SceneLayer>();
  for (const l of layers) map.set(l.id, l);
  return map;
}

// ---------------------------------------------------------------------------
// Background rendering — base fill color
// ---------------------------------------------------------------------------

let bgGraphics: Graphics | null = null;

/** Render the base fill color. */
function renderBackground(): void {
  const sceneLayers = getLayers();
  if (!sceneLayers) return;

  const { dimensions, background } = getSceneState();

  if (!bgGraphics) {
    bgGraphics = new Graphics();
    bgGraphics.label = "background-fill";
    bgGraphics.zIndex = -1;
    sceneLayers.ground.addChild(bgGraphics);
  }

  bgGraphics.clear();
  bgGraphics.rect(0, 0, dimensions.width, dimensions.height);
  bgGraphics.fill(background.color || "#1a1a2e");
}

// ---------------------------------------------------------------------------
// Entity sprite management
// ---------------------------------------------------------------------------

/** Map of PlacedEntity.id → Sprite for diff-based updates. */
const entitySprites = new Map<string, Sprite>();

/** Map of PlacedEntity.id → fallback Graphics (colored rect). */
const entityFallbacks = new Map<string, Graphics>();

/** Resolve the entity definition for a placed entity. */
function getEntityDef(entityId: string): EntityEntry | null {
  const store = getEntityStore();
  return store.entities[entityId] ?? null;
}

/** Render all placed entities. */
async function renderEntities(): Promise<void> {
  const sceneLayers = getLayers();
  if (!sceneLayers) return;

  const { entities } = getSceneState();
  const layerMap = buildLayerMap();
  const currentIds = new Set(entities.map((e) => e.id));

  // Remove sprites/fallbacks that no longer exist
  for (const [id, sprite] of entitySprites) {
    if (!currentIds.has(id)) {
      sceneLayers.objects.removeChild(sprite);
      sprite.destroy();
      entitySprites.delete(id);
    }
  }
  for (const [id, gfx] of entityFallbacks) {
    if (!currentIds.has(id)) {
      sceneLayers.objects.removeChild(gfx);
      gfx.destroy();
      entityFallbacks.delete(id);
    }
  }

  // Add/update sprites
  for (const placed of entities) {
    // Check layer visibility
    const layer = layerMap.get(placed.layerId);
    const layerHidden = layer ? !layer.visible : false;

    if (!placed.visible || layerHidden) {
      // Hide if entity or its layer is not visible
      const existing = entitySprites.get(placed.id);
      if (existing) existing.visible = false;
      const existingFb = entityFallbacks.get(placed.id);
      if (existingFb) existingFb.visible = false;
      continue;
    }

    const def = getEntityDef(placed.entityId);
    if (!def) {
      // No entity definition found — show fallback
      renderFallback(placed, null);
      continue;
    }

    const assetPath = def.visual.source;
    const tex = await loadTexture(assetPath);

    if (!tex) {
      renderFallback(placed, def);
      continue;
    }

    // Remove fallback if we now have a texture
    const fb = entityFallbacks.get(placed.id);
    if (fb) {
      sceneLayers.objects.removeChild(fb);
      fb.destroy();
      entityFallbacks.delete(placed.id);
    }

    let sprite = entitySprites.get(placed.id);
    if (!sprite) {
      sprite = new Sprite(tex);
      sprite.label = placed.id;
      sceneLayers.objects.addChild(sprite);
      entitySprites.set(placed.id, sprite);
    } else {
      sprite.texture = tex;
    }

    // Apply frame slicing for spritesheet visuals
    if (def.visual.type === "spritesheet") {
      const visual = def.visual;
      // Find active animation
      const animName = placed.activeState;
      const anim = visual.animations[animName];
      const cols = visual.frameWidth > 0 ? Math.floor(tex.width / visual.frameWidth) : 0;
      if (anim && anim.frames.length > 0 && cols > 0) {
        // Use first frame as static display (animation handled elsewhere)
        const frameIndex = anim.frames[0]!;
        const fx = (frameIndex % cols) * visual.frameWidth;
        const fy = Math.floor(frameIndex / cols) * visual.frameHeight;
        // Bounds check: ensure frame fits within texture
        if (fx + visual.frameWidth <= tex.width && fy + visual.frameHeight <= tex.height) {
          sprite.texture = new Texture({
            source: tex.source,
            frame: new Rectangle(fx, fy, visual.frameWidth, visual.frameHeight),
          });
        }
      }
    }

    // Apply sprite visual sourceRect cropping
    if (def.visual.type === "sprite" && def.visual.sourceRect) {
      const sr = def.visual.sourceRect;
      sprite.texture = new Texture({
        source: tex.source,
        frame: new Rectangle(sr.x, sr.y, sr.w, sr.h),
      });
    }

    applyPlacedTransform(sprite, placed, def, layer);
    sprite.visible = true;
  }

  sceneLayers.objects.sortChildren();
}

/**
 * Apply position, scale, rotation, opacity, flip, and layer-based z-ordering.
 *
 * Composite zIndex = layerOrder * 10000 + entityZIndex.
 * This ensures entities on higher layers always render above lower layers,
 * while within a layer, entity-level zIndex still applies.
 */
function applyPlacedTransform(
  sprite: Sprite,
  placed: PlacedEntity,
  def: EntityEntry,
  layer: SceneLayer | undefined,
): void {
  const anchorX = def.defaults.anchor?.[0] ?? 0.5;
  const anchorY = def.defaults.anchor?.[1] ?? 0.5;
  sprite.anchor.set(anchorX, anchorY);

  sprite.x = placed.x;
  sprite.y = placed.y;
  sprite.width = def.displayWidth * placed.scale;
  sprite.height = def.displayHeight * placed.scale;
  sprite.rotation = (placed.rotation * Math.PI) / 180;
  sprite.alpha = placed.opacity;

  // Layer-based z-ordering: layerOrder * 10000 + entity zIndex
  const layerOrder = layer?.order ?? 0;
  const entityZ = def.defaults.zIndex ?? 0;
  sprite.zIndex = layerOrder * 10000 + entityZ;

  // Flip via scale
  const baseScaleX = sprite.width / sprite.texture.width;
  const baseScaleY = sprite.height / sprite.texture.height;
  sprite.scale.x = placed.flipH ? -Math.abs(baseScaleX) : Math.abs(baseScaleX);
  sprite.scale.y = placed.flipV ? -Math.abs(baseScaleY) : Math.abs(baseScaleY);
}

/** Render a fallback colored rectangle for an entity without texture. */
function renderFallback(placed: PlacedEntity, def: EntityEntry | null): void {
  const sceneLayers = getLayers();
  if (!sceneLayers) return;

  // Hide sprite if exists
  const existing = entitySprites.get(placed.id);
  if (existing) existing.visible = false;

  let gfx = entityFallbacks.get(placed.id);
  if (!gfx) {
    gfx = new Graphics();
    gfx.label = `${placed.id}-fallback`;
    sceneLayers.objects.addChild(gfx);
    entityFallbacks.set(placed.id, gfx);
  }

  const w = (def?.displayWidth ?? 32) * placed.scale;
  const h = (def?.displayHeight ?? 32) * placed.scale;
  const color = def?.fallbackColor ?? "#666666";

  gfx.clear();
  gfx.rect(-w / 2, -h / 2, w, h);
  gfx.fill({ color, alpha: 0.6 });
  gfx.stroke({ color, width: 1, alpha: 1 });

  gfx.x = placed.x;
  gfx.y = placed.y;
  gfx.rotation = (placed.rotation * Math.PI) / 180;
  gfx.alpha = placed.opacity;

  // Layer-based z-ordering
  const layerMap = buildLayerMap();
  const layer = layerMap.get(placed.layerId);
  const layerOrder = layer?.order ?? 0;
  const entityZ = def?.defaults.zIndex ?? 0;
  gfx.zIndex = layerOrder * 10000 + entityZ;

  gfx.visible = placed.visible;
}

// ---------------------------------------------------------------------------
// Selection overlay
// ---------------------------------------------------------------------------

let selectionGraphics: Graphics | null = null;

/** Render selection highlights around selected entities. */
function renderSelection(): void {
  const sceneLayers = getLayers();
  if (!sceneLayers) return;

  if (!selectionGraphics) {
    selectionGraphics = new Graphics();
    selectionGraphics.label = "selection-overlay";
    sceneLayers.selection.addChild(selectionGraphics);
  }

  selectionGraphics.clear();

  const { selectedIds } = getEditorState();
  if (selectedIds.length === 0) return;

  const { entities } = getSceneState();

  for (const id of selectedIds) {
    const placed = entities.find((e) => e.id === id);
    if (!placed) continue;

    const def = getEntityDef(placed.entityId);
    const w = (def?.displayWidth ?? 32) * placed.scale;
    const h = (def?.displayHeight ?? 32) * placed.scale;
    const ax = def?.defaults.anchor?.[0] ?? 0.5;
    const ay = def?.defaults.anchor?.[1] ?? 0.5;

    const left = placed.x - w * ax;
    const top = placed.y - h * ay;

    // Selection rectangle
    selectionGraphics.rect(left - 2, top - 2, w + 4, h + 4);
    selectionGraphics.stroke({ width: 1.5, color: 0x58a6ff, alpha: 1 });

    // Corner handles
    const handleSize = 5;
    const corners = [
      { x: left, y: top },
      { x: left + w, y: top },
      { x: left, y: top + h },
      { x: left + w, y: top + h },
    ];
    for (const c of corners) {
      selectionGraphics.rect(
        c.x - handleSize / 2,
        c.y - handleSize / 2,
        handleSize,
        handleSize,
      );
      selectionGraphics.fill(0x58a6ff);
    }
  }
}

// ---------------------------------------------------------------------------
// Full render
// ---------------------------------------------------------------------------

let renderScheduled = false;

/** Schedule a full render on next frame. */
function scheduleRender(): void {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderBackground();
    void renderEntities();
    renderSelection();
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the scene renderer. Subscribes to all relevant state stores. */
export function initSceneRenderer(): void {
  subscribeScene(scheduleRender);
  subscribeEditor(scheduleRender);
  subscribeEntities(scheduleRender);
  subscribeAssets(scheduleRender);
  scheduleRender();
}
