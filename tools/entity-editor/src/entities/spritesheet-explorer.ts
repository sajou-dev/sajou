/**
 * Spritesheet explorer module.
 *
 * Visual grid that slices a spritesheet by frameWidth/frameHeight, showing
 * each row with an animated mini-preview. Clicking a row auto-fills frameRow
 * and frameCount. Two sliders (Frame W / Frame H) let users find the right
 * cell size visually. Row labels are editable and stored for state-name
 * suggestions.
 *
 * Single-row strips (e.g. 1728x192 = 9 frames) are supported — the explorer
 * shows whenever at least 2 frames exist (cols > 1).
 *
 * Auto-detection: when an asset is first bound to a spritesheet state, if the
 * image looks like a single horizontal strip (height <= width / 2), the
 * explorer proposes frameHeight = imageHeight, frameWidth = imageHeight.
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
  frameWidth: number,
  frameHeight: number,
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
      frame * frameWidth, row * frameHeight, frameWidth, frameHeight,
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
  frameWidth: number,
  frameHeight: number,
  row: number,
  maxCols: number,
): number {
  const canvas = document.createElement("canvas");
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const ctx = canvas.getContext("2d")!;

  let count = 0;
  for (let col = 0; col < maxCols; col++) {
    ctx.clearRect(0, 0, frameWidth, frameHeight);
    ctx.drawImage(
      img,
      col * frameWidth, row * frameHeight, frameWidth, frameHeight,
      0, 0, frameWidth, frameHeight,
    );

    const data = ctx.getImageData(0, 0, frameWidth, frameHeight).data;
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
// Auto-detection
// ---------------------------------------------------------------------------

/** Track which assets have already been auto-detected to avoid re-proposing. */
const autoDetected = new Set<string>();

/**
 * Auto-detect frame dimensions for a spritesheet asset.
 *
 * Heuristic: if the image looks like a single horizontal strip
 * (height <= width / 2), propose frameHeight = imageHeight and
 * frameWidth = imageHeight (square assumption for strips).
 */
function tryAutoDetect(ss: SpritesheetState, dims: { width: number; height: number }): void {
  const key = `${ss.asset}|${dims.width}|${dims.height}`;
  if (autoDetected.has(key)) return;
  autoDetected.add(key);

  // Only auto-detect for wide strips
  if (dims.height <= dims.width / 2) {
    ss.frameHeight = dims.height;
    ss.frameWidth = dims.height; // square assumption
    const cols = Math.floor(dims.width / ss.frameWidth);
    if (cols > 0) {
      ss.frameCount = cols;
    }
    updateState({});
  }
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

  // Auto-detect on first bind
  tryAutoDetect(ss, dims);

  const cols = Math.floor(dims.width / ss.frameWidth);
  const rows = Math.floor(dims.height / ss.frameHeight);

  // Show whenever at least 2 frames exist (cols > 1), even for single-row strips
  if (cols < 2 || rows < 1) {
    explorerEl.hidden = true;
    stopAnimations();
    lastRenderKey = "";
    return;
  }

  // Build a render key to skip needless DOM rebuilds
  const state = getState();
  const renderKey = `${ss.asset}|${ss.frameWidth}|${ss.frameHeight}|${ss.frameRow}|${state.selectedEntityId}|${state.selectedStateName}`;
  if (renderKey === lastRenderKey) return;
  lastRenderKey = renderKey;

  stopAnimations();
  explorerEl.hidden = false;
  explorerEl.innerHTML = "";

  // Header with frameWidth / frameHeight sliders
  const header = document.createElement("div");
  header.className = "ss-explorer-header";

  const title = document.createElement("h4");
  title.textContent = "Spritesheet Explorer";

  // Frame Width slider
  const widthRow = document.createElement("div");
  widthRow.className = "ss-explorer-size-row";

  const widthLabel = document.createElement("span");
  widthLabel.className = "label-text";
  widthLabel.textContent = "Frame W";

  const widthSlider = document.createElement("input");
  widthSlider.type = "range";
  widthSlider.min = "8";
  widthSlider.max = String(Math.min(dims.width, 4096));
  widthSlider.step = "1";
  widthSlider.value = String(ss.frameWidth);
  widthSlider.className = "ss-explorer-slider";

  const widthValue = document.createElement("span");
  widthValue.className = "val-display";
  widthValue.textContent = `${ss.frameWidth}px`;

  widthSlider.addEventListener("input", () => {
    const newW = Math.max(1, Number(widthSlider.value));
    widthValue.textContent = `${newW}px`;
    if (vs.type === "spritesheet") {
      (vs as SpritesheetState).frameWidth = newW;
      updateState({});
    }
  });

  widthRow.appendChild(widthLabel);
  widthRow.appendChild(widthSlider);
  widthRow.appendChild(widthValue);

  // Frame Height slider
  const heightRow = document.createElement("div");
  heightRow.className = "ss-explorer-size-row";

  const heightLabel = document.createElement("span");
  heightLabel.className = "label-text";
  heightLabel.textContent = "Frame H";

  const heightSlider = document.createElement("input");
  heightSlider.type = "range";
  heightSlider.min = "8";
  heightSlider.max = String(Math.min(dims.height, 4096));
  heightSlider.step = "1";
  heightSlider.value = String(ss.frameHeight);
  heightSlider.className = "ss-explorer-slider";

  const heightValue = document.createElement("span");
  heightValue.className = "val-display";
  heightValue.textContent = `${ss.frameHeight}px`;

  heightSlider.addEventListener("input", () => {
    const newH = Math.max(1, Number(heightSlider.value));
    heightValue.textContent = `${newH}px`;
    if (vs.type === "spritesheet") {
      (vs as SpritesheetState).frameHeight = newH;
      updateState({});
    }
  });

  heightRow.appendChild(heightLabel);
  heightRow.appendChild(heightSlider);
  heightRow.appendChild(heightValue);

  const dimsInfo = document.createElement("span");
  dimsInfo.className = "ss-explorer-dims";
  dimsInfo.textContent = `${dims.width}\u00D7${dims.height}px \u2022 ${cols}\u00D7${rows} grid`;

  header.appendChild(title);
  header.appendChild(widthRow);
  header.appendChild(heightRow);
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
    const nonEmpty = countNonEmptyFrames(img, ss.frameWidth, ss.frameHeight, r, cols);

    const rowEl = document.createElement("div");
    rowEl.className = "ss-explorer-row";
    if (r === ss.frameRow) rowEl.classList.add("selected");

    // Row number / label
    const rowLabelEl = document.createElement("span");
    rowLabelEl.className = "ss-explorer-row-label";
    const savedLabel = labels.get(r);
    rowLabelEl.textContent = savedLabel ? `${r}: ${savedLabel}` : `Row ${r}`;
    rowLabelEl.title = "Double-click to add a label";

    rowLabelEl.addEventListener("dblclick", (e) => {
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

      rowLabelEl.textContent = "";
      rowLabelEl.appendChild(input);
      input.focus();
      input.select();
    });

    // Mini animated preview canvas (respect aspect ratio)
    const previewCanvas = document.createElement("canvas");
    previewCanvas.className = "ss-explorer-preview";
    const thumbW = 48;
    const thumbH = Math.round(48 * ss.frameHeight / ss.frameWidth);
    const cappedH = Math.min(thumbH, 64);
    previewCanvas.width = thumbW;
    previewCanvas.height = cappedH;

    animateRow(previewCanvas, img, ss.frameWidth, ss.frameHeight, r, nonEmpty, ss.fps || 10);

    // Frame strip: show individual frames as small thumbnails
    const strip = document.createElement("div");
    strip.className = "ss-explorer-strip";

    for (let c = 0; c < Math.min(nonEmpty, 16); c++) {
      const frameCanvas = document.createElement("canvas");
      frameCanvas.className = "ss-explorer-frame";
      const fThumbW = 28;
      const fThumbH = Math.min(Math.round(28 * ss.frameHeight / ss.frameWidth), 48);
      frameCanvas.width = fThumbW;
      frameCanvas.height = fThumbH;
      const fctx = frameCanvas.getContext("2d")!;
      fctx.imageSmoothingEnabled = false;
      fctx.drawImage(
        img,
        c * ss.frameWidth, r * ss.frameHeight, ss.frameWidth, ss.frameHeight,
        0, 0, fThumbW, fThumbH,
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

    rowEl.appendChild(rowLabelEl);
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
