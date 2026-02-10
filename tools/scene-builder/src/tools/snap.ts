/**
 * Shared grid snap utility.
 *
 * Centralizes the snap-to-grid calculation used by all canvas tools.
 */

import { getEditorState } from "../state/editor-state.js";

/** Snap a value to the grid if snapping is enabled. */
export function snap(value: number): number {
  const { snapToGrid, gridSize } = getEditorState();
  if (!snapToGrid) return value;
  return Math.round(value / gridSize) * gridSize;
}
