/**
 * Spritesheet auto-detection via alpha-grid analysis.
 *
 * Tries candidate frame sizes on an image, draws it to a canvas,
 * and counts non-empty cells (via alpha sampling) to determine
 * whether the image is a spritesheet and what the grid layout is.
 *
 * Zero external dependencies — Canvas 2D only.
 */

import type { DetectedRowAnimation, SpritesheetHint } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum alpha value to consider a pixel non-transparent. */
const ALPHA_THRESHOLD = 10;

/** Pixel sampling stride within a cell (check every Nth pixel per axis). */
const SAMPLE_STRIDE = 8;

/** Common frame sizes to try (in pixels). */
const COMMON_FRAME_SIZES = [16, 24, 32, 48, 64, 80, 96, 128, 160, 192, 256];

/** Minimum number of non-empty frames to consider a grid valid. */
const MIN_NON_EMPTY_FRAMES = 3;

/** Minimum score to accept a candidate as a spritesheet. */
const MIN_SCORE = 0.3;

/** Keywords in filenames that hint at spritesheet content. */
const SHEET_KEYWORDS = ["spritesheet", "sheet", "atlas", "strip", "grid", "tileset", "frames"];

/** Regex to detect NxM grid hints in filenames (e.g. "warrior-6x4.png"). */
const GRID_PATTERN = /[-_](\d{1,3})x(\d{1,3})/i;

// ---------------------------------------------------------------------------
// Filename heuristics
// ---------------------------------------------------------------------------

interface FilenameHint {
  /** Whether the filename suggests spritesheet content. */
  isLikely: boolean;
  /** Explicit grid cols from NxM pattern, if found. */
  gridCols?: number;
  /** Explicit grid rows from NxM pattern, if found. */
  gridRows?: number;
}

/** Analyze a filename for spritesheet indicators. */
function analyzeFilename(name: string): FilenameHint {
  const lower = name.toLowerCase();
  const hasKeyword = SHEET_KEYWORDS.some((kw) => lower.includes(kw));
  const gridMatch = GRID_PATTERN.exec(name);
  if (gridMatch) {
    return {
      isLikely: true,
      gridCols: parseInt(gridMatch[1]!, 10),
      gridRows: parseInt(gridMatch[2]!, 10),
    };
  }
  return { isLikely: hasKeyword };
}

// ---------------------------------------------------------------------------
// Candidate frame-size generation
// ---------------------------------------------------------------------------

interface GridCandidate {
  frameWidth: number;
  frameHeight: number;
  cols: number;
  rows: number;
}

/** Generate candidate grid layouts for the given image dimensions. */
function generateCandidates(
  width: number,
  height: number,
  filenameHint: FilenameHint,
): GridCandidate[] {
  const candidates: GridCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (fw: number, fh: number, cols: number, rows: number): void => {
    const key = `${fw}x${fh}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ frameWidth: fw, frameHeight: fh, cols, rows });
  };

  // Priority: filename NxM hint
  if (filenameHint.gridCols && filenameHint.gridRows) {
    const fw = Math.floor(width / filenameHint.gridCols);
    const fh = Math.floor(height / filenameHint.gridRows);
    if (
      fw > 0 && fh > 0 &&
      fw * filenameHint.gridCols === width &&
      fh * filenameHint.gridRows === height
    ) {
      addCandidate(fw, fh, filenameHint.gridCols, filenameHint.gridRows);
    }
  }

  // Common square frame sizes
  for (const size of COMMON_FRAME_SIZES) {
    if (size >= width && size >= height) continue;

    // Square frames
    if (width % size === 0 && height % size === 0) {
      const cols = width / size;
      const rows = height / size;
      if (cols * rows >= MIN_NON_EMPTY_FRAMES && cols <= 64 && rows <= 64) {
        addCandidate(size, size, cols, rows);
      }
    }
  }

  // Non-square combinations (only try if not too many candidates already)
  if (candidates.length < 10) {
    for (const fw of COMMON_FRAME_SIZES) {
      if (fw >= width || width % fw !== 0) continue;
      const cols = width / fw;
      for (const fh of COMMON_FRAME_SIZES) {
        if (fh >= height || height % fh !== 0 || fh === fw) continue;
        const rows = height / fh;
        if (cols * rows >= MIN_NON_EMPTY_FRAMES && cols <= 64 && rows <= 64) {
          addCandidate(fw, fh, cols, rows);
        }
      }
    }
  }

  // Horizontal strip: height << width, assume square frames of height×height
  if (width > height * 2 && width % height === 0) {
    const cols = width / height;
    if (cols >= MIN_NON_EMPTY_FRAMES) {
      addCandidate(height, height, cols, 1);
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Alpha-grid scoring
// ---------------------------------------------------------------------------

interface ScoredCandidate {
  score: number;
  candidate: GridCandidate;
  rowAnimations: DetectedRowAnimation[];
  totalNonEmpty: number;
}

/**
 * Score a candidate grid layout by sampling alpha in each cell.
 *
 * Returns a score between 0 and ~1.2 (with bonuses) reflecting how
 * likely this grid represents a spritesheet.
 */
function scoreCandidate(
  data: Uint8ClampedArray,
  imageWidth: number,
  candidate: GridCandidate,
): ScoredCandidate {
  const { frameWidth, frameHeight, cols, rows } = candidate;
  const rowAnimations: DetectedRowAnimation[] = [];
  let totalNonEmpty = 0;

  for (let r = 0; r < rows; r++) {
    const frames: number[] = [];
    for (let c = 0; c < cols; c++) {
      const startX = c * frameWidth;
      const startY = r * frameHeight;
      let hasPixels = false;

      for (let sy = startY; sy < startY + frameHeight && !hasPixels; sy += SAMPLE_STRIDE) {
        for (let sx = startX; sx < startX + frameWidth && !hasPixels; sx += SAMPLE_STRIDE) {
          const idx = (sy * imageWidth + sx) * 4 + 3; // alpha channel
          if (data[idx]! > ALPHA_THRESHOLD) {
            hasPixels = true;
          }
        }
      }

      if (hasPixels) {
        frames.push(r * cols + c);
      }
    }

    if (frames.length > 0) {
      rowAnimations.push({ row: r, frameCount: frames.length, frames });
      totalNonEmpty += frames.length;
    }
  }

  if (totalNonEmpty < MIN_NON_EMPTY_FRAMES) {
    return { score: 0, candidate, rowAnimations, totalNonEmpty };
  }

  // --- Scoring components ---

  // Fill ratio: proportion of non-empty cells
  const totalCells = cols * rows;
  const fillRatio = totalNonEmpty / totalCells;

  // Row consistency: how uniform are the row frame counts?
  // Perfect = all rows have the same count (except possibly the last)
  const rowCounts = rowAnimations.map((r) => r.frameCount);
  const maxRowCount = Math.max(...rowCounts);
  const consistencyScore =
    rowCounts.reduce((sum, c) => sum + c / maxRowCount, 0) / rowCounts.length;

  // Frame size quality: penalize very small frames (likely false positive)
  const minDim = Math.min(frameWidth, frameHeight);
  const frameSizeScore = Math.min(1, minDim / 24);

  // Multi-row bonus: multi-row grids are stronger signals
  const multiRowBonus = rowAnimations.length > 1 ? 1.15 : 1.0;

  const rawScore =
    fillRatio * 0.4 +
    consistencyScore * 0.3 +
    frameSizeScore * 0.2 +
    (totalNonEmpty > 6 ? 0.1 : totalNonEmpty / 60);

  return {
    score: rawScore * multiRowBonus,
    candidate,
    rowAnimations,
    totalNonEmpty,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect whether an image is a spritesheet by analyzing alpha in a grid.
 *
 * Tries multiple candidate frame sizes, scores each via alpha sampling,
 * and returns the best match as a `SpritesheetHint` or `null` if no
 * valid grid was detected.
 *
 * @param img   - A fully loaded HTMLImageElement.
 * @param filename - The asset filename (used for heuristic hints).
 * @returns A SpritesheetHint if a grid is detected, or null.
 */
export function detectSpritesheetGrid(
  img: HTMLImageElement,
  filename: string,
): SpritesheetHint | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // Skip images too small to be spritesheets
  if (w < 64 || h < 32) return null;

  const filenameHint = analyzeFilename(filename);
  const candidates = generateCandidates(w, h, filenameHint);

  if (candidates.length === 0) return null;

  // Draw image to canvas once, share pixel data across all candidates
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);

  let best: ScoredCandidate | null = null;

  for (const candidate of candidates) {
    const result = scoreCandidate(imageData.data, w, candidate);
    if (result.score > 0 && (!best || result.score > best.score)) {
      best = result;
    }
  }

  if (!best || best.score < MIN_SCORE) return null;

  // Compute confidence: base from score, boost from filename hint
  let confidence = Math.min(1, best.score);
  if (filenameHint.isLikely) {
    confidence = Math.min(1, confidence + 0.2);
  }

  return {
    frameWidth: best.candidate.frameWidth,
    frameHeight: best.candidate.frameHeight,
    cols: best.candidate.cols,
    rows: best.candidate.rows,
    totalNonEmptyFrames: best.totalNonEmpty,
    rowAnimations: best.rowAnimations,
    confidence,
  };
}
