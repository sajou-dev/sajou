/**
 * Scene preview module.
 *
 * Opens a fullscreen overlay that renders the current editor scene using
 * Three.js + Canvas2D — directly from the scene/entity/asset stores.
 * No external runtime packages (@sajou/core, @sajou/theme-citadel) needed.
 *
 * Three.js renders entities (horizontal PlaneGeometry on XZ plane) with
 * a top-down OrthographicCamera. Overlays (positions, routes) are drawn
 * on a transparent Canvas2D layer on top.
 */

import * as THREE from "three";
import {
  createTopDownCamera,
  loadTexture as stageLoadTexture,
  getCachedTexture,
  getCachedTextureSize,
  setUVFrame,
  clearTextureCache,
} from "@sajou/stage";

import { getSceneState } from "../state/scene-state.js";
import { getEntityStore } from "../state/entity-store.js";
import { getAssetStore } from "../state/asset-store.js";
import { buildPathPoints } from "../tools/route-tool.js";
import type {
  PlacedEntity,
  EntityEntry,
  SceneLayer,
} from "../types.js";

// ---------------------------------------------------------------------------
// Active preview state
// ---------------------------------------------------------------------------

let activePreview: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  overlay: HTMLElement;
  overlayCanvas: HTMLCanvasElement;
  keyHandler: (e: KeyboardEvent) => void;
  animFrameId: number;
  animatedEntities: AnimatedPreviewEntity[];
} | null = null;

/** Tracked animation for a preview entity. */
interface AnimatedPreviewEntity {
  mesh: THREE.Mesh;
  assetPath: string;
  frameWidth: number;
  frameHeight: number;
  frames: readonly number[];
  fps: number;
  loop: boolean;
  currentFrame: number;
  accumulator: number;
}

// ---------------------------------------------------------------------------
// Texture loading
// ---------------------------------------------------------------------------

/** Find the object URL for an asset path from the asset store. */
function findAssetUrl(assetPath: string): string | null {
  const asset = getAssetStore().assets.find((a) => a.path === assetPath);
  return asset?.objectUrl ?? null;
}

/** Load and cache a texture from an asset path via the stage loader. */
async function loadEntityTexture(assetPath: string): Promise<THREE.Texture | null> {
  const cached = getCachedTexture(assetPath);
  if (cached) return cached;

  const url = findAssetUrl(assetPath);
  if (!url) return null;

  return stageLoadTexture(assetPath, url);
}

// ---------------------------------------------------------------------------
// Layer helpers
// ---------------------------------------------------------------------------

/** Build a lookup map of layer ID → SceneLayer. */
function buildLayerMap(): Map<string, SceneLayer> {
  const { layers } = getSceneState();
  const map = new Map<string, SceneLayer>();
  for (const l of layers) map.set(l.id, l);
  return map;
}

// ---------------------------------------------------------------------------
// Entity rendering
// ---------------------------------------------------------------------------

/** Create a Three.js mesh for a placed entity. */
function createPreviewMesh(
  placed: PlacedEntity,
  def: EntityEntry,
  layer: SceneLayer | undefined,
  tex: THREE.Texture | null,
): THREE.Mesh {
  const w = def.displayWidth;
  const h = def.displayHeight;
  const ax = def.defaults.anchor?.[0] ?? 0.5;
  const ay = def.defaults.anchor?.[1] ?? 0.5;

  const geom = new THREE.PlaneGeometry(w, h);
  geom.rotateX(-Math.PI / 2);

  // Anchor offset
  const offsetX = (0.5 - ax) * w;
  const offsetZ = (0.5 - ay) * h;
  geom.translate(offsetX, 0, offsetZ);

  const material = new THREE.MeshBasicMaterial({
    color: tex ? 0xffffff : (def.fallbackColor || "#666666"),
    map: tex ?? undefined,
    transparent: true,
    alphaTest: 0.01,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geom, material);

  // Position
  mesh.position.set(placed.x, 0, placed.y);

  // Scale (includes flip)
  const scaleX = placed.flipH ? -placed.scale : placed.scale;
  const scaleY = placed.flipV ? -placed.scale : placed.scale;
  mesh.scale.set(scaleX, 1, scaleY);

  // Rotation
  mesh.rotation.y = -(placed.rotation * Math.PI) / 180;

  // Opacity
  material.opacity = placed.opacity;

  // Depth ordering
  const layerOrder = layer?.order ?? 0;
  mesh.renderOrder = layerOrder * 10000 + placed.zIndex;

  return mesh;
}

/** Render a fallback colored rectangle. */
function renderFallback(
  scene: THREE.Scene,
  placed: PlacedEntity,
  def: EntityEntry | null,
  layer: SceneLayer | undefined,
): void {
  const w = (def?.displayWidth ?? 32) * placed.scale;
  const h = (def?.displayHeight ?? 32) * placed.scale;
  const color = def?.fallbackColor ?? "#666666";

  const geom = new THREE.PlaneGeometry(w, h);
  geom.rotateX(-Math.PI / 2);

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geom, material);
  mesh.position.set(placed.x, 0, placed.y);
  mesh.rotation.y = -(placed.rotation * Math.PI) / 180;

  const layerOrder = layer?.order ?? 0;
  mesh.renderOrder = layerOrder * 10000 + placed.zIndex;

  scene.add(mesh);
}

// ---------------------------------------------------------------------------
// Canvas2D overlay drawing
// ---------------------------------------------------------------------------

/** Darken a hex color by a factor (0-1). */
function darkenColor(hex: string, factor: number): string {
  const clean = hex.replace("#", "");
  const r = Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) * (1 - factor)));
  const g = Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) * (1 - factor)));
  const b = Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) * (1 - factor)));
  return `rgb(${r},${g},${b})`;
}

/** Convert numeric color + alpha to "rgba(r,g,b,a)". */
function numAlpha(n: number, alpha: number): string {
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Draw a rounded rectangle path. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Render position markers on Canvas2D. */
function drawPositions(ctx: CanvasRenderingContext2D): void {
  const { positions } = getSceneState();

  for (const pos of positions) {
    const size = 6;

    // Diamond marker
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - size);
    ctx.lineTo(pos.x + size, pos.y);
    ctx.lineTo(pos.x, pos.y + size);
    ctx.lineTo(pos.x - size, pos.y);
    ctx.closePath();

    ctx.fillStyle = pos.color;
    ctx.fill();
    ctx.strokeStyle = darkenColor(pos.color, 0.3);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Name label
    ctx.save();
    const fontSize = 10;
    ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    const labelY = pos.y - size - 4;
    const metrics = ctx.measureText(pos.name);
    const pad = 3;
    const pillW = metrics.width + pad * 2;
    const pillH = fontSize + pad;

    ctx.fillStyle = numAlpha(0x0e0e16, 0.85);
    roundRect(ctx, pos.x - pillW / 2, labelY - pillH, pillW, pillH, 3);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(pos.name, pos.x, labelY);
    ctx.restore();
  }
}

/** Draw an arrowhead. */
function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  tipX: number, tipY: number,
  fromX: number, fromY: number,
  size: number,
  color: string,
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

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + px * size * 0.5, baseY + py * size * 0.5);
  ctx.lineTo(baseX - px * size * 0.5, baseY - py * size * 0.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Render routes on Canvas2D. */
function drawRoutes(ctx: CanvasRenderingContext2D): void {
  const { routes } = getSceneState();

  for (const route of routes) {
    const points = buildPathPoints(route);
    if (points.length < 2) continue;

    const color = route.color;

    // Path line
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);

    for (let i = 1; i < points.length; i++) {
      const curr = points[i]!;
      const rp = route.points[i]!;

      if (rp.cornerStyle === "smooth" && i < points.length - 1) {
        const next = points[i + 1]!;
        const midX = (curr.x + next.x) / 2;
        const midY = (curr.y + next.y) / 2;
        ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
      } else {
        ctx.lineTo(curr.x, curr.y);
      }
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Arrowhead at end
    const lastPt = points[points.length - 1]!;
    const prevPt = points[points.length - 2]!;
    drawArrowhead(ctx, lastPt.x, lastPt.y, prevPt.x, prevPt.y, 8, color);

    // Bidirectional: arrow at start
    if (route.bidirectional) {
      const firstPt = points[0]!;
      const secondPt = points[1]!;
      drawArrowhead(ctx, firstPt.x, firstPt.y, secondPt.x, secondPt.y, 8, color);
    }
  }
}

/** Draw all overlays on the Canvas2D. */
function drawOverlays(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  sceneWidth: number,
  sceneHeight: number,
): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Scale overlay to match scene → canvas mapping
  const scaleX = canvas.width / sceneWidth;
  const scaleY = canvas.height / sceneHeight;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (canvas.width - sceneWidth * scale) / 2;
  const offsetY = (canvas.height - sceneHeight * scale) / 2;

  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

  drawPositions(ctx);
  drawRoutes(ctx);

  ctx.restore();
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
// Animation loop
// ---------------------------------------------------------------------------

/** Main render + animation loop for the preview. */
function previewLoop(now: number, lastTime: { v: number }): void {
  if (!activePreview) return;

  const dt = now - lastTime.v;
  lastTime.v = now;

  // Advance spritesheet animations
  for (const anim of activePreview.animatedEntities) {
    const msPerFrame = 1000 / anim.fps;
    anim.accumulator += dt;

    while (anim.accumulator >= msPerFrame) {
      anim.accumulator -= msPerFrame;
      anim.currentFrame++;

      if (anim.currentFrame >= anim.frames.length) {
        if (anim.loop) {
          anim.currentFrame = 0;
        } else {
          anim.currentFrame = anim.frames.length - 1;
          break;
        }
      }
    }

    // Apply current frame UV
    const texSize = getCachedTextureSize(anim.assetPath);
    if (texSize) {
      const frameIndex = anim.frames[anim.currentFrame]!;
      const cols = Math.floor(texSize.width / anim.frameWidth);
      if (cols > 0) {
        const fx = (frameIndex % cols) * anim.frameWidth;
        const fy = Math.floor(frameIndex / cols) * anim.frameHeight;
        setUVFrame(anim.mesh, fx, fy, anim.frameWidth, anim.frameHeight, texSize.width, texSize.height);
      }
    }
  }

  // Render Three.js
  activePreview.renderer.render(activePreview.scene, activePreview.camera);

  activePreview.animFrameId = requestAnimationFrame((t) => previewLoop(t, lastTime));
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
 * Creates a fullscreen overlay with a Three.js canvas that renders the
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

  const { dimensions, background } = sceneState;
  const canvasContainer = document.getElementById("preview-canvas-container")!;

  // --- Three.js setup ---
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
  renderer.setSize(dimensions.width, dimensions.height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(parseInt(background.color.replace("#", ""), 16) || 0x222222);

  const webGLCanvas = renderer.domElement;
  webGLCanvas.style.position = "absolute";
  webGLCanvas.style.top = "0";
  webGLCanvas.style.left = "0";
  webGLCanvas.style.width = "100%";
  webGLCanvas.style.height = "100%";
  webGLCanvas.style.objectFit = "contain";
  canvasContainer.appendChild(webGLCanvas);

  const threeScene = new THREE.Scene();
  const camera = createTopDownCamera(dimensions.width, dimensions.height);

  // Set camera to show the full scene
  camera.left = 0;
  camera.right = dimensions.width;
  camera.top = 0;
  camera.bottom = dimensions.height;
  camera.updateProjectionMatrix();

  // Ambient light
  threeScene.add(new THREE.AmbientLight(0xffffff, 1.0));

  // Ground plane
  const groundGeom = new THREE.PlaneGeometry(dimensions.width, dimensions.height);
  groundGeom.rotateX(-Math.PI / 2);
  groundGeom.translate(dimensions.width / 2, 0, dimensions.height / 2);
  const groundMat = new THREE.MeshBasicMaterial({
    color: parseInt(background.color.replace("#", ""), 16) || 0x222222,
  });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.renderOrder = -1;
  threeScene.add(ground);

  // --- Canvas2D overlay ---
  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.width = dimensions.width;
  overlayCanvas.height = dimensions.height;
  overlayCanvas.style.position = "absolute";
  overlayCanvas.style.top = "0";
  overlayCanvas.style.left = "0";
  overlayCanvas.style.width = "100%";
  overlayCanvas.style.height = "100%";
  overlayCanvas.style.objectFit = "contain";
  overlayCanvas.style.pointerEvents = "none";
  canvasContainer.appendChild(overlayCanvas);

  const overlayCtx = overlayCanvas.getContext("2d")!;

  // --- Render entities ---
  const layerMap = buildLayerMap();
  let entityCount = 0;
  const animatedEntities: AnimatedPreviewEntity[] = [];

  for (const placed of sceneState.entities) {
    if (!placed.visible) continue;

    const def = entityStore.entities[placed.entityId] ?? null;
    const layer = layerMap.get(placed.layerId);

    if (!def) {
      renderFallback(threeScene, placed, null, layer);
      entityCount++;
      continue;
    }

    const tex = await loadEntityTexture(def.visual.source);

    if (!tex) {
      renderFallback(threeScene, placed, def, layer);
      entityCount++;
      continue;
    }

    const mesh = createPreviewMesh(placed, def, layer, tex);
    threeScene.add(mesh);

    // Spritesheet animation setup
    if (def.visual.type === "spritesheet") {
      const visual = def.visual;
      const texSize = getCachedTextureSize(visual.source);
      const cols = visual.frameWidth > 0 && texSize ? Math.floor(texSize.width / visual.frameWidth) : 0;

      // Find animation
      const animName = placed.activeState;
      const anim =
        visual.animations[animName] ??
        visual.animations["idle"] ??
        Object.values(visual.animations)[0];

      if (anim && anim.frames.length > 0 && cols > 0 && texSize) {
        // Set first frame UV
        const firstFrame = anim.frames[0]!;
        const fx = (firstFrame % cols) * visual.frameWidth;
        const fy = Math.floor(firstFrame / cols) * visual.frameHeight;

        if (fx + visual.frameWidth <= texSize.width && fy + visual.frameHeight <= texSize.height) {
          setUVFrame(mesh, fx, fy, visual.frameWidth, visual.frameHeight, texSize.width, texSize.height);
        }

        // Track for animation if multiple frames
        if (anim.frames.length > 1) {
          animatedEntities.push({
            mesh,
            assetPath: visual.source,
            frameWidth: visual.frameWidth,
            frameHeight: visual.frameHeight,
            frames: anim.frames,
            fps: anim.fps,
            loop: anim.loop !== false,
            currentFrame: 0,
            accumulator: 0,
          });
        }
      }
    }

    // Static sprite sourceRect cropping
    if (def.visual.type === "sprite" && def.visual.sourceRect) {
      const sr = def.visual.sourceRect;
      const texSize = getCachedTextureSize(def.visual.source);
      if (texSize) {
        setUVFrame(mesh, sr.x, sr.y, sr.w, sr.h, texSize.width, texSize.height);
      }
    }

    entityCount++;
  }

  logToPreview(`Rendered ${String(entityCount)} entities.`);

  // Draw Canvas2D overlays (positions, routes)
  drawOverlays(overlayCtx, overlayCanvas, dimensions.width, dimensions.height);
  logToPreview(`Rendered ${String(sceneState.positions.length)} positions.`);
  logToPreview(`Rendered ${String(sceneState.routes.length)} routes.`);

  // Initial render
  renderer.render(threeScene, camera);

  // Start animation loop
  const lastTime = { v: performance.now() };
  const animFrameId = requestAnimationFrame((t) => previewLoop(t, lastTime));

  // Store active state
  activePreview = {
    renderer,
    scene: threeScene,
    camera,
    overlay,
    overlayCanvas,
    keyHandler: onKeyDown,
    animFrameId,
    animatedEntities,
  };

  setStatus("Ready");
  logToPreview("Preview ready.");
}

/** Close the preview and clean up resources. */
export function closePreview(): void {
  if (!activePreview) return;

  const { renderer, overlay, keyHandler, animFrameId } = activePreview;

  // Stop animation loop
  cancelAnimationFrame(animFrameId);

  // Remove escape key handler
  document.removeEventListener("keydown", keyHandler);

  // Dispose Three.js
  renderer.dispose();

  // Remove overlay
  overlay.remove();

  // Clear preview texture cache
  clearTextureCache();

  activePreview = null;
}
