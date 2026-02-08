/**
 * Scene canvas module.
 *
 * Creates and manages the PixiJS Application for the scene editor.
 * Sets up 6 rendering layers and handles canvas resizing.
 */

import { Application, Container } from "pixi.js";
import { getState } from "../app-state.js";

// ---------------------------------------------------------------------------
// Layer indices
// ---------------------------------------------------------------------------

/** Named layer containers for the scene. */
export interface SceneLayers {
  ground: Container;
  decorations: Container;
  walls: Container;
  positions: Container;
  routes: Container;
  selection: Container;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let app: Application | null = null;
let layers: SceneLayers | null = null;

const canvasContainer = document.getElementById("scene-canvas-container")!;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Create the PixiJS application and layer containers. */
async function createApp(): Promise<void> {
  const { scene } = getState();

  app = new Application();
  await app.init({
    width: scene.sceneWidth,
    height: scene.sceneHeight,
    backgroundAlpha: 0,
    antialias: false,
  });

  canvasContainer.appendChild(app.canvas);

  // Create 6 layers in z-order
  const ground = new Container();
  ground.label = "ground";

  const decorations = new Container();
  decorations.label = "decorations";

  const walls = new Container();
  walls.label = "walls";

  const positions = new Container();
  positions.label = "positions";

  const routes = new Container();
  routes.label = "routes";

  const selection = new Container();
  selection.label = "selection";

  app.stage.addChild(ground, decorations, walls, positions, routes, selection);

  layers = { ground, decorations, walls, positions, routes, selection };
}

/** Get the PixiJS Application instance. */
export function getApp(): Application | null {
  return app;
}

/** Get the scene layer containers. */
export function getLayers(): SceneLayers | null {
  return layers;
}

/** Get the canvas container DOM element. */
export function getCanvasContainer(): HTMLElement {
  return canvasContainer;
}

/** Resize the canvas to match scene dimensions. */
export function resizeCanvas(width: number, height: number): void {
  if (!app) return;
  app.renderer.resize(width, height);
}

/** Initialize the scene canvas. */
export async function initSceneCanvas(): Promise<void> {
  await createApp();
}
