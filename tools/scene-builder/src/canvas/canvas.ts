/**
 * Canvas module.
 *
 * Creates and manages the PixiJS Application for the scene builder.
 * Full-screen canvas behind all panels. Handles zoom (wheel), pan
 * (middle-click, Space+drag, or Hand tool), a toggleable grid overlay,
 * and a visible scene boundary rectangle.
 */

import { Application, Container, Graphics } from "pixi.js";
import { getSceneState, subscribeScene } from "../state/scene-state.js";
import { getEditorState, subscribeEditor } from "../state/editor-state.js";
import type { ToolId } from "../types.js";

// ---------------------------------------------------------------------------
// Layer containers
// ---------------------------------------------------------------------------

/** Named layer containers for the scene (z-order). */
export interface SceneLayers {
  ground: Container;
  objects: Container;
  positions: Container;
  routes: Container;
  selection: Container;
}

/** Interface for canvas tool event handlers. */
export interface CanvasToolHandler {
  onMouseDown?(e: MouseEvent, scenePos: { x: number; y: number }): void;
  onMouseMove?(e: MouseEvent, scenePos: { x: number; y: number }): void;
  onMouseUp?(e: MouseEvent, scenePos: { x: number; y: number }): void;
}

// ---------------------------------------------------------------------------
// Cursor map per tool
// ---------------------------------------------------------------------------

const TOOL_CURSORS: Record<ToolId, string> = {
  select: "default",
  hand: "grab",
  background: "default",
  place: "crosshair",
  position: "crosshair",
  route: "crosshair",
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let app: Application | null = null;
let layers: SceneLayers | null = null;
let sceneRoot: Container | null = null;
let gridGraphics: Graphics | null = null;
let sceneBoundary: Graphics | null = null;
let toolHandler: CanvasToolHandler | null = null;

const canvasContainer = document.getElementById("canvas-container")!;
const zoomLevelBtn = document.getElementById("zoom-level")!;

// Zoom / Pan
let zoom = 1;
let panX = 0;
let panY = 0;
let spaceDown = false;
let panning: { startX: number; startY: number; origPanX: number; origPanY: number } | null = null;

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

/** Set the active tool handler for canvas events. */
export function setToolHandler(handler: CanvasToolHandler | null): void {
  toolHandler = handler;
}

/** Get the scene root container (for hit-testing). */
export function getSceneRoot(): Container | null {
  return sceneRoot;
}

/** Get the PixiJS Application instance. */
export function getApp(): Application | null {
  return app;
}

/** Get the scene layer containers. */
export function getLayers(): SceneLayers | null {
  return layers;
}

/** Get current zoom level. */
export function getZoom(): number {
  return zoom;
}

/** Get current pan offset. */
export function getPan(): { x: number; y: number } {
  return { x: panX, y: panY };
}

/** Get the canvas container DOM element. */
export function getCanvasContainer(): HTMLElement {
  return canvasContainer;
}

/** Check if we are currently panning. */
export function isPanning(): boolean {
  return panning !== null || spaceDown;
}

// ---------------------------------------------------------------------------
// Coordinate transforms
// ---------------------------------------------------------------------------

/** Convert screen (mouse) coordinates to scene coordinates. */
export function screenToScene(e: MouseEvent): { x: number; y: number } {
  const canvas = canvasContainer.querySelector("canvas");
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - panX) / zoom,
    y: (e.clientY - rect.top - panY) / zoom,
  };
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

function applyTransform(): void {
  if (!sceneRoot) return;
  sceneRoot.scale.set(zoom, zoom);
  sceneRoot.position.set(panX, panY);
  updateZoomDisplay();
  drawSceneBoundary();
  drawGrid();
}

/** Center and fit the scene in the viewport. */
export function fitToView(): void {
  if (!app) return;
  const { dimensions } = getSceneState();
  const cw = app.screen.width;
  const ch = app.screen.height;
  const fitZoom = Math.min(cw / dimensions.width, ch / dimensions.height) * 0.85;
  zoom = Math.min(fitZoom, 2);
  panX = (cw - dimensions.width * zoom) / 2;
  panY = (ch - dimensions.height * zoom) / 2;
  applyTransform();
}

/** Set zoom to an exact level, centered on the viewport. */
export function setZoomLevel(level: number): void {
  if (!app) return;
  const newZoom = Math.max(0.1, Math.min(10, level));
  const cw = app.screen.width;
  const ch = app.screen.height;
  // Zoom centered on viewport center
  const cx = cw / 2;
  const cy = ch / 2;
  panX = cx - ((cx - panX) / zoom) * newZoom;
  panY = cy - ((cy - panY) / zoom) * newZoom;
  zoom = newZoom;
  applyTransform();
}

/** Zoom in by one step (~10%). */
export function zoomIn(): void {
  setZoomLevel(zoom * 1.15);
}

/** Zoom out by one step (~10%). */
export function zoomOut(): void {
  setZoomLevel(zoom / 1.15);
}

function updateZoomDisplay(): void {
  zoomLevelBtn.textContent = `${Math.round(zoom * 100)}%`;
}

// ---------------------------------------------------------------------------
// Cursor management
// ---------------------------------------------------------------------------

/** Update the canvas cursor based on active tool. */
export function updateCursor(): void {
  if (panning) {
    canvasContainer.style.cursor = "grabbing";
  } else if (spaceDown) {
    canvasContainer.style.cursor = "grab";
  } else {
    const { activeTool } = getEditorState();
    canvasContainer.style.cursor = TOOL_CURSORS[activeTool] ?? "default";
  }
}

// ---------------------------------------------------------------------------
// Scene boundary
// ---------------------------------------------------------------------------

function drawSceneBoundary(): void {
  if (!sceneBoundary) return;
  sceneBoundary.clear();
  const { dimensions } = getSceneState();

  // Scene area fill — brand "surface" (#0E0E16) against "bg" void (#07070C)
  sceneBoundary.rect(0, 0, dimensions.width, dimensions.height);
  sceneBoundary.fill({ color: 0x0e0e16, alpha: 1 });

  // Border outline — brand "border" (#1E1E2E)
  sceneBoundary.rect(0, 0, dimensions.width, dimensions.height);
  sceneBoundary.stroke({ color: 0x1e1e2e, width: 1.5 / zoom, alpha: 1 });
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

function drawGrid(): void {
  if (!gridGraphics || !app) return;
  gridGraphics.clear();

  const { gridEnabled, gridSize } = getEditorState();
  if (!gridEnabled) return;

  const { dimensions } = getSceneState();

  // Vertical lines
  for (let x = gridSize; x < dimensions.width; x += gridSize) {
    gridGraphics.moveTo(x, 0);
    gridGraphics.lineTo(x, dimensions.height);
  }
  // Horizontal lines
  for (let y = gridSize; y < dimensions.height; y += gridSize) {
    gridGraphics.moveTo(0, y);
    gridGraphics.lineTo(dimensions.width, y);
  }
  // Grid lines — brand "border" (#1E1E2E) at reduced alpha
  gridGraphics.stroke({ color: 0x1e1e2e, width: 1 / zoom, alpha: 0.5 });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function handleWheel(e: WheelEvent): void {
  e.preventDefault();
  const canvas = canvasContainer.querySelector("canvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const newZoom = Math.max(0.1, Math.min(10, zoom * factor));

  panX = mx - ((mx - panX) / zoom) * newZoom;
  panY = my - ((my - panY) / zoom) * newZoom;
  zoom = newZoom;
  applyTransform();
}

function handlePanStart(e: MouseEvent): void {
  const isMiddle = e.button === 1;
  const isSpaceLeft = spaceDown && e.button === 0;
  const isHandTool = getEditorState().activeTool === "hand" && e.button === 0;
  if (!isMiddle && !isSpaceLeft && !isHandTool) return;
  e.preventDefault();
  panning = { startX: e.clientX, startY: e.clientY, origPanX: panX, origPanY: panY };
  canvasContainer.style.cursor = "grabbing";
}

function handlePanMove(e: MouseEvent): void {
  if (!panning) return;
  panX = panning.origPanX + (e.clientX - panning.startX);
  panY = panning.origPanY + (e.clientY - panning.startY);
  applyTransform();
}

function handlePanEnd(): void {
  if (!panning) return;
  panning = null;
  updateCursor();
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.code === "Space") {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    e.preventDefault();
    spaceDown = true;
    updateCursor();
  }
}

function handleKeyUp(e: KeyboardEvent): void {
  if (e.code === "Space") {
    spaceDown = false;
    updateCursor();
  }
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

function resizeToContainer(): void {
  if (!app) return;
  const cw = canvasContainer.clientWidth || 800;
  const ch = canvasContainer.clientHeight || 600;
  app.renderer.resize(cw, ch);
  drawSceneBoundary();
  drawGrid();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the PixiJS canvas with layers, zoom/pan, grid, and scene boundary. */
export async function initCanvas(): Promise<void> {
  const cw = canvasContainer.clientWidth || 800;
  const ch = canvasContainer.clientHeight || 600;

  app = new Application();
  await app.init({
    width: cw,
    height: ch,
    background: 0x07070c,
    antialias: false,
  });

  canvasContainer.appendChild(app.canvas);

  // Root container for zoom/pan
  sceneRoot = new Container();
  sceneRoot.label = "sceneRoot";
  app.stage.addChild(sceneRoot);

  // Scene boundary (lowest z — distinguishes scene area from void)
  sceneBoundary = new Graphics();
  sceneBoundary.label = "sceneBoundary";
  sceneRoot.addChild(sceneBoundary);

  // Grid (above boundary, below content)
  gridGraphics = new Graphics();
  gridGraphics.label = "grid";
  sceneRoot.addChild(gridGraphics);

  // Scene layers
  const ground = new Container();
  ground.label = "ground";
  ground.sortableChildren = true;

  const objects = new Container();
  objects.label = "objects";
  objects.sortableChildren = true;

  const positions = new Container();
  positions.label = "positions";

  const routes = new Container();
  routes.label = "routes";

  const selection = new Container();
  selection.label = "selection";

  sceneRoot.addChild(ground, objects, positions, routes, selection);
  layers = { ground, objects, positions, routes, selection };

  // Center the scene
  fitToView();

  // Resize observer
  const observer = new ResizeObserver(() => resizeToContainer());
  observer.observe(canvasContainer);

  // Zoom
  canvasContainer.addEventListener("wheel", handleWheel, { passive: false });

  // Pan
  canvasContainer.addEventListener("mousedown", handlePanStart);
  document.addEventListener("mousemove", handlePanMove);
  document.addEventListener("mouseup", handlePanEnd);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);

  // Prevent default middle-click scroll
  canvasContainer.addEventListener("auxclick", (e) => {
    if (e.button === 1) e.preventDefault();
  });

  // Tool handler forwarding (only when not panning, left-click only)
  canvasContainer.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || spaceDown || panning) return;
    if (getEditorState().activeTool === "hand") return;
    toolHandler?.onMouseDown?.(e, screenToScene(e));
  });
  document.addEventListener("mousemove", (e) => {
    if (panning) return;
    toolHandler?.onMouseMove?.(e, screenToScene(e));
  });
  document.addEventListener("mouseup", (e) => {
    if (e.button !== 0) return;
    toolHandler?.onMouseUp?.(e, screenToScene(e));
  });

  // Redraw when state changes
  subscribeEditor(() => {
    drawGrid();
    updateCursor();
  });
  subscribeScene(() => {
    drawSceneBoundary();
    drawGrid();
  });

  // Initial cursor
  updateCursor();
  updateZoomDisplay();
}
