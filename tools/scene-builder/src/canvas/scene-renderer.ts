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

import { Container, Graphics, Sprite, Text, TextStyle, Texture, ImageSource, Rectangle } from "pixi.js";
import { getSceneState, subscribeScene } from "../state/scene-state.js";
import { getEditorState, subscribeEditor } from "../state/editor-state.js";
import { getEntityStore, subscribeEntities } from "../state/entity-store.js";
import { getAssetStore, subscribeAssets } from "../state/asset-store.js";
import { isRunModeActive } from "../run-mode/run-mode-state.js";
import { getLayers } from "./canvas.js";
import type { PlacedEntity, EntityEntry, SceneLayer } from "../types.js";
import { buildPathPoints } from "../tools/route-tool.js";
import { flattenRoutePath } from "../tools/route-math.js";

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
// Zone grid overlay
// ---------------------------------------------------------------------------

let zoneGridGraphics: Graphics | null = null;

/** Render the painted zone grid overlay. */
function renderZoneGrid(): void {
  const sceneLayers = getLayers();
  if (!sceneLayers) return;

  if (!zoneGridGraphics) {
    zoneGridGraphics = new Graphics();
    zoneGridGraphics.label = "zone-grid";
    zoneGridGraphics.zIndex = 0;
    sceneLayers.ground.addChild(zoneGridGraphics);
  }

  zoneGridGraphics.clear();

  // Hide during run mode
  if (isRunModeActive()) return;

  const { zoneGrid, zoneTypes } = getSceneState();
  const { activeTool } = getEditorState();
  const isBackgroundTool = activeTool === "background";

  // Alpha: full when background tool active, ghost otherwise
  const alpha = isBackgroundTool ? 0.35 : 0.12;

  // Build color lookup from zone types
  const colorMap = new Map<string, number>();
  for (const zt of zoneTypes) {
    colorMap.set(zt.id, parseHexColor(zt.color));
  }

  const { cellSize, cols, rows, cells } = zoneGrid;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const zoneId = cells[r * cols + c];
      if (zoneId === null || zoneId === undefined) continue;
      const color = colorMap.get(zoneId);
      if (color === undefined) continue;

      zoneGridGraphics.rect(c * cellSize, r * cellSize, cellSize, cellSize);
      zoneGridGraphics.fill({ color, alpha });
    }
  }
}

/** Parse hex color string to numeric (e.g. "#E8A851" → 0xE8A851). */
function parseHexColor(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

// ---------------------------------------------------------------------------
// Entity sprite management
// ---------------------------------------------------------------------------

/** Map of PlacedEntity.id → Sprite for diff-based updates. */
const entitySprites = new Map<string, Sprite>();

/** Map of PlacedEntity.id → fallback Graphics (colored rect). */
const entityFallbacks = new Map<string, Graphics>();

/**
 * Get a PixiJS sprite by PlacedEntity ID.
 * Used by run-mode-sink to drive sprite transforms during choreography execution.
 */
export function getEntitySpriteById(placedId: string): Sprite | null {
  return entitySprites.get(placedId) ?? null;
}

/**
 * Get a cached base texture by asset path.
 * Used by run-mode-animator to slice spritesheet frame textures.
 */
export function getCachedTexture(assetPath: string): Texture | null {
  return textureCache.get(assetPath) ?? null;
}

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

    // In run mode, the sink manages transforms — only apply on initial creation
    // or when not in run mode. Always apply z-ordering and visibility.
    if (!isRunModeActive()) {
      applyPlacedTransform(sprite, placed, def, layer);
    }
    sprite.visible = true;
  }

  sceneLayers.objects.sortChildren();
}

/**
 * Apply position, scale, rotation, opacity, flip, and layer-based z-ordering.
 *
 * Composite zIndex = layerOrder * 10000 + placed.zIndex.
 * This ensures entities on higher layers always render above lower layers,
 * while within a layer, per-instance zIndex controls stacking.
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

  // Layer-based z-ordering: layerOrder * 10000 + per-instance zIndex
  const layerOrder = layer?.order ?? 0;
  sprite.zIndex = layerOrder * 10000 + placed.zIndex;

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

  // Layer-based z-ordering: layerOrder * 10000 + per-instance zIndex
  const layerMap = buildLayerMap();
  const layer = layerMap.get(placed.layerId);
  const layerOrder = layer?.order ?? 0;
  gfx.zIndex = layerOrder * 10000 + placed.zIndex;

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

  // Hide selection during run mode
  if (isRunModeActive()) {
    selectionGraphics.clear();
    return;
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
// Binding drag highlight
// ---------------------------------------------------------------------------

let bindingHighlightGraphics: Graphics | null = null;

/**
 * Render binding drag highlights around actor entities.
 * When a choreographer→theme drag is active, all actors get a faint accent outline.
 * The hovered actor gets a bright accent outline.
 */
function renderBindingHighlight(): void {
  const sceneLayers = getLayers();
  if (!sceneLayers) return;

  if (!bindingHighlightGraphics) {
    bindingHighlightGraphics = new Graphics();
    bindingHighlightGraphics.label = "binding-highlight-overlay";
    sceneLayers.selection.addChild(bindingHighlightGraphics);
  }

  bindingHighlightGraphics.clear();

  const { bindingDragActive, bindingDropHighlightId } = getEditorState();
  if (!bindingDragActive) return;

  const { entities } = getSceneState();

  for (const placed of entities) {
    if (!placed.visible) continue;

    const def = getEntityDef(placed.entityId);
    const w = (def?.displayWidth ?? 32) * placed.scale;
    const h = (def?.displayHeight ?? 32) * placed.scale;
    const ax = def?.defaults.anchor?.[0] ?? 0.5;
    const ay = def?.defaults.anchor?.[1] ?? 0.5;

    const left = placed.x - w * ax;
    const top = placed.y - h * ay;

    const isHovered = placed.id === bindingDropHighlightId;

    // Draw accent outline
    bindingHighlightGraphics.rect(left - 3, top - 3, w + 6, h + 6);
    bindingHighlightGraphics.stroke({
      width: isHovered ? 2.5 : 1,
      color: 0xe8a851,
      alpha: isHovered ? 0.9 : 0.3,
    });
  }
}

// ---------------------------------------------------------------------------
// Position markers
// ---------------------------------------------------------------------------

/** Type hint badge letters. */
const TYPE_HINT_BADGES: Record<string, string> = {
  spawn: "S",
  waypoint: "W",
  destination: "D",
};

/** Label text style (shared). */
const LABEL_STYLE = new TextStyle({
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 10,
  fill: "#ffffff",
});

const positionContainers = new Map<string, Container>();

/** Render position markers in the positions layer. */
function renderPositions(): void {
  const sceneLayers = getLayers();
  if (!sceneLayers) return;

  // Hide all position markers during run mode — they're editor-only
  if (isRunModeActive()) {
    for (const [, container] of positionContainers) container.visible = false;
    return;
  }
  for (const [, container] of positionContainers) container.visible = true;

  const { positions } = getSceneState();
  const { activeTool, selectedPositionIds } = getEditorState();
  const isPositionTool = activeTool === "position";
  const currentIds = new Set(positions.map((p) => p.id));

  // Remove orphaned containers
  for (const [id, container] of positionContainers) {
    if (!currentIds.has(id)) {
      sceneLayers.positions.removeChild(container);
      container.destroy({ children: true });
      positionContainers.delete(id);
    }
  }

  // Add/update position markers
  for (const pos of positions) {
    let container = positionContainers.get(pos.id);
    const isSelected = selectedPositionIds.includes(pos.id);

    if (!container) {
      container = new Container();
      container.label = pos.id;
      sceneLayers.positions.addChild(container);
      positionContainers.set(pos.id, container);
    }

    // Clear and redraw
    container.removeChildren();

    // Diamond marker
    const size = isSelected ? 8 : 6; // half-size
    const diamond = new Graphics();
    diamond.moveTo(0, -size);
    diamond.lineTo(size, 0);
    diamond.lineTo(0, size);
    diamond.lineTo(-size, 0);
    diamond.closePath();
    diamond.fill({ color: pos.color, alpha: 1 });

    if (isSelected) {
      diamond.stroke({ color: 0x58a6ff, width: 2, alpha: 1 });
    } else {
      diamond.stroke({ color: darkenColor(pos.color, 0.3), width: 1, alpha: 1 });
    }
    container.addChild(diamond);

    // Type hint badge
    const badge = TYPE_HINT_BADGES[pos.typeHint];
    if (badge) {
      const badgeText = new Text({ text: badge, style: new TextStyle({
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 7,
        fill: "#000000",
        fontWeight: "bold",
      }) });
      badgeText.anchor.set(0.5);
      badgeText.y = 0;
      container.addChild(badgeText);
    }

    // Name label above
    const label = new Text({ text: pos.name, style: LABEL_STYLE });
    label.anchor.set(0.5, 1);
    label.y = -(size + 4);

    // Label pill background
    const pad = 3;
    const pillW = label.width + pad * 2;
    const pillH = label.height + pad;
    const pill = new Graphics();
    pill.roundRect(
      -pillW / 2,
      label.y - label.height / 2 - pad / 2,
      pillW,
      pillH,
      3,
    );
    pill.fill({ color: isSelected ? 0x58a6ff : 0x0e0e16, alpha: 0.85 });
    container.addChild(pill);
    container.addChild(label);

    // Position
    container.x = pos.x;
    container.y = pos.y;

    // Ghost mode: dim when not position tool
    container.alpha = isPositionTool ? 1 : 0.4;
  }
}

/** Darken a hex color by a factor (0-1). */
function darkenColor(hex: string, factor: number): number {
  const clean = hex.replace("#", "");
  const r = Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) * (1 - factor)));
  const g = Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) * (1 - factor)));
  const b = Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) * (1 - factor)));
  return (r << 16) | (g << 8) | b;
}

// ---------------------------------------------------------------------------
// Route rendering
// ---------------------------------------------------------------------------

/** Parse a hex color string to a numeric value. */
function parseColor(hex: string): number {
  const clean = hex.replace("#", "");
  return parseInt(clean, 16);
}

/** Draw an arrowhead at a given point, pointing in direction (dx, dy). */
function drawArrowhead(
  gfx: Graphics,
  tipX: number, tipY: number,
  fromX: number, fromY: number,
  size: number,
  color: number,
  alpha: number,
): void {
  const dx = tipX - fromX;
  const dy = tipY - fromY;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;

  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular
  const px = -uy;
  const py = ux;

  const baseX = tipX - ux * size;
  const baseY = tipY - uy * size;

  gfx.moveTo(tipX, tipY);
  gfx.lineTo(baseX + px * size * 0.5, baseY + py * size * 0.5);
  gfx.lineTo(baseX - px * size * 0.5, baseY - py * size * 0.5);
  gfx.closePath();
  gfx.fill({ color, alpha });
}

// ---------------------------------------------------------------------------
// Dashed line helpers
// ---------------------------------------------------------------------------

// sampleQuadratic and flattenRoutePath imported from route-math.ts

/** Draw a dashed polyline into a Graphics object. */
function drawDashedPolyline(
  gfx: Graphics,
  pts: Array<{ x: number; y: number }>,
  dashLen: number,
  gapLen: number,
  color: number,
  width: number,
  alpha: number,
): void {
  if (pts.length < 2) return;

  let drawing = true; // true = dash, false = gap
  let remain = dashLen;
  let cx = pts[0]!.x;
  let cy = pts[0]!.y;

  gfx.moveTo(cx, cy);

  for (let i = 1; i < pts.length; i++) {
    const tx = pts[i]!.x;
    const ty = pts[i]!.y;
    let dx = tx - cx;
    let dy = ty - cy;
    let segLen = Math.hypot(dx, dy);

    while (segLen > 0) {
      const step = Math.min(remain, segLen);
      const ratio = segLen > 0 ? step / segLen : 0;

      const nx = cx + dx * ratio;
      const ny = cy + dy * ratio;

      if (drawing) {
        gfx.lineTo(nx, ny);
      } else {
        gfx.moveTo(nx, ny);
      }

      remain -= step;
      segLen -= step;
      cx = nx;
      cy = ny;
      dx = tx - cx;
      dy = ty - cy;

      if (remain <= 0) {
        drawing = !drawing;
        remain = drawing ? dashLen : gapLen;
        // Start new stroke segment after a gap
        if (drawing) {
          gfx.stroke({ color, width, alpha });
          gfx.moveTo(cx, cy);
        }
      }
    }
  }

  // Final stroke for any remaining dash
  if (drawing) {
    gfx.stroke({ color, width, alpha });
  }
}

const routeContainers = new Map<string, Container>();

/** Render routes in the routes layer. */
function renderRoutes(): void {
  const sceneLayers = getLayers();
  if (!sceneLayers) return;

  // Hide all route visuals during run mode — they're editor-only markers
  if (isRunModeActive()) {
    for (const [, container] of routeContainers) container.visible = false;
    return;
  }
  for (const [, container] of routeContainers) container.visible = true;

  const { routes } = getSceneState();
  const { activeTool, selectedRouteIds } = getEditorState();
  const isRouteTool = activeTool === "route";
  const currentIds = new Set(routes.map((r) => r.id));

  // Remove orphaned containers
  for (const [id, container] of routeContainers) {
    if (!currentIds.has(id)) {
      sceneLayers.routes.removeChild(container);
      container.destroy({ children: true });
      routeContainers.delete(id);
    }
  }

  // Add/update route visuals
  for (const route of routes) {
    const points = buildPathPoints(route);
    if (points.length < 2) continue;

    const isSelected = selectedRouteIds.includes(route.id);
    const color = parseColor(route.color);

    let container = routeContainers.get(route.id);
    if (!container) {
      container = new Container();
      container.label = route.id;
      sceneLayers.routes.addChild(container);
      routeContainers.set(route.id, container);
    }

    // Clear previous drawing
    container.removeChildren();

    // --- Path line ---
    const pathGfx = new Graphics();
    const lineWidth = isSelected ? 2.5 : 1.5;
    const lineAlpha = isSelected ? 1 : 0.8;

    if (route.style === "dashed") {
      // Flatten curves into polyline, then draw dashed
      const flat = flattenRoutePath(points, route.points);
      drawDashedPolyline(pathGfx, flat, 8, 5, color, lineWidth, lineAlpha);
    } else {
      pathGfx.moveTo(points[0]!.x, points[0]!.y);

      for (let i = 1; i < points.length; i++) {
        const curr = points[i]!;
        const rp = route.points[i]!;

        if (rp.cornerStyle === "smooth" && i < points.length - 1) {
          const next = points[i + 1]!;
          const midX = (curr.x + next.x) / 2;
          const midY = (curr.y + next.y) / 2;
          pathGfx.quadraticCurveTo(curr.x, curr.y, midX, midY);
        } else {
          pathGfx.lineTo(curr.x, curr.y);
        }
      }

      pathGfx.stroke({ color, width: lineWidth, alpha: lineAlpha });
    }
    container.addChild(pathGfx);

    // --- Arrowhead at end ---
    const lastPt = points[points.length - 1]!;
    const prevPt = points[points.length - 2]!;
    const arrowGfx = new Graphics();
    drawArrowhead(arrowGfx, lastPt.x, lastPt.y, prevPt.x, prevPt.y, 8, color, lineAlpha);

    // Bidirectional: arrow at start too
    if (route.bidirectional) {
      const firstPt = points[0]!;
      const secondPt = points[1]!;
      drawArrowhead(arrowGfx, firstPt.x, firstPt.y, secondPt.x, secondPt.y, 8, color, lineAlpha);
    }

    container.addChild(arrowGfx);

    // --- Point handles (only when route tool active and route selected) ---
    if (isRouteTool && isSelected) {
      for (let pi = 0; pi < route.points.length; pi++) {
        const rp = route.points[pi]!;
        const handleGfx = new Graphics();
        const handleSize = 4;
        const isEndpoint = pi === 0 || pi === route.points.length - 1;

        if (rp.cornerStyle === "smooth") {
          // Circle handle for smooth
          handleGfx.circle(rp.x, rp.y, handleSize);
        } else {
          // Square handle for sharp
          handleGfx.rect(
            rp.x - handleSize,
            rp.y - handleSize,
            handleSize * 2,
            handleSize * 2,
          );
        }

        // Endpoints are filled with route color, intermediate with white
        handleGfx.fill({ color: isEndpoint ? color : 0xffffff, alpha: 1 });
        handleGfx.stroke({ color, width: 1.5, alpha: 1 });
        container.addChild(handleGfx);

        // Waypoint name label (if named)
        if (rp.name) {
          const wpLabel = new Text({
            text: rp.name,
            style: new TextStyle({
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 8,
              fill: "#ffffff",
            }),
          });
          wpLabel.anchor.set(0.5, 0);
          wpLabel.x = rp.x;
          wpLabel.y = rp.y + handleSize + 3;

          // Label pill background
          const wpPad = 2;
          const wpPillW = wpLabel.width + wpPad * 2;
          const wpPillH = wpLabel.height + wpPad;
          const wpPill = new Graphics();
          wpPill.roundRect(
            rp.x - wpPillW / 2,
            wpLabel.y - wpPad / 2,
            wpPillW,
            wpPillH,
            2,
          );
          wpPill.fill({ color: 0x0e0e16, alpha: 0.85 });
          container.addChild(wpPill);
          container.addChild(wpLabel);
        }
      }
    }

    // --- Route name label (when selected) ---
    if (isSelected) {
      // Place label at midpoint of the path
      const midIdx = Math.floor(points.length / 2);
      const midPt = points[midIdx]!;
      const nameLabel = new Text({
        text: route.name,
        style: new TextStyle({
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 9,
          fill: "#ffffff",
        }),
      });
      nameLabel.anchor.set(0.5, 1);
      nameLabel.x = midPt.x;
      nameLabel.y = midPt.y - 8;

      // Label background pill
      const pad = 3;
      const pillW = nameLabel.width + pad * 2;
      const pillH = nameLabel.height + pad;
      const pill = new Graphics();
      pill.roundRect(
        midPt.x - pillW / 2,
        nameLabel.y - nameLabel.height / 2 - pad / 2,
        pillW,
        pillH,
        3,
      );
      pill.fill({ color: 0x0e0e16, alpha: 0.85 });
      container.addChild(pill);
      container.addChild(nameLabel);
    }

    // Ghost mode: dim when not route tool
    container.alpha = isRouteTool ? 1 : 0.3;
  }
}

// ---------------------------------------------------------------------------
// Route creation preview (in-progress path drawing)
// ---------------------------------------------------------------------------

let routePreviewGraphics: Graphics | null = null;

/** Render the live preview during route creation. */
function renderRouteCreationPreview(): void {
  const sceneLayers = getLayers();
  if (!sceneLayers) return;

  if (!routePreviewGraphics) {
    routePreviewGraphics = new Graphics();
    routePreviewGraphics.label = "route-creation-preview";
    sceneLayers.routes.addChild(routePreviewGraphics);
  }

  // No preview during run mode
  if (isRunModeActive()) {
    routePreviewGraphics.clear();
    return;
  }

  routePreviewGraphics.clear();

  const { routeCreationPreview } = getEditorState();
  if (!routeCreationPreview) return;

  const { points, cursor } = routeCreationPreview;
  if (points.length === 0) return;

  const previewColor = 0xe8a851; // Ember accent

  // Draw placed segments (with smooth curve support matching renderRoutes)
  routePreviewGraphics.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    const curr = points[i]!;
    if (curr.cornerStyle === "smooth" && i < points.length - 1) {
      const next = points[i + 1]!;
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      routePreviewGraphics.quadraticCurveTo(curr.x, curr.y, midX, midY);
    } else {
      routePreviewGraphics.lineTo(curr.x, curr.y);
    }
  }
  routePreviewGraphics.stroke({ color: previewColor, width: 2, alpha: 0.9 });

  // Dashed line from last placed point to cursor
  if (cursor && points.length > 0) {
    const last = points[points.length - 1]!;
    routePreviewGraphics.moveTo(last.x, last.y);
    routePreviewGraphics.lineTo(cursor.x, cursor.y);
    routePreviewGraphics.stroke({ color: previewColor, width: 1, alpha: 0.4 });
  }

  // Draw point handles
  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!;
    const isFirst = i === 0;
    const handleSize = isFirst ? 5 : 4;

    if (pt.cornerStyle === "smooth") {
      routePreviewGraphics.circle(pt.x, pt.y, handleSize);
    } else {
      routePreviewGraphics.rect(
        pt.x - handleSize,
        pt.y - handleSize,
        handleSize * 2,
        handleSize * 2,
      );
    }
    routePreviewGraphics.fill({ color: isFirst ? previewColor : 0xffffff, alpha: 1 });
    routePreviewGraphics.stroke({ color: previewColor, width: 1.5, alpha: 1 });
  }
}

// ---------------------------------------------------------------------------
// Actor badges (◆ indicator for entities with semanticId)
// ---------------------------------------------------------------------------

let actorBadgeGraphics: Graphics | null = null;

/** Render small diamond badges on entities that have a semanticId (actors). */
function renderActorBadges(): void {
  const sceneLayers = getLayers();
  if (!sceneLayers) return;

  if (!actorBadgeGraphics) {
    actorBadgeGraphics = new Graphics();
    actorBadgeGraphics.label = "actor-badges";
    sceneLayers.selection.addChild(actorBadgeGraphics);
  }

  // Hide actor badges during run mode
  if (isRunModeActive()) {
    actorBadgeGraphics.clear();
    return;
  }

  actorBadgeGraphics.clear();

  const { entities } = getSceneState();
  const entityStore = getEntityStore();

  for (const placed of entities) {
    if (!placed.semanticId || !placed.visible) continue;

    const def = entityStore.entities[placed.entityId];
    const w = (def?.displayWidth ?? 32) * placed.scale;
    const h = (def?.displayHeight ?? 32) * placed.scale;
    const ax = def?.defaults.anchor?.[0] ?? 0.5;
    const ay = def?.defaults.anchor?.[1] ?? 0.5;

    // Badge at top-right corner of entity bounds
    const right = placed.x + w * (1 - ax);
    const top = placed.y - h * ay;
    const bx = right - 2;
    const by = top + 2;
    const bs = 4; // badge half-size

    // Diamond shape
    actorBadgeGraphics.moveTo(bx, by - bs);
    actorBadgeGraphics.lineTo(bx + bs, by);
    actorBadgeGraphics.lineTo(bx, by + bs);
    actorBadgeGraphics.lineTo(bx - bs, by);
    actorBadgeGraphics.closePath();
    actorBadgeGraphics.fill({ color: 0xe8a851, alpha: 0.9 });
  }
}

// ---------------------------------------------------------------------------
// Topology overlay (highlights when actor entity is selected)
// ---------------------------------------------------------------------------

let topologyGraphics: Graphics | null = null;

/**
 * Render topology overlay when a single actor entity is selected.
 * Shows: home waypoint (filled dot), accessible waypoints (outline),
 * available routes (highlighted path), dashed entity→home connection,
 * and Alt+drag association preview line.
 */
function renderTopologyOverlay(): void {
  const sceneLayers = getLayers();
  if (!sceneLayers) return;

  if (!topologyGraphics) {
    topologyGraphics = new Graphics();
    topologyGraphics.label = "topology-overlay";
    sceneLayers.selection.addChild(topologyGraphics);
  }

  topologyGraphics.clear();

  // Hide topology during run mode
  if (isRunModeActive()) return;

  const { selectedIds, topologyAssociationPreview } = getEditorState();
  const { entities, positions, routes } = getSceneState();

  // Draw association preview line (Alt+drag)
  if (topologyAssociationPreview) {
    const { fromX, fromY, toX, toY } = topologyAssociationPreview;
    drawDashedPolyline(
      topologyGraphics,
      [{ x: fromX, y: fromY }, { x: toX, y: toY }],
      6, 4, 0xe8a851, 1.5, 0.8,
    );
    topologyGraphics.circle(toX, toY, 6);
    topologyGraphics.stroke({ color: 0xe8a851, width: 1.5, alpha: 0.8 });
  }

  // Only show topology overlay for single-selected actor entities
  if (selectedIds.length !== 1) return;

  const placed = entities.find((e) => e.id === selectedIds[0]);
  if (!placed?.semanticId || !placed.topology) return;

  const topo = placed.topology;
  const allPositionIds = new Set<string>();
  if (topo.home) allPositionIds.add(topo.home);
  for (const wp of topo.waypoints) allPositionIds.add(wp);

  if (allPositionIds.size === 0) return;

  const posMap = new Map(positions.map((p) => [p.id, p]));
  const ACCENT = 0xe8a851;

  // Home waypoint: filled circle
  if (topo.home) {
    const homePos = posMap.get(topo.home);
    if (homePos) {
      topologyGraphics.circle(homePos.x, homePos.y, 10);
      topologyGraphics.fill({ color: ACCENT, alpha: 0.9 });
    }
  }

  // Accessible waypoints (excluding home): outlined circles
  for (const wpId of topo.waypoints) {
    if (wpId === topo.home) continue;
    const wp = posMap.get(wpId);
    if (!wp) continue;
    topologyGraphics.circle(wp.x, wp.y, 8);
    topologyGraphics.stroke({ color: ACCENT, width: 2, alpha: 0.5 });
  }

  // Highlight routes between topology positions
  const topoRoutes = routes.filter((r) =>
    r.fromPositionId && r.toPositionId
    && allPositionIds.has(r.fromPositionId) && allPositionIds.has(r.toPositionId),
  );
  for (const route of topoRoutes) {
    const pts = buildPathPoints(route);
    if (pts.length < 2) continue;
    const flat = flattenRoutePath(pts, route.points);
    topologyGraphics.moveTo(flat[0]!.x, flat[0]!.y);
    for (let i = 1; i < flat.length; i++) {
      topologyGraphics.lineTo(flat[i]!.x, flat[i]!.y);
    }
    topologyGraphics.stroke({ color: ACCENT, width: 3, alpha: 0.3 });
  }

  // Dashed line from entity to home waypoint
  if (topo.home) {
    const homePos = posMap.get(topo.home);
    if (homePos) {
      drawDashedPolyline(
        topologyGraphics,
        [{ x: placed.x, y: placed.y }, { x: homePos.x, y: homePos.y }],
        6, 4, ACCENT, 1, 0.6,
      );
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
    renderZoneGrid();
    void renderEntities();
    renderPositions();
    renderRoutes();
    renderRouteCreationPreview();
    renderTopologyOverlay();
    renderSelection();
    renderBindingHighlight();
    renderActorBadges();
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
