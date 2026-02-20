/**
 * Alpha-based opaque region detection.
 *
 * Scans an image to find the bounding box of non-transparent pixels.
 * Used for auto-cropping sprites to their visible content.
 */

import type { SourceRect } from "../types.js";

/** Minimum alpha value to consider a pixel opaque. */
const ALPHA_THRESHOLD = 10;

/** Minimum margin percentage on any side to consider auto-crop useful. */
const MIN_MARGIN_PERCENT = 0.1;

/**
 * Detect the opaque (non-transparent) bounding box of an image.
 *
 * Draws the image into a temporary canvas, scans the alpha channel,
 * and returns the tightest rectangle containing all opaque pixels.
 *
 * @returns The opaque region as a SourceRect, or null if the image is
 *          fully opaque (no significant transparent margins detected).
 */
export function detectOpaqueRegion(
  img: HTMLImageElement,
): SourceRect | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w === 0 || h === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, w, h).data;

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3]!;
      if (alpha > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // No opaque pixels found
  if (maxX < minX || maxY < minY) return null;

  // Check if margins are significant enough
  const marginLeft = minX / w;
  const marginRight = (w - 1 - maxX) / w;
  const marginTop = minY / h;
  const marginBottom = (h - 1 - maxY) / h;

  const hasSignificantMargin =
    marginLeft > MIN_MARGIN_PERCENT ||
    marginRight > MIN_MARGIN_PERCENT ||
    marginTop > MIN_MARGIN_PERCENT ||
    marginBottom > MIN_MARGIN_PERCENT;

  if (!hasSignificantMargin) return null;

  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}
