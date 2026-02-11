/**
 * Scene preview module.
 *
 * Opens a fullscreen overlay that renders the current editor scene using
 * PixiJS — directly from the scene/entity/asset stores. No external
 * runtime packages (@sajou/core, @sajou/theme-citadel) are needed.
 *
 * The rendering mirrors scene-renderer.ts: same blob-URL texture loading,
 * same transform logic, same spritesheet frame slicing.
 */

import {
  Application,
  Container,
  Graphics,
  Sprite,
  AnimatedSprite,
  Text,
  TextStyle,
  Texture,
  ImageSource,
  Rectangle,
} from "pixi.js";

import { getSceneState } from "../state/scene-state.js";
import { getEntityStore } from "../state/entity-store.js";
import { getAssetStore } from "../state/asset-store.js";
import { buildPathPoints } from "../tools/route-tool.js";
import type {
  PlacedEntity,
  EntityEntry,
  SceneRoute,
  SceneLayer,
} from "../types.js";

// ---------------------------------------------------------------------------
// Active preview state
// ---------------------------------------------------------------------------

let activePreview: {
  app: Application;
  overlay: HTMLElement;
  keyHandler: (e: KeyboardEvent) => void;
} | null = null;

// ---------------------------------------------------------------------------
// Texture loading (same approach as scene-renderer.ts)
// ---------------------------------------------------------------------------

/**
 * Local texture cache scoped to the preview session.
 * Cleared when the preview is closed.
 */
const previewTexCache = new Map<string, Texture>();

/** Find the object URL for an asset path from the asset store. */
function findAssetUrl(assetPath: string): string | null {
  const asset = getAssetStore().assets.find((a) => a.path === assetPath);
  return asset?.objectUrl ?? null;
}

/** Load an HTMLImageElement from a URL (blob or http). */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

/**
 * Load and cache a texture from an asset path.
 *
 * Bypasses PixiJS Assets.load() because blob URLs have no extension
 * hint. Instead loads via HTMLImageElement → ImageSource → Texture.
 */
async function loadTexture(assetPath: string): Promise<Texture | null> {
  const cached = previewTexCache.get(assetPath);
  if (cached) return cached;

  const url = findAssetUrl(assetPath);
  if (!url) return null;

  try {
    const img = await loadImage(url);
    const source = new ImageSource({ resource: img, scaleMode: "nearest" });
    const tex = new Texture({ source });
    previewTexCache.set(assetPath, tex);
    return tex;
  } catch {
    return null;
  }
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
// Rendering helpers
// ---------------------------------------------------------------------------

/**
 * Apply transform to a display object (Sprite or AnimatedSprite).
 * Mirrors scene-renderer.ts applyPlacedTransform.
 */
function applyPlacedTransform(
  sprite: Sprite | AnimatedSprite,
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
function renderFallback(
  container: Container,
  placed: PlacedEntity,
  def: EntityEntry | null,
  layer: SceneLayer | undefined,
): void {
  const w = (def?.displayWidth ?? 32) * placed.scale;
  const h = (def?.displayHeight ?? 32) * placed.scale;
  const color = def?.fallbackColor ?? "#666666";

  const gfx = new Graphics();
  gfx.rect(-w / 2, -h / 2, w, h);
  gfx.fill({ color, alpha: 0.6 });
  gfx.stroke({ color, width: 1, alpha: 1 });

  gfx.x = placed.x;
  gfx.y = placed.y;
  gfx.rotation = (placed.rotation * Math.PI) / 180;
  gfx.alpha = placed.opacity;

  // Layer-based z-ordering: layerOrder * 10000 + per-instance zIndex
  const layerOrder = layer?.order ?? 0;
  gfx.zIndex = layerOrder * 10000 + placed.zIndex;

  container.addChild(gfx);
}

// ---------------------------------------------------------------------------
// Position markers
// ---------------------------------------------------------------------------

/** Render diamond markers for scene positions. */
function renderPositions(container: Container): void {
  const { positions } = getSceneState();

  const labelStyle = new TextStyle({
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 10,
    fill: "#ffffff",
  });

  for (const pos of positions) {
    const group = new Container();

    // Diamond marker
    const size = 6;
    const diamond = new Graphics();
    diamond.moveTo(0, -size);
    diamond.lineTo(size, 0);
    diamond.lineTo(0, size);
    diamond.lineTo(-size, 0);
    diamond.closePath();
    diamond.fill({ color: pos.color, alpha: 1 });
    diamond.stroke({ color: darkenColor(pos.color, 0.3), width: 1, alpha: 1 });
    group.addChild(diamond);

    // Name label above
    const label = new Text({ text: pos.name, style: labelStyle });
    label.anchor.set(0.5, 1);
    label.y = -(size + 4);

    // Label pill background
    const pad = 3;
    const pillW = label.width + pad * 2;
    const pillH = label.height + pad;
    const pill = new Graphics();
    pill.roundRect(-pillW / 2, label.y - label.height / 2 - pad / 2, pillW, pillH, 3);
    pill.fill({ color: 0x0e0e16, alpha: 0.85 });
    group.addChild(pill);
    group.addChild(label);

    group.x = pos.x;
    group.y = pos.y;
    group.zIndex = 9000;
    container.addChild(group);
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
  return parseInt(hex.replace("#", ""), 16);
}

/** Draw an arrowhead at a given point. */
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

/** Render routes (paths with arrowheads). */
function renderRoutes(container: Container): void {
  const { routes } = getSceneState();

  for (const route of routes) {
    const points = buildPathPoints(route);
    if (points.length < 2) continue;

    const color = parseColor(route.color);
    const group = new Container();
    group.zIndex = 8000;

    // Path line
    const pathGfx = new Graphics();

    if (route.style === "dashed") {
      drawDashedPath(pathGfx, points, route, color);
    } else {
      drawSolidPath(pathGfx, points, route, color);
    }
    group.addChild(pathGfx);

    // Arrowhead at end
    const lastPt = points[points.length - 1]!;
    const prevPt = points[points.length - 2]!;
    const arrowGfx = new Graphics();
    drawArrowhead(arrowGfx, lastPt.x, lastPt.y, prevPt.x, prevPt.y, 8, color, 0.8);

    if (route.bidirectional) {
      const firstPt = points[0]!;
      const secondPt = points[1]!;
      drawArrowhead(arrowGfx, firstPt.x, firstPt.y, secondPt.x, secondPt.y, 8, color, 0.8);
    }
    group.addChild(arrowGfx);

    container.addChild(group);
  }
}

/** Draw a solid route path. */
function drawSolidPath(
  gfx: Graphics,
  points: Array<{ x: number; y: number }>,
  route: SceneRoute,
  color: number,
): void {
  gfx.moveTo(points[0]!.x, points[0]!.y);

  for (let i = 1; i < points.length; i++) {
    const curr = points[i]!;
    const rp = route.points[i]!;

    if (rp.cornerStyle === "smooth" && i < points.length - 1) {
      const next = points[i + 1]!;
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      gfx.quadraticCurveTo(curr.x, curr.y, midX, midY);
    } else {
      gfx.lineTo(curr.x, curr.y);
    }
  }

  gfx.stroke({ color, width: 1.5, alpha: 0.8 });
}

/** Draw a dashed route path (flattened to polyline). */
function drawDashedPath(
  gfx: Graphics,
  points: Array<{ x: number; y: number }>,
  route: SceneRoute,
  color: number,
): void {
  // Flatten smooth curves into a polyline
  const flat = flattenRoutePath(points, route.points);
  drawDashedPolyline(gfx, flat, 8, 5, color, 1.5, 0.8);
}

/** Sample a quadratic Bézier curve into segments. */
function sampleQuadratic(
  x0: number, y0: number,
  cx: number, cy: number,
  x1: number, y1: number,
  step: number,
): Array<{ x: number; y: number }> {
  const dist = Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy);
  const segments = Math.max(2, Math.ceil(dist / step));
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    pts.push({
      x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
      y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
    });
  }
  return pts;
}

/** Flatten a route into a polyline of evenly-spaced sample points. */
function flattenRoutePath(
  points: Array<{ x: number; y: number }>,
  routePoints: Array<{ cornerStyle: "sharp" | "smooth" }>,
): Array<{ x: number; y: number }> {
  if (points.length < 2) return [...points];

  const result: Array<{ x: number; y: number }> = [{ x: points[0]!.x, y: points[0]!.y }];

  for (let i = 1; i < points.length; i++) {
    const curr = points[i]!;
    const rp = routePoints[i]!;

    if (rp.cornerStyle === "smooth" && i < points.length - 1) {
      const next = points[i + 1]!;
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      const prev = result[result.length - 1]!;
      const sampled = sampleQuadratic(prev.x, prev.y, curr.x, curr.y, midX, midY, 4);
      result.push(...sampled);
    } else {
      result.push({ x: curr.x, y: curr.y });
    }
  }

  return result;
}

/** Draw a dashed polyline. */
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

  let drawing = true;
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
        if (drawing) {
          gfx.stroke({ color, width, alpha });
          gfx.moveTo(cx, cy);
        }
      }
    }
  }

  if (drawing) {
    gfx.stroke({ color, width, alpha });
  }
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

/** Create the preview overlay DOM. */
function createOverlay(): HTMLElement {
  const overlay = document.createElement("div");
  overlay.id = "preview-overlay";
  overlay.innerHTML = `
    <div class="preview-header">
      <div class="preview-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span>Scene Preview</span>
      </div>
      <div class="preview-controls">
        <div class="preview-status" id="preview-status">Initializing…</div>
        <button class="preview-close" id="preview-close" title="Close preview (Escape)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="preview-canvas-container" id="preview-canvas-container"></div>
    <div class="preview-log" id="preview-log"></div>
  `;

  return overlay;
}

/** Add a line to the preview log panel. */
function logToPreview(msg: string): void {
  const logEl = document.getElementById("preview-log");
  if (!logEl) return;
  const line = document.createElement("div");
  line.className = "preview-log-line";
  const time = new Date().toISOString().slice(11, 23);
  line.textContent = `[${time}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

/** Update the status indicator. */
function setStatus(text: string): void {
  const el = document.getElementById("preview-status");
  if (el) el.textContent = text;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Whether a preview is currently open. */
export function isPreviewOpen(): boolean {
  return activePreview !== null;
}

/**
 * Open the scene preview.
 *
 * Creates a fullscreen overlay with a PixiJS canvas that renders the
 * current editor scene directly from the scene/entity/asset stores.
 */
export async function openPreview(): Promise<void> {
  if (activePreview) return;

  const sceneState = getSceneState();
  const entityStore = getEntityStore();

  // Create overlay
  const overlay = createOverlay();
  document.body.appendChild(overlay);

  // Close button + Escape key
  const closeBtn = document.getElementById("preview-close")!;
  closeBtn.addEventListener("click", closePreview);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") closePreview();
  };
  document.addEventListener("keydown", onKeyDown);

  logToPreview("Building preview scene…");
  setStatus("Loading…");

  // Parse background color
  const bgHex = sceneState.background.color.replace("#", "");
  const bgColor = parseInt(bgHex, 16) || 0x222222;

  // Create PixiJS application
  const canvasContainer = document.getElementById("preview-canvas-container")!;
  const app = new Application();

  await app.init({
    width: sceneState.dimensions.width,
    height: sceneState.dimensions.height,
    background: bgColor,
    antialias: true,
  });

  canvasContainer.appendChild(app.canvas);

  // Scene container with sortable children
  const sceneContainer = new Container();
  sceneContainer.sortableChildren = true;
  app.stage.addChild(sceneContainer);

  // Render placed entities
  const layerMap = buildLayerMap();
  let entityCount = 0;
  for (const placed of sceneState.entities) {
    if (!placed.visible) continue;

    const def = entityStore.entities[placed.entityId] ?? null;
    const layer = layerMap.get(placed.layerId);

    if (!def) {
      renderFallback(sceneContainer, placed, null, layer);
      entityCount++;
      continue;
    }

    const tex = await loadTexture(def.visual.source);

    if (!tex) {
      renderFallback(sceneContainer, placed, def, layer);
      entityCount++;
      continue;
    }

    // Spritesheet → AnimatedSprite with idle animation
    if (def.visual.type === "spritesheet") {
      const animSprite = buildAnimatedSprite(tex, placed, def);
      if (animSprite) {
        applyPlacedTransform(animSprite, placed, def, layer);
        sceneContainer.addChild(animSprite);
        entityCount++;
        continue;
      }
    }

    // Static sprite (or spritesheet fallback)
    const sprite = new Sprite(tex);

    // Apply sourceRect cropping for static sprites
    if (def.visual.type === "sprite" && def.visual.sourceRect) {
      const sr = def.visual.sourceRect;
      sprite.texture = new Texture({
        source: tex.source,
        frame: new Rectangle(sr.x, sr.y, sr.w, sr.h),
      });
    }

    // For spritesheets without animation, show first frame
    if (def.visual.type === "spritesheet") {
      const visual = def.visual;
      const cols = visual.frameWidth > 0 ? Math.floor(tex.width / visual.frameWidth) : 0;
      if (cols > 0 && visual.frameHeight > 0) {
        sprite.texture = new Texture({
          source: tex.source,
          frame: new Rectangle(0, 0, visual.frameWidth, visual.frameHeight),
        });
      }
    }

    applyPlacedTransform(sprite, placed, def, layer);
    sceneContainer.addChild(sprite);
    entityCount++;
  }

  logToPreview(`Rendered ${String(entityCount)} entities.`);

  // Render positions
  renderPositions(sceneContainer);
  logToPreview(`Rendered ${String(sceneState.positions.length)} positions.`);

  // Render routes
  renderRoutes(sceneContainer);
  logToPreview(`Rendered ${String(sceneState.routes.length)} routes.`);

  // Sort children by zIndex
  sceneContainer.sortChildren();

  // Store active state
  activePreview = { app, overlay, keyHandler: onKeyDown };

  setStatus("Ready");
  logToPreview("Preview ready.");
}

/**
 * Build an AnimatedSprite for a spritesheet entity.
 *
 * Finds the active animation (or idle fallback), slices frames from
 * the texture, and starts playback.
 */
function buildAnimatedSprite(
  tex: Texture,
  placed: PlacedEntity,
  def: EntityEntry,
): AnimatedSprite | null {
  if (def.visual.type !== "spritesheet") return null;

  const visual = def.visual;
  const cols = visual.frameWidth > 0 ? Math.floor(tex.width / visual.frameWidth) : 0;
  if (cols === 0) return null;

  // Find animation — prefer active state, fall back to idle, then first available
  const animName = placed.activeState;
  const anim =
    visual.animations[animName] ??
    visual.animations["idle"] ??
    Object.values(visual.animations)[0];

  if (!anim || anim.frames.length === 0) return null;

  // Slice frame textures
  const frameTextures: Texture[] = [];
  for (const frameIndex of anim.frames) {
    const fx = (frameIndex % cols) * visual.frameWidth;
    const fy = Math.floor(frameIndex / cols) * visual.frameHeight;

    // Bounds check
    if (fx + visual.frameWidth > tex.width || fy + visual.frameHeight > tex.height) {
      continue;
    }

    frameTextures.push(
      new Texture({
        source: tex.source,
        frame: new Rectangle(fx, fy, visual.frameWidth, visual.frameHeight),
      }),
    );
  }

  if (frameTextures.length === 0) return null;

  const animated = new AnimatedSprite(frameTextures);
  animated.animationSpeed = anim.fps / 60; // PixiJS uses speed relative to 60fps
  animated.loop = anim.loop !== false;
  animated.play();

  return animated;
}

/** Close the preview and clean up resources. */
export function closePreview(): void {
  if (!activePreview) return;

  const { app, overlay, keyHandler } = activePreview;

  // Remove escape key handler
  document.removeEventListener("keydown", keyHandler);

  // Destroy PixiJS app
  app.destroy(true);

  // Remove overlay
  overlay.remove();

  // Clear preview texture cache
  previewTexCache.clear();

  activePreview = null;
}
