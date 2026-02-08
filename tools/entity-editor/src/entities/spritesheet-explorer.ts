/**
 * Spritesheet explorer module.
 *
 * Visual grid that slices a spritesheet by frameSize, showing each row
 * with an animated mini-preview. Clicking a row auto-fills frameRow and
 * frameCount. A frameSize slider lets users find the right cell size
 * visually. Row labels are editable and stored for state-name suggestions.
 */

import {
  getState,
  subscribe,
  getSelectedEntity,
  getSelectedState,
  updateState,
} from "../app-state.js";
import type { SpritesheetState } from "../app-state.js";
import { getImageDimensions } from "./state-config.js";

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const explorerEl = document.getElementById("spritesheet-explorer")!;

// ---------------------------------------------------------------------------
// Row labels — persisted per asset path
// ---------------------------------------------------------------------------

/** asset path → (rowIndex → label). */
const rowLabels = new Map<string, Map<number, string>>();

/** Get all labels for an asset. */
function getLabelsForAsset(assetPath: string): Map<number, string> {
  let map = rowLabels.get(assetPath);
  if (!map) {
    map = new Map();
    rowLabels.set(assetPath, map);
  }
  return map;
}

/** Get label suggestions from all known labels. */
export function getLabelSuggestions(): string[] {
  const all = new Set<string>();
  for (const map of rowLabels.values()) {
    for (const label of map.values()) {
      if (label) all.add(label);
    }
  }
  return [...all].sort();
}

// ---------------------------------------------------------------------------
// Mini-animation engine (pure canvas, no PixiJS)
// ---------------------------------------------------------------------------

/** Track running animation intervals so we can clean them up. */
let activeAnimations: number[] = [];

/** Stop all row preview animations. */
function stopAnimations(): void {
  for (const id of activeAnimations) {
    cancelAnimationFrame(id);
  }
  activeAnimations = [];
}

/**
 * Animate a single row in a small canvas.
 * Draws frames 0..frameCount cycling at ~fps.
 */
function animateRow(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  frameSize: number,
  row: number,
  frameCount: number,
  fps: number,
): void {
  const ctx = canvas.getContext("2d")!;
  let frame = 0;
  let lastTime = 0;
  const interval = 1000 / fps;

  function tick(time: number): void {
    const raf = requestAnimationFrame(tick);
    activeAnimations.push(raf);

    if (time - lastTime < interval) return;
    lastTime = time;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      img,
      frame * frameSize, row * frameSize, frameSize, frameSize,
      0, 0, canvas.width, canvas.height,
    );
    frame = (frame + 1) % frameCount;
  }

  const raf = requestAnimationFrame(tick);
  activeAnimations.push(raf);
}

// ---------------------------------------------------------------------------
// Detect non-empty frame count per row
// ---------------------------------------------------------------------------

/**
 * Count the number of non-empty (non-transparent) frames in a row.
 * Uses a temporary canvas to sample pixel data.
 */
function countNonEmptyFrames(
  img: HTMLImageElement,
  frameSize: number,
  row: number,
  maxCols: number,
): number {
  const canvas = document.createElement("canvas");
  canvas.width = frameSize;
  canvas.height = frameSize;
  const ctx = canvas.getContext("2d")!;

  let count = 0;
  for (let col = 0; col < maxCols; col++) {
    ctx.clearRect(0, 0, frameSize, frameSize);
    ctx.drawImage(
      img,
      col * frameSize, row * frameSize, frameSize, frameSize,
      0, 0, frameSize, frameSize,
    );

    const data = ctx.getImageData(0, 0, frameSize, frameSize).data;
    let hasPixels = false;
    // Sample every 4th pixel for speed
    for (let i = 3; i < data.length; i += 16) {
      if (data[i]! > 10) {
        hasPixels = true;
        break;
      }
    }
    if (hasPixels) {
      count = col + 1; // track rightmost non-empty
    } else {
      break; // stop at first empty frame
    }
  }
  return Math.max(1, count);
}

// ---------------------------------------------------------------------------
// Image cache (HTMLImageElement for canvas drawing)
// ---------------------------------------------------------------------------

const imgCache = new Map<string, HTMLImageElement>();

/** Load an HTMLImageElement from an asset path, cached. */
function loadImage(assetPath: string): HTMLImageElement | null {
  const cached = imgCache.get(assetPath);
  if (cached && cached.complete) return cached;

  const asset = getState().assets.find((a) => a.path === assetPath);
  if (!asset) return null;

  if (cached) return null; // still loading

  const img = new Image();
  img.src = asset.objectUrl;
  imgCache.set(assetPath, img);
  img.onload = () => render();
  return null;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Key to avoid needless re-renders. */
let lastRenderKey = "";

/** Render the spritesheet explorer. */
function render(): void {
  const vs = getSelectedState();
  const entity = getSelectedEntity();

  // Only show for spritesheet type with a bound asset
  if (!vs || !entity || vs.type !== "spritesheet" || !vs.asset) {
    explorerEl.hidden = true;
    stopAnimations();
    lastRenderKey = "";
    return;
  }

  const ss = vs as SpritesheetState;
  const dims = getImageDimensions(ss.asset);
  if (!dims) {
    explorerEl.hidden = true;
    stopAnimations();
    lastRenderKey = "";
    return;
  }

  // Only show if the image has multiple rows
  const cols = Math.floor(dims.width / ss.frameSize);
  const rows = Math.floor(dims.height / ss.frameSize);
  if (rows < 2 || cols < 1) {
    explorerEl.hidden = true;
    stopAnimations();
    lastRenderKey = "";
    return;
  }

  // Build a render key to skip needless DOM rebuilds
  const state = getState();
  const renderKey = `${ss.asset}|${ss.frameSize}|${ss.frameRow}|${state.selectedEntityId}|${state.selectedStateName}`;
  if (renderKey === lastRenderKey) return;
  lastRenderKey = renderKey;

  stopAnimations();
  explorerEl.hidden = false;
  explorerEl.innerHTML = "";

  // Header with frameSize slider
  const header = document.createElement("div");
  header.className = "ss-explorer-header";

  const title = document.createElement("h4");
  title.textContent = "Spritesheet Explorer";

  const sizeRow = document.createElement("div");
  sizeRow.className = "ss-explorer-size-row";

  const sizeLabel = document.createElement("span");
  sizeLabel.className = "label-text";
  sizeLabel.textContent = "Frame size";

  const sizeSlider = document.createElement("input");
  sizeSlider.type = "range";
  sizeSlider.min = "8";
  sizeSlider.max = String(Math.min(256, Math.min(dims.width, dims.height)));
  sizeSlider.step = "1";
  sizeSlider.value = String(ss.frameSize);
  sizeSlider.className = "ss-explorer-slider";

  const sizeValue = document.createElement("span");
  sizeValue.className = "val-display";
  sizeValue.textContent = `${ss.frameSize}px`;

  sizeSlider.addEventListener("input", () => {
    const newSize = Math.max(1, Number(sizeSlider.value));
    sizeValue.textContent = `${newSize}px`;
    if (vs.type === "spritesheet") {
      (vs as SpritesheetState).frameSize = newSize;
      updateState({});
    }
  });

  const dimsInfo = document.createElement("span");
  dimsInfo.className = "ss-explorer-dims";
  dimsInfo.textContent = `${dims.width}\u00D7${dims.height}px \u2022 ${cols}\u00D7${rows} grid`;

  sizeRow.appendChild(sizeLabel);
  sizeRow.appendChild(sizeSlider);
  sizeRow.appendChild(sizeValue);

  header.appendChild(title);
  header.appendChild(sizeRow);
  header.appendChild(dimsInfo);
  explorerEl.appendChild(header);

  // Load the image for canvas drawing
  const img = loadImage(ss.asset);
  if (!img) return; // will re-render when loaded

  const labels = getLabelsForAsset(ss.asset);

  // Row list
  const rowList = document.createElement("div");
  rowList.className = "ss-explorer-rows";

  for (let r = 0; r < rows; r++) {
    const nonEmpty = countNonEmptyFrames(img, ss.frameSize, r, cols);

    const rowEl = document.createElement("div");
    rowEl.className = "ss-explorer-row";
    if (r === ss.frameRow) rowEl.classList.add("selected");

    // Row number / label
    const rowLabel = document.createElement("span");
    rowLabel.className = "ss-explorer-row-label";
    const savedLabel = labels.get(r);
    rowLabel.textContent = savedLabel ? `${r}: ${savedLabel}` : `Row ${r}`;
    rowLabel.title = "Double-click to add a label";

    rowLabel.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.type = "text";
      input.className = "ss-explorer-label-input";
      input.value = labels.get(r) ?? "";
      input.placeholder = "e.g. idle-down";
      input.spellcheck = false;

      const commit = (): void => {
        const val = input.value.trim();
        if (val) {
          labels.set(r, val);
        } else {
          labels.delete(r);
        }
        lastRenderKey = ""; // force re-render
        render();
      };

      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (ke) => {
        if (ke.key === "Enter") input.blur();
        if (ke.key === "Escape") {
          input.value = labels.get(r) ?? "";
          input.blur();
        }
      });

      rowLabel.textContent = "";
      rowLabel.appendChild(input);
      input.focus();
      input.select();
    });

    // Mini animated preview canvas
    const previewCanvas = document.createElement("canvas");
    previewCanvas.className = "ss-explorer-preview";
    const previewSize = 48;
    previewCanvas.width = previewSize;
    previewCanvas.height = previewSize;

    animateRow(previewCanvas, img, ss.frameSize, r, nonEmpty, ss.fps || 10);

    // Frame strip: show individual frames as small thumbnails
    const strip = document.createElement("div");
    strip.className = "ss-explorer-strip";

    for (let c = 0; c < Math.min(nonEmpty, 16); c++) {
      const frameCanvas = document.createElement("canvas");
      frameCanvas.className = "ss-explorer-frame";
      const thumbSize = 28;
      frameCanvas.width = thumbSize;
      frameCanvas.height = thumbSize;
      const fctx = frameCanvas.getContext("2d")!;
      fctx.imageSmoothingEnabled = false;
      fctx.drawImage(
        img,
        c * ss.frameSize, r * ss.frameSize, ss.frameSize, ss.frameSize,
        0, 0, thumbSize, thumbSize,
      );
      strip.appendChild(frameCanvas);
    }

    if (nonEmpty > 16) {
      const more = document.createElement("span");
      more.className = "ss-explorer-more";
      more.textContent = `+${nonEmpty - 16}`;
      strip.appendChild(more);
    }

    // Frame count badge
    const countBadge = document.createElement("span");
    countBadge.className = "ss-explorer-count";
    countBadge.textContent = `${nonEmpty}f`;

    // Click to select this row
    rowEl.addEventListener("click", () => {
      if (vs.type !== "spritesheet") return;
      const ssState = vs as SpritesheetState;
      ssState.frameRow = r;
      ssState.frameCount = nonEmpty;
      updateState({});
    });

    rowEl.appendChild(rowLabel);
    rowEl.appendChild(previewCanvas);
    rowEl.appendChild(strip);
    rowEl.appendChild(countBadge);
    rowList.appendChild(rowEl);
  }

  explorerEl.appendChild(rowList);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the spritesheet explorer. */
export function initSpritesheetExplorer(): void {
  subscribe(render);
}
