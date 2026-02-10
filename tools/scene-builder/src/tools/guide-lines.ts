/**
 * Shared guide lines and center snap utilities.
 *
 * Shows center crosshair lines on the canvas during drag operations.
 * Provides center-snap magnetism for precise centering.
 * Used by select-tool (entity drag) and position-tool (position drag).
 */

import { Graphics } from "pixi.js";
import { getLayers, getZoom } from "../canvas/canvas.js";
import { getSceneState } from "../state/scene-state.js";

/** Distance in scene pixels within which center-snap activates. */
const CENTER_SNAP_THRESHOLD = 8;

let guideGraphics: Graphics | null = null;

/** Show center guide lines on the scene. */
export function showGuideLines(): void {
  const sceneLayers = getLayers();
  if (!sceneLayers || guideGraphics) return;

  const { dimensions } = getSceneState();
  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;

  guideGraphics = new Graphics();
  guideGraphics.label = "drag-guides";
  guideGraphics.zIndex = 999999;

  // Vertical center line
  guideGraphics.moveTo(cx, 0);
  guideGraphics.lineTo(cx, dimensions.height);

  // Horizontal center line
  guideGraphics.moveTo(0, cy);
  guideGraphics.lineTo(dimensions.width, cy);

  const lineWidth = 1 / getZoom();
  guideGraphics.stroke({ color: 0xe8a851, width: lineWidth, alpha: 0.45 });

  sceneLayers.selection.addChild(guideGraphics);
}

/** Hide and destroy guide lines. */
export function hideGuideLines(): void {
  if (guideGraphics) {
    guideGraphics.destroy();
    guideGraphics = null;
  }
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
