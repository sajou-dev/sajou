/**
 * Shared guide lines and center snap utilities.
 *
 * Shows center crosshair lines on the canvas during drag operations.
 * Provides center-snap magnetism for precise centering.
 * Used by select-tool (entity drag) and position-tool (position drag).
 *
 * Guide lines are drawn on the Canvas2D overlay via redrawOverlay().
 * The overlay draw callback in scene-renderer handles all overlay drawing,
 * so guide lines integrate by setting a flag that the overlay reads.
 */

import { redrawOverlay } from "../canvas/canvas.js";
import { getSceneState } from "../state/scene-state.js";

/** Distance in scene pixels within which center-snap activates. */
const CENTER_SNAP_THRESHOLD = 8;

let guidesVisible = false;

/** Show center guide lines on the scene. */
export function showGuideLines(): void {
  guidesVisible = true;
  redrawOverlay();
}

/** Hide guide lines. */
export function hideGuideLines(): void {
  guidesVisible = false;
  redrawOverlay();
}

/** Whether guide lines are currently visible. */
export function areGuideLinesVisible(): boolean {
  return guidesVisible;
}

/**
 * Draw guide lines on a Canvas2D context (called from overlay rendering).
 * The context should already be transformed to scene coordinates.
 */
export function drawGuideLines(ctx: CanvasRenderingContext2D, zoom: number): void {
  if (!guidesVisible) return;

  const { dimensions } = getSceneState();
  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;

  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, dimensions.height);
  ctx.moveTo(0, cy);
  ctx.lineTo(dimensions.width, cy);

  ctx.strokeStyle = "rgba(232, 168, 81, 0.45)"; // #e8a851 at 0.45 alpha
  ctx.lineWidth = 1 / zoom;
  ctx.stroke();
}

/**
 * Apply center-snap: if a coordinate is within threshold of the scene
 * center axis, snap it to that axis. Works independently on X and Y.
 */
export function snapToCenter(x: number, y: number): { x: number; y: number } {
  const { dimensions } = getSceneState();
  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;

  const snappedX = Math.abs(x - cx) < CENTER_SNAP_THRESHOLD ? cx : x;
  const snappedY = Math.abs(y - cy) < CENTER_SNAP_THRESHOLD ? cy : y;
  return { x: snappedX, y: snappedY };
}
