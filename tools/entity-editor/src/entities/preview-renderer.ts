/**
 * Preview renderer module.
 *
 * Renders a live preview of the currently selected entity state
 * using plain Canvas 2D. Shows static sprites or animated spritesheets
 * with the configured parameters in real time.
 *
 * Uses the same HTMLImageElement + canvas approach as the spritesheet
 * explorer mini-previews, which is reliable and requires no WebGL.
 */

import {
  getState,
  subscribe,
  getSelectedEntity,
  getSelectedState,
} from "../app-state.js";
import type { SpritesheetState, StaticState } from "../app-state.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let lastAssetKey = "";
let animationRaf = 0;

/** Image cache keyed by asset path. */
const imgCache = new Map<string, HTMLImageElement>();

const container = document.getElementById("preview-container")!;

const CANVAS_W = 400;
const CANVAS_H = 240;

// ---------------------------------------------------------------------------
// Canvas setup
// ---------------------------------------------------------------------------

/** Ensure the preview canvas exists inside the container. */
function ensureCanvas(): void {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.style.imageRendering = "pixelated";
  container.appendChild(canvas);
  ctx = canvas.getContext("2d")!;
}

/** Stop any running animation loop. */
function stopAnimation(): void {
  if (animationRaf) {
    cancelAnimationFrame(animationRaf);
    animationRaf = 0;
  }
}

/** Clear the canvas. */
function clearCanvas(): void {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ---------------------------------------------------------------------------
// Image loading
// ---------------------------------------------------------------------------

/** Find the object URL for an asset path. */
function findAssetUrl(assetPath: string): string | null {
  const assets = getState().assets;
  const asset = assets.find((a) => a.path === assetPath);
  return asset?.objectUrl ?? null;
}

/** Load an HTMLImageElement, cached. Returns null if still loading. */
function loadImage(assetPath: string): HTMLImageElement | null {
  const cached = imgCache.get(assetPath);
  if (cached && cached.complete) return cached;

  const url = findAssetUrl(assetPath);
  if (!url) return null;

  if (cached) return null; // still loading

  const img = new Image();
  img.src = url;
  imgCache.set(assetPath, img);
  img.onload = () => renderPreview();
  return null;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * Render the preview for the current state.
 *
 * Static sprites: draw once, centered and scaled to displayWidth/Height.
 * Spritesheets: animate at fps, looping through the selected frame range.
 */
function renderPreview(): void {
  ensureCanvas();

  const entity = getSelectedEntity();
  const visualState = getSelectedState();
  const state = getState();

  // Build cache key
  let assetKey: string;
  if (!entity || !visualState || !visualState.asset) {
    assetKey = "empty";
  } else if (visualState.type === "spritesheet") {
    const ss = visualState as SpritesheetState;
    assetKey = `${state.selectedEntityId}|${state.selectedStateName}|ss|${ss.asset}|${ss.frameWidth}|${ss.frameHeight}|${ss.frameCount}|${ss.frameRow}|${ss.frameStart}|${ss.fps}`;
  } else {
    const st = visualState as StaticState;
    const sr = st.sourceRect;
    assetKey = `${state.selectedEntityId}|${state.selectedStateName}|st|${st.asset}|${sr?.x}|${sr?.y}|${sr?.w}|${sr?.h}`;
  }

  if (assetKey === lastAssetKey) return;
  lastAssetKey = assetKey;

  stopAnimation();
  clearCanvas();

  if (!entity || !visualState || !visualState.asset) return;

  const img = loadImage(visualState.asset);
  if (!img) return; // will re-render when loaded

  if (visualState.type === "spritesheet") {
    renderSpritesheet(img, entity.displayWidth, entity.displayHeight, visualState as SpritesheetState);
  } else {
    renderStatic(img, entity.displayWidth, entity.displayHeight, visualState as StaticState);
  }
}

/** Draw a static sprite (optionally cropped) centered in the canvas. */
function renderStatic(
  img: HTMLImageElement,
  dw: number,
  dh: number,
  state: StaticState,
): void {
  if (!ctx) return;

  ctx.imageSmoothingEnabled = false;
  const x = (CANVAS_W - dw) / 2;
  const y = (CANVAS_H - dh) / 2;

  if (state.sourceRect) {
    const sr = state.sourceRect;
    ctx.drawImage(img, sr.x, sr.y, sr.w, sr.h, x, y, dw, dh);
  } else {
    ctx.drawImage(img, x, y, dw, dh);
  }
}

/** Animate a spritesheet, looping through selected frames at fps. */
function renderSpritesheet(
  img: HTMLImageElement,
  dw: number,
  dh: number,
  ss: SpritesheetState,
): void {
  if (!ctx) return;

  const frameCount = ss.frameCount;
  const frameStart = ss.frameStart;
  const frameWidth = ss.frameWidth;
  const frameHeight = ss.frameHeight;
  const row = ss.frameRow;
  const interval = 1000 / ss.fps;

  let frame = 0;
  let lastTime = 0;

  const x = (CANVAS_W - dw) / 2;
  const y = (CANVAS_H - dh) / 2;
  const srcY = row * frameHeight;

  function tick(time: number): void {
    animationRaf = requestAnimationFrame(tick);

    if (time - lastTime < interval) return;
    lastTime = time;

    ctx!.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx!.imageSmoothingEnabled = false;

    const srcX = (frameStart + frame) * frameWidth;
    ctx!.drawImage(img, srcX, srcY, frameWidth, frameHeight, x, y, dw, dh);

    frame = (frame + 1) % frameCount;
  }

  animationRaf = requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the preview renderer. */
export function initPreviewRenderer(): void {
  subscribe(renderPreview);
}
