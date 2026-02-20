/**
 * Scene canvas module.
 *
 * Creates and manages the PixiJS Application for the scene editor.
 * Sets up 6 rendering layers, handles canvas resizing to fill the
 * container, and provides zoom/pan with centralized coordinate
 * transformation.
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

/** Root container that holds all scene layers. Zoom/pan applied here. */
let sceneRoot: Container | null = null;

const canvasContainer = document.getElementById("scene-canvas-container")!;

// ---------------------------------------------------------------------------
// Zoom / Pan
// ---------------------------------------------------------------------------

let zoom = 1;
let panX = 0;
let panY = 0;

/** Whether the Space key is currently held. */
let spaceDown = false;

/** Pan drag state. */
let panning: { startX: number; startY: number; origPanX: number; origPanY: number } | null = null;

/** Get current zoom level. */
export function getZoom(): number {
  return zoom;
}

/** Get current pan offset. */
export function getPan(): { x: number; y: number } {
  return { x: panX, y: panY };
}

/** Apply the current zoom/pan transform to the scene root. */
function applyTransform(): void {
  if (!sceneRoot) return;
  sceneRoot.scale.set(zoom, zoom);
  sceneRoot.position.set(panX, panY);
}

/** Center the scene in the viewport. */
function centerScene(): void {
  if (!app) return;
  const { scene } = getState();
  const cw = app.screen.width;
  const ch = app.screen.height;

  // Fit scene in viewport with some padding
  const fitZoom = Math.min(cw / scene.sceneWidth, ch / scene.sceneHeight) * 0.9;
  zoom = Math.min(fitZoom, 2);
  panX = (cw - scene.sceneWidth * zoom) / 2;
  panY = (ch - scene.sceneHeight * zoom) / 2;
  applyTransform();
}

// ---------------------------------------------------------------------------
// Coordinate transformation
// ---------------------------------------------------------------------------

/**
 * Convert screen (mouse/drag event) coordinates to scene coordinates,
 * accounting for zoom and pan.
 */
export function canvasCoords(e: MouseEvent | DragEvent): { x: number; y: number } {
  const canvas = canvasContainer.querySelector("canvas");
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;
  return {
    x: (screenX - panX) / zoom,
    y: (screenY - panY) / zoom,
  };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Create the PixiJS application and layer containers. */
async function createApp(): Promise<void> {
  // Size canvas to fill the container
  const cw = canvasContainer.clientWidth || 800;
  const ch = canvasContainer.clientHeight || 600;

  app = new Application();
  await app.init({
    width: cw,
    height: ch,
    backgroundAlpha: 0,
    antialias: false,
  });

  canvasContainer.appendChild(app.canvas);

  // Root container for zoom/pan
  sceneRoot = new Container();
  sceneRoot.label = "sceneRoot";
  app.stage.addChild(sceneRoot);

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

  sceneRoot.addChild(ground, decorations, walls, positions, routes, selection);

  layers = { ground, decorations, walls, positions, routes, selection };

  centerScene();
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

/** Resize the canvas to match container dimensions. */
function resizeToContainer(): void {
  if (!app) return;
  const cw = canvasContainer.clientWidth || 800;
  const ch = canvasContainer.clientHeight || 600;
  app.renderer.resize(cw, ch);
}

/** Resize the canvas to match scene dimensions. */
export function resizeCanvas(width: number, height: number): void {
  if (!app) return;
  // We keep the canvas at container size; ignore explicit scene resize.
  void width;
  void height;
  resizeToContainer();
  centerScene();
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Handle wheel for zoom. */
function handleWheel(e: WheelEvent): void {
  if (getState().activeTab !== "scene") return;
  e.preventDefault();

  const canvas = canvasContainer.querySelector("canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();

  // Mouse position on canvas
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Zoom factor
  const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const newZoom = Math.max(0.1, Math.min(10, zoom * zoomFactor));

  // Adjust pan so zoom is centered on mouse position
  panX = mx - ((mx - panX) / zoom) * newZoom;
  panY = my - ((my - panY) / zoom) * newZoom;
  zoom = newZoom;

  applyTransform();
}

/** Handle mousedown for pan (middle button or Space+left). */
function handlePanStart(e: MouseEvent): void {
  if (getState().activeTab !== "scene") return;

  const isMiddle = e.button === 1;
  const isSpaceLeft = spaceDown && e.button === 0;

  if (!isMiddle && !isSpaceLeft) return;

  e.preventDefault();
  panning = {
    startX: e.clientX,
    startY: e.clientY,
    origPanX: panX,
    origPanY: panY,
  };
}

/** Handle mousemove for pan. */
function handlePanMove(e: MouseEvent): void {
  if (!panning) return;
  panX = panning.origPanX + (e.clientX - panning.startX);
  panY = panning.origPanY + (e.clientY - panning.startY);
  applyTransform();
}

/** Handle mouseup to stop pan. */
function handlePanEnd(): void {
  panning = null;
}

/** Track Space key state for pan. */
function handleKeyDown(e: KeyboardEvent): void {
  if (e.code === "Space" && getState().activeTab === "scene") {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    e.preventDefault();
    spaceDown = true;
    canvasContainer.style.cursor = "grab";
  }
}

function handleKeyUp(e: KeyboardEvent): void {
  if (e.code === "Space") {
    spaceDown = false;
    canvasContainer.style.cursor = "";
  }
}

/** Check if we are currently panning (modes should skip their handlers). */
export function isPanning(): boolean {
  return panning !== null || spaceDown;
}

// ---------------------------------------------------------------------------
// Public init
// ---------------------------------------------------------------------------

/** Initialize the scene canvas. */
export async function initSceneCanvas(): Promise<void> {
  await createApp();

  // Resize observer
  const observer = new ResizeObserver(() => {
    resizeToContainer();
  });
  observer.observe(canvasContainer);

  // Zoom via wheel
  canvasContainer.addEventListener("wheel", handleWheel, { passive: false });

  // Pan via middle-click or Space+drag
  canvasContainer.addEventListener("mousedown", handlePanStart);
  document.addEventListener("mousemove", handlePanMove);
  document.addEventListener("mouseup", handlePanEnd);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);

  // Prevent default middle-click scroll behavior
  canvasContainer.addEventListener("auxclick", (e) => {
    if (e.button === 1) e.preventDefault();
  });
}
