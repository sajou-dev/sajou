/**
 * Spritesheet explorer module.
 *
 * Visual grid that slices a spritesheet by frameWidth/frameHeight, showing
 * each row with an animated mini-preview. Users click frames to build
 * animation sequences. Adapted from entity-editor's spritesheet-explorer.ts
 * for the scene-builder's `frames: number[]` data model.
 *
 * Pure Canvas 2D — no PixiJS dependency.
 */

import { getAssetStore } from "../state/asset-store.js";
import type { EntityEntry, SpritesheetVisual } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Public API returned by the factory function. */
export interface SpritesheetExplorerAPI {
  /** Root DOM container to append inside the panel. */
  readonly element: HTMLElement;
  /** Re-render with current entity/visual data. */
  update(entity: EntityEntry, visual: SpritesheetVisual, activeAnimName: string | null): void;
  /** Clean up animation intervals. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a spritesheet explorer instance.
 *
 * @param onFrameToggle Called when the user clicks a frame (toggle or range-select).
 * @param onSelectRow   Called when the user clicks a row label (selects all non-empty frames).
 */
export function createSpritesheetExplorer(
  onFrameToggle: (animName: string, frameIndex: number, shiftKey: boolean) => void,
  onSelectRow: (animName: string, rowFrames: number[]) => void,
): SpritesheetExplorerAPI {
  // -------------------------------------------------------------------------
  // Internal state
  // -------------------------------------------------------------------------

  const root = document.createElement("div");
  root.className = "sse-container";

  /** Track running animation intervals for cleanup. */
  let activeAnimations: number[] = [];

  /** Image cache (HTMLImageElement for canvas drawing). */
  const imgCache = new Map<string, HTMLImageElement>();

  /** Row labels persisted per asset path. */
  const rowLabels = new Map<string, Map<number, string>>();

  /** Render-skip key. */
  let lastRenderKey = "";

  /** Current data snapshot for rendering. */
  let currentEntity: EntityEntry | null = null;
  let currentVisual: SpritesheetVisual | null = null;
  let currentAnimName: string | null = null;

  // -------------------------------------------------------------------------
  // Animation engine (pure canvas, no PixiJS)
  // -------------------------------------------------------------------------

  function stopAnimations(): void {
    for (const id of activeAnimations) {
      cancelAnimationFrame(id);
    }
    activeAnimations = [];
  }

  /**
   * Animate frames in a small canvas.
   *
   * Unlike entity-editor which uses (row, start, count), this version
   * takes an array of global frame indices and computes source rects.
   */
  function animateFrames(
    canvas: HTMLCanvasElement,
    img: HTMLImageElement,
    frameWidth: number,
    frameHeight: number,
    frames: number[],
    cols: number,
    fps: number,
  ): void {
    if (frames.length === 0) return;
    const ctx = canvas.getContext("2d")!;
    let idx = 0;
    let lastTime = 0;
    const interval = 1000 / fps;

    function tick(time: number): void {
      const raf = requestAnimationFrame(tick);
      activeAnimations.push(raf);

      if (time - lastTime < interval) return;
      lastTime = time;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;

      const frameIndex = frames[idx]!;
      const col = frameIndex % cols;
      const row = Math.floor(frameIndex / cols);

      ctx.drawImage(
        img,
        col * frameWidth, row * frameHeight, frameWidth, frameHeight,
        0, 0, canvas.width, canvas.height,
      );
      idx = (idx + 1) % frames.length;
    }

    const raf = requestAnimationFrame(tick);
    activeAnimations.push(raf);
  }

  // -------------------------------------------------------------------------
  // Non-empty frame detection
  // -------------------------------------------------------------------------

  /**
   * Count non-empty (non-transparent) frames in a row.
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

  // -------------------------------------------------------------------------
  // Image loading
  // -------------------------------------------------------------------------

  function loadImage(assetPath: string): HTMLImageElement | null {
    const cached = imgCache.get(assetPath);
    if (cached && cached.complete) return cached;

    const asset = getAssetStore().assets.find((a) => a.path === assetPath);
    if (!asset) return null;

    if (cached) return null; // still loading

    const img = new Image();
    img.src = asset.objectUrl;
    imgCache.set(assetPath, img);
    img.onload = () => render();
    return null;
  }

  // -------------------------------------------------------------------------
  // Row labels
  // -------------------------------------------------------------------------

  function getLabelsForAsset(assetPath: string): Map<number, string> {
    let map = rowLabels.get(assetPath);
    if (!map) {
      map = new Map();
      rowLabels.set(assetPath, map);
    }
    return map;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Build the set of frame indices for a given animation. */
  function getActiveFrameSet(): Set<number> {
    if (!currentVisual || !currentAnimName) return new Set();
    const anim = currentVisual.animations[currentAnimName];
    return new Set(anim?.frames ?? []);
  }

  /** Build a set of frames used by ANY animation (for cross-highlight). */
  function getAllUsedFrames(): Map<number, string> {
    const map = new Map<number, string>();
    if (!currentVisual) return map;
    for (const [name, anim] of Object.entries(currentVisual.animations)) {
      if (name === currentAnimName) continue;
      for (const f of anim.frames) {
        map.set(f, name);
      }
    }
    return map;
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  function render(): void {
    const visual = currentVisual;
    const entity = currentEntity;

    if (!visual || !entity || !visual.source) {
      root.hidden = true;
      stopAnimations();
      lastRenderKey = "";
      return;
    }

    // Get asset dimensions
    const asset = getAssetStore().assets.find((a) => a.path === visual.source);
    const natW = asset?.naturalWidth ?? 0;
    const natH = asset?.naturalHeight ?? 0;
    if (natW === 0 || natH === 0) {
      root.hidden = true;
      stopAnimations();
      lastRenderKey = "";
      return;
    }

    const cols = Math.floor(natW / visual.frameWidth);
    const rows = Math.floor(natH / visual.frameHeight);

    if (cols < 2 || rows < 1) {
      root.hidden = true;
      stopAnimations();
      lastRenderKey = "";
      return;
    }

    // Force re-render if root was detached from DOM (e.g. parent innerHTML = "")
    if (!root.parentNode) {
      lastRenderKey = "";
    }

    // Build render key
    const activeAnim = currentAnimName ? currentVisual?.animations[currentAnimName] : null;
    const framesKey = activeAnim ? activeAnim.frames.join(",") : "";
    const renderKey = `${visual.source}|${visual.frameWidth}|${visual.frameHeight}|${currentAnimName}|${framesKey}|${entity.id}`;
    if (renderKey === lastRenderKey) return;

    stopAnimations();
    root.hidden = false;
    root.innerHTML = "";

    // Header
    const header = document.createElement("div");
    header.className = "sse-header";

    const title = document.createElement("h4");
    title.textContent = "Spritesheet Explorer";

    const info = document.createElement("span");
    info.className = "sse-info";
    info.textContent = `${natW}\u00D7${natH}px \u2022 ${cols}\u00D7${rows} grid (${visual.frameWidth}\u00D7${visual.frameHeight} frames)`;

    const help = document.createElement("p");
    help.className = "sse-help";
    if (currentAnimName) {
      help.textContent = `Editing \u201C${currentAnimName}\u201D \u2014 click frames to add/remove. Shift+click for range.`;
    } else {
      help.textContent = "Select an animation to edit, then click frames to build the sequence.";
    }

    header.appendChild(title);
    header.appendChild(info);
    header.appendChild(help);
    root.appendChild(header);

    // Load image
    const img = loadImage(visual.source);
    if (!img) return; // will re-render when loaded

    const labels = getLabelsForAsset(visual.source);
    const activeFrames = getActiveFrameSet();
    const otherFrames = getAllUsedFrames();

    // Row list
    const rowList = document.createElement("div");
    rowList.className = "sse-rows";

    for (let r = 0; r < rows; r++) {
      const nonEmpty = countNonEmptyFrames(img, visual.frameWidth, visual.frameHeight, r, cols);

      const rowEl = document.createElement("div");
      rowEl.className = "sse-row";

      // Check if this row has any active frames
      let rowHasSelection = false;
      for (let c = 0; c < nonEmpty; c++) {
        if (activeFrames.has(r * cols + c)) {
          rowHasSelection = true;
          break;
        }
      }
      if (rowHasSelection) rowEl.classList.add("sse-row--has-selection");

      // Row label
      const rowLabelEl = document.createElement("span");
      rowLabelEl.className = "sse-row-label";
      const savedLabel = labels.get(r);
      rowLabelEl.textContent = savedLabel ? `${r}: ${savedLabel}` : `Row ${r}`;
      rowLabelEl.title = "Double-click to label, click to select all frames in row";

      // Double-click to edit label
      rowLabelEl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const input = document.createElement("input");
        input.type = "text";
        input.className = "sse-label-input";
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
          lastRenderKey = "";
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

      // Click label to select all row frames
      rowLabelEl.addEventListener("click", (e) => {
        if (e.target instanceof HTMLInputElement) return; // skip during edit
        if (!currentAnimName) return;
        const rowFrames: number[] = [];
        for (let c = 0; c < nonEmpty; c++) {
          rowFrames.push(r * cols + c);
        }
        onSelectRow(currentAnimName, rowFrames);
      });

      // Mini animated preview canvas
      const previewCanvas = document.createElement("canvas");
      previewCanvas.className = "sse-preview";
      const thumbW = 56;
      const thumbH = Math.round(56 * visual.frameHeight / visual.frameWidth);
      const cappedH = Math.min(Math.max(thumbH, 32), 72);
      previewCanvas.width = thumbW;
      previewCanvas.height = cappedH;

      // Determine which frames to preview in this row
      const rowActiveFrames: number[] = [];
      for (let c = 0; c < nonEmpty; c++) {
        const gi = r * cols + c;
        if (activeFrames.has(gi)) rowActiveFrames.push(gi);
      }
      const previewFrameList = rowActiveFrames.length > 0
        ? rowActiveFrames
        : Array.from({ length: nonEmpty }, (_, c) => r * cols + c);

      const fps = activeAnim?.fps ?? 10;
      animateFrames(previewCanvas, img, visual.frameWidth, visual.frameHeight, previewFrameList, cols, fps);

      // Frame strip
      const strip = document.createElement("div");
      strip.className = "sse-strip";

      for (let c = 0; c < nonEmpty; c++) {
        const globalIndex = r * cols + c;
        const frameCanvas = document.createElement("canvas");
        frameCanvas.className = "sse-frame";

        // Highlight
        if (activeFrames.has(globalIndex)) {
          frameCanvas.classList.add("sse-frame--selected");
        } else if (otherFrames.has(globalIndex)) {
          frameCanvas.classList.add("sse-frame--other");
        }

        const fThumbW = 28;
        const fThumbH = Math.min(Math.round(28 * visual.frameHeight / visual.frameWidth), 48);
        frameCanvas.width = fThumbW;
        frameCanvas.height = fThumbH;
        const fctx = frameCanvas.getContext("2d")!;
        fctx.imageSmoothingEnabled = false;
        fctx.drawImage(
          img,
          c * visual.frameWidth, r * visual.frameHeight, visual.frameWidth, visual.frameHeight,
          0, 0, fThumbW, fThumbH,
        );

        // Frame index label overlay
        const indexLabel = document.createElement("span");
        indexLabel.className = "sse-frame-index";
        indexLabel.textContent = String(globalIndex);

        // Wrap frame canvas + index in a container
        const frameWrapper = document.createElement("div");
        frameWrapper.className = "sse-frame-wrapper";
        frameWrapper.appendChild(frameCanvas);
        frameWrapper.appendChild(indexLabel);

        // Click handler
        frameWrapper.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!currentAnimName) return;
          onFrameToggle(currentAnimName, globalIndex, e.shiftKey);
        });

        strip.appendChild(frameWrapper);
      }

      // Frame count badge
      const countBadge = document.createElement("span");
      countBadge.className = "sse-count";
      countBadge.textContent = `${nonEmpty}f`;

      rowEl.appendChild(rowLabelEl);
      rowEl.appendChild(previewCanvas);
      rowEl.appendChild(strip);
      rowEl.appendChild(countBadge);
      rowList.appendChild(rowEl);
    }

    root.appendChild(rowList);

    // Footer
    const footer = document.createElement("div");
    footer.className = "sse-footer";

    if (currentAnimName && activeAnim) {
      const count = activeAnim.frames.length;
      const infoText = document.createElement("p");
      infoText.className = "sse-footer-info";
      if (count === 0) {
        infoText.textContent = `\u201C${currentAnimName}\u201D — no frames selected. Click frames to add.`;
      } else {
        infoText.textContent = `\u201C${currentAnimName}\u201D — ${count} frame${count > 1 ? "s" : ""} at ${activeAnim.fps}fps`;
      }
      footer.appendChild(infoText);
    } else if (!currentAnimName) {
      const noAnim = document.createElement("p");
      noAnim.className = "sse-no-anim";
      noAnim.textContent = "Click the \u270E button on an animation to edit its frames visually.";
      footer.appendChild(noAnim);
    }

    root.appendChild(footer);
    lastRenderKey = renderKey;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    element: root,

    update(entity: EntityEntry, visual: SpritesheetVisual, activeAnimName: string | null): void {
      currentEntity = entity;
      currentVisual = visual;
      currentAnimName = activeAnimName;
      render();
    },

    destroy(): void {
      stopAnimations();
      root.innerHTML = "";
      lastRenderKey = "";
      currentEntity = null;
      currentVisual = null;
      currentAnimName = null;
    },
  };
}
