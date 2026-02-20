/**
 * Scene tab orchestrator.
 *
 * Initializes the scene canvas, toolbar, asset palette,
 * property panel, and all editing modes.
 */

import { initSceneCanvas } from "./scene-canvas.js";
import { initSceneToolbar } from "./scene-toolbar.js";
import { initSceneRenderer } from "./scene-renderer.js";
import { initAssetPalette } from "./asset-palette.js";
import { initPropertyPanel } from "./property-panel.js";
import { initUndoManager } from "./undo-manager.js";
import { initBuildMode } from "./modes/build-mode.js";
import { initPositionMode } from "./modes/position-mode.js";
import { initRouteMode } from "./modes/route-mode.js";
import { initSelectMode } from "./modes/select-mode.js";

/** Initialize the entire scene tab. */
export async function initSceneTab(): Promise<void> {
  await initSceneCanvas();
  initSceneToolbar();
  initSceneRenderer();
  initAssetPalette();
  initPropertyPanel();
  initUndoManager();
  initBuildMode();
  initPositionMode();
  initRouteMode();
  initSelectMode();
}
