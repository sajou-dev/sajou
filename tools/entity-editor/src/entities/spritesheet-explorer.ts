/**
 * Spritesheet explorer module.
 *
 * Visual grid that slices a spritesheet by frameWidth/frameHeight, showing
 * each row with an animated mini-preview. Clicking a row auto-fills frameRow
 * and frameCount. Number inputs (Frame W / Frame H) let users set the cell
 * size directly. Row labels are editable and stored for state-name
 * suggestions. All frames in a row are shown in a scrollable strip.
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
 * Draws frames from frameStart..frameStart+frameCount cycling at ~fps.
 */
function animateRow(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  frameWidth: number,
  frameHeight: number,
  row: number,
  frameCount: number,
  fps: number,
  frameStart = 0,
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
      (frameStart + frame) * frameWidth, row * frameHeight, frameWidth, frameHeight,
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
  const renderKey = `${ss.asset}|${ss.frameWidth}|${ss.frameHeight}|${ss.frameRow}|${ss.frameStart}|${ss.frameCount}|${state.selectedEntityId}|${state.selectedStateName}`;
  if (renderKey === lastRenderKey) return;
  lastRenderKey = renderKey;

  stopAnimations();
  explorerEl.hidden = false;
  explorerEl.innerHTML = "";

  // Header with frameWidth / frameHeight number inputs
  const header = document.createElement("div");
  header.className = "ss-explorer-header";

  const title = document.createElement("h4");
  title.textContent = "Spritesheet Explorer";

  // Frame W/H inputs row
  const sizeRow = document.createElement("div");
  sizeRow.className = "ss-explorer-size-row";

  const widthLabel = document.createElement("span");
  widthLabel.className = "label-text";
  widthLabel.textContent = "Frame W";

  const widthInput = document.createElement("input");
  widthInput.type = "number";
  widthInput.min = "1";
  widthInput.max = String(Math.min(dims.width, 4096));
  widthInput.value = String(ss.frameWidth);
  widthInput.className = "num-input ss-explorer-num";

  widthInput.addEventListener("input", () => {
    const newW = Math.max(1, Number(widthInput.value));
    if (vs.type === "spritesheet") {
      (vs as SpritesheetState).frameWidth = newW;
      updateState({});
    }
  });

  const heightLabel = document.createElement("span");
  heightLabel.className = "label-text";
  heightLabel.textContent = "Frame H";

  const heightInput = document.createElement("input");
  heightInput.type = "number";
  heightInput.min = "1";
  heightInput.max = String(Math.min(dims.height, 4096));
  heightInput.value = String(ss.frameHeight);
  heightInput.className = "num-input ss-explorer-num";

  heightInput.addEventListener("input", () => {
    const newH = Math.max(1, Number(heightInput.value));
    if (vs.type === "spritesheet") {
      (vs as SpritesheetState).frameHeight = newH;
      updateState({});
    }
  });

  const dimsInfo = document.createElement("span");
  dimsInfo.className = "ss-explorer-dims";
  dimsInfo.textContent = `${dims.width}\u00D7${dims.height}px \u2022 ${cols}\u00D7${rows} grid`;

  sizeRow.appendChild(widthLabel);
  sizeRow.appendChild(widthInput);
  sizeRow.appendChild(heightLabel);
  sizeRow.appendChild(heightInput);
  sizeRow.appendChild(dimsInfo);

  // Instruction text above the grid
  const helpText = document.createElement("p");
  helpText.className = "ss-explorer-help";
  helpText.textContent = "Click a row to select it, or click individual frames to pick a sub-range.";

  header.appendChild(title);
  header.appendChild(helpText);
  header.appendChild(sizeRow);
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

    // Mini animated preview canvas (respect aspect ratio, large enough to see)
    const previewCanvas = document.createElement("canvas");
    previewCanvas.className = "ss-explorer-preview";
    const thumbW = 56;
    const thumbH = Math.round(56 * ss.frameHeight / ss.frameWidth);
    const cappedH = Math.min(Math.max(thumbH, 32), 72);
    previewCanvas.width = thumbW;
    previewCanvas.height = cappedH;

    // For the selected row, animate only the selected sub-range; otherwise full row
    const previewStart = r === ss.frameRow ? ss.frameStart : 0;
    const previewCount = r === ss.frameRow ? ss.frameCount : nonEmpty;
    animateRow(previewCanvas, img, ss.frameWidth, ss.frameHeight, r, previewCount, ss.fps || 10, previewStart);

    // Frame strip: show individual frames as small clickable thumbnails
    const strip = document.createElement("div");
    strip.className = "ss-explorer-strip";

    for (let c = 0; c < nonEmpty; c++) {
      const frameCanvas = document.createElement("canvas");
      frameCanvas.className = "ss-explorer-frame";
      // Highlight selected frames in the current row
      if (r === ss.frameRow && c >= ss.frameStart && c < ss.frameStart + ss.frameCount) {
        frameCanvas.classList.add("selected-frame");
      }
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

      // Click: set frameStart to this column, frameCount=1 (single frame)
      // Shift+click: extend range from current frameStart to clicked column
      const col = c;
      const row = r;
      frameCanvas.addEventListener("click", (e) => {
        e.stopPropagation();
        if (vs.type !== "spritesheet") return;
        const ssState = vs as SpritesheetState;
        ssState.frameRow = row;

        if (e.shiftKey && row === ss.frameRow) {
          // Extend range: from min(frameStart, col) to max
          const rangeStart = Math.min(ssState.frameStart, col);
          const rangeEnd = Math.max(ssState.frameStart + ssState.frameCount - 1, col);
          ssState.frameStart = rangeStart;
          ssState.frameCount = rangeEnd - rangeStart + 1;
        } else {
          ssState.frameStart = col;
          ssState.frameCount = 1;
        }
        updateState({});
      });

      strip.appendChild(frameCanvas);
    }

    // Frame count badge
    const countBadge = document.createElement("span");
    countBadge.className = "ss-explorer-count";
    countBadge.textContent = `${nonEmpty}f`;

    // Click to select this row (full row, frameStart reset to 0)
    rowEl.addEventListener("click", () => {
      if (vs.type !== "spritesheet") return;
      const ssState = vs as SpritesheetState;
      ssState.frameRow = r;
      ssState.frameStart = 0;
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

  // Selected-row info text
  const footer = document.createElement("div");
  footer.className = "ss-explorer-footer";

  if (ss.frameRow >= 0 && ss.frameRow < rows) {
    const info = document.createElement("p");
    info.className = "ss-explorer-info";
    if (ss.frameCount === 1) {
      info.textContent = `Row ${ss.frameRow}, frame ${ss.frameStart} selected (static). Click another frame or Shift+click to select a range.`;
    } else {
      const endFrame = ss.frameStart + ss.frameCount - 1;
      info.textContent = `Row ${ss.frameRow}, frames ${ss.frameStart}\u2013${endFrame} selected (${ss.frameCount} frames at ${ss.fps}fps). Shift+click to adjust range.`;
    }
    footer.appendChild(info);
  }

  explorerEl.appendChild(footer);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the spritesheet explorer. */
export function initSpritesheetExplorer(): void {
  subscribe(render);
}
