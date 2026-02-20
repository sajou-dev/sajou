/**
 * Preview renderer module.
 *
 * Renders a live preview of the currently selected entity state
 * using plain Canvas 2D. Shows static sprites or animated spritesheets
 * with the configured parameters in real time.
 *
 * Includes zoom controls (mouse wheel or +/- buttons) to inspect
 * the sprite at different scales.
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
let zoomLevel = 1;

const ZOOM_STEPS = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8];
const DEFAULT_ZOOM_INDEX = 2; // 1x
let zoomIndex = DEFAULT_ZOOM_INDEX;

/** Image cache keyed by asset path. */
const imgCache = new Map<string, HTMLImageElement>();

const container = document.getElementById("preview-container")!;

const CANVAS_W = 400;
const CANVAS_H = 240;

// ---------------------------------------------------------------------------
// Zoom toolbar
// ---------------------------------------------------------------------------

let zoomBar: HTMLDivElement | null = null;
let zoomLabel: HTMLSpanElement | null = null;

/** Build zoom controls above the canvas (once). */
function ensureZoomBar(): void {
  if (zoomBar) return;
  zoomBar = document.createElement("div");
  zoomBar.className = "preview-zoom-bar";

  const btnMinus = document.createElement("button");
  btnMinus.className = "btn btn-small btn-secondary";
  btnMinus.textContent = "\u2212"; // minus sign
  btnMinus.title = "Zoom out";
  btnMinus.addEventListener("click", () => applyZoom(zoomIndex - 1));

  const btnPlus = document.createElement("button");
  btnPlus.className = "btn btn-small btn-secondary";
  btnPlus.textContent = "+";
  btnPlus.title = "Zoom in";
  btnPlus.addEventListener("click", () => applyZoom(zoomIndex + 1));

  const btnReset = document.createElement("button");
  btnReset.className = "btn btn-small btn-secondary";
  btnReset.textContent = "1:1";
  btnReset.title = "Reset zoom to 1x";
  btnReset.addEventListener("click", () => applyZoom(DEFAULT_ZOOM_INDEX));

  zoomLabel = document.createElement("span");
  zoomLabel.className = "preview-zoom-label";
  updateZoomLabel();

  zoomBar.appendChild(btnMinus);
  zoomBar.appendChild(zoomLabel);
  zoomBar.appendChild(btnPlus);
  zoomBar.appendChild(btnReset);

  // Insert before the canvas container
  container.parentElement!.insertBefore(zoomBar, container);
}

/** Apply a new zoom index, clamped to valid range. */
function applyZoom(newIndex: number): void {
  const clamped = Math.max(0, Math.min(ZOOM_STEPS.length - 1, newIndex));
  if (clamped === zoomIndex) return;
  zoomIndex = clamped;
  zoomLevel = ZOOM_STEPS[zoomIndex]!;
  updateZoomLabel();
  // Force re-render by clearing the cache key
  lastAssetKey = "";
  renderPreview();
}

/** Update the zoom label text. */
function updateZoomLabel(): void {
  if (zoomLabel) {
    zoomLabel.textContent = `${zoomLevel}x`;
  }
}

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

  // Mouse wheel zoom on canvas
  container.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      applyZoom(zoomIndex + 1);
    } else {
      applyZoom(zoomIndex - 1);
    }
  }, { passive: false });
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
 * Static sprites: draw once, centered and scaled to displayWidth/Height * zoom.
 * Spritesheets: animate at fps, looping through the selected frame range.
 */
function renderPreview(): void {
  ensureCanvas();
  ensureZoomBar();

  const entity = getSelectedEntity();
  const visualState = getSelectedState();
  const state = getState();

  // Build cache key (includes zoom)
  let assetKey: string;
  if (!entity || !visualState || !visualState.asset) {
    assetKey = "empty";
  } else if (visualState.type === "spritesheet") {
    const ss = visualState as SpritesheetState;
    assetKey = `${state.selectedEntityId}|${state.selectedStateName}|ss|${ss.asset}|${ss.frameWidth}|${ss.frameHeight}|${ss.frameCount}|${ss.frameRow}|${ss.frameStart}|${ss.fps}|z${zoomLevel}`;
  } else {
    const st = visualState as StaticState;
    const sr = st.sourceRect;
    assetKey = `${state.selectedEntityId}|${state.selectedStateName}|st|${st.asset}|${sr?.x}|${sr?.y}|${sr?.w}|${sr?.h}|z${zoomLevel}`;
  }

  if (assetKey === lastAssetKey) return;
  lastAssetKey = assetKey;

  stopAnimation();
  clearCanvas();

  if (!entity || !visualState || !visualState.asset) return;

  const img = loadImage(visualState.asset);
  if (!img) return; // will re-render when loaded

  const dw = Math.round(entity.displayWidth * zoomLevel);
  const dh = Math.round(entity.displayHeight * zoomLevel);

  if (visualState.type === "spritesheet") {
    renderSpritesheet(img, dw, dh, visualState as SpritesheetState);
  } else {
    renderStatic(img, dw, dh, visualState as StaticState);
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
