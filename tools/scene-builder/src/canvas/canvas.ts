/**
 * Canvas module.
 *
 * Creates and manages the Three.js WebGLRenderer + Canvas2D overlay
 * for the scene builder. Full-screen canvas behind all panels.
 * Handles zoom (wheel), pan (middle-click, Space+drag, or Hand tool).
 *
 * Three.js renders entities with a top-down OrthographicCamera.
 * A transparent Canvas2D overlay on top draws editor chrome
 * (grid, boundary, selection, positions, routes, etc.).
 */

import * as THREE from "three";
import { createTopDownCamera } from "@sajou/stage";
import { getSceneState, subscribeScene } from "../state/scene-state.js";
import { getEditorState, subscribeEditor } from "../state/editor-state.js";
import { isRunModeActive } from "../run-mode/run-mode-state.js";
import type { ToolId } from "../types.js";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Interface for canvas tool event handlers. */
export interface CanvasToolHandler {
  onMouseDown?(e: MouseEvent, scenePos: { x: number; y: number }): void;
  onMouseMove?(e: MouseEvent, scenePos: { x: number; y: number }): void;
  onMouseUp?(e: MouseEvent, scenePos: { x: number; y: number }): void;
  onDoubleClick?(e: MouseEvent, scenePos: { x: number; y: number }): void;
}

// ---------------------------------------------------------------------------
// Cursor map
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

let webGLRenderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;
let overlayCanvas: HTMLCanvasElement | null = null;
let overlayCtx: CanvasRenderingContext2D | null = null;
let animFrameId: number | null = null;
let toolHandler: CanvasToolHandler | null = null;
let overlayDrawCallback:
  | ((ctx: CanvasRenderingContext2D, z: number, px: number, py: number) => void)
  | null = null;

const canvasContainer = document.getElementById("canvas-container")!;
const zoomLevelBtn = document.getElementById("zoom-level")!;

// Zoom / Pan
let zoom = 1;
let panX = 0;
let panY = 0;
let canvasWidth = 800;
let canvasHeight = 600;
let spaceDown = false;
let panning: {
  startX: number;
  startY: number;
  origPanX: number;
  origPanY: number;
} | null = null;

// Ground plane (scene area fill)
let groundPlane: THREE.Mesh | null = null;
let groundMaterial: THREE.MeshBasicMaterial | null = null;

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

/** Set the active tool handler for canvas events. */
export function setToolHandler(handler: CanvasToolHandler | null): void {
  toolHandler = handler;
}

/** Get the Three.js scene. */
export function getThreeScene(): THREE.Scene | null {
  return scene;
}

/** Get the top-down camera. */
export function getCamera(): THREE.OrthographicCamera | null {
  return camera;
}

/** Get the WebGL renderer. */
export function getWebGLRenderer(): THREE.WebGLRenderer | null {
  return webGLRenderer;
}

/** Get the overlay Canvas2D context. */
export function getOverlayCtx(): CanvasRenderingContext2D | null {
  return overlayCtx;
}

/** Get the overlay canvas element. */
export function getOverlayCanvas(): HTMLCanvasElement | null {
  return overlayCanvas;
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

/**
 * Register a callback for drawing scene overlays on the Canvas2D.
 * Called by scene-renderer to draw selection, positions, routes, etc.
 */
export function setOverlayDrawCallback(
  cb: (
    ctx: CanvasRenderingContext2D,
    z: number,
    px: number,
    py: number,
  ) => void,
): void {
  overlayDrawCallback = cb;
}

// ---------------------------------------------------------------------------
// Coordinate transforms
// ---------------------------------------------------------------------------

/** Convert screen (mouse) coordinates to scene coordinates. */
export function screenToScene(e: MouseEvent): { x: number; y: number } {
  if (!overlayCanvas) return { x: 0, y: 0 };
  const rect = overlayCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - panX) / zoom,
    y: (e.clientY - rect.top - panY) / zoom,
  };
}

// ---------------------------------------------------------------------------
// Camera + overlay update
// ---------------------------------------------------------------------------

/** Update the camera frustum to reflect current zoom/pan. */
function updateCamera(): void {
  if (!camera) return;
  camera.left = -panX / zoom;
  camera.right = (canvasWidth - panX) / zoom;
  camera.top = panY / zoom;
  camera.bottom = (panY - canvasHeight) / zoom;
  camera.updateProjectionMatrix();
}

/** Update the ground plane to match current scene dimensions and background. */
function updateGroundPlane(): void {
  if (!scene) return;

  const { dimensions, background } = getSceneState();

  if (groundPlane) {
    scene.remove(groundPlane);
    groundPlane.geometry.dispose();
    groundMaterial?.dispose();
  }

  const geom = new THREE.PlaneGeometry(dimensions.width, dimensions.height);
  geom.rotateX(-Math.PI / 2);
  // Translate so top-left corner is at (0, 0, 0)
  geom.translate(dimensions.width / 2, 0, dimensions.height / 2);

  groundMaterial = new THREE.MeshBasicMaterial({
    color: background.color || "#1a1a2e",
  });

  groundPlane = new THREE.Mesh(geom, groundMaterial);
  groundPlane.renderOrder = -1;
  scene.add(groundPlane);
}

/** Full overlay redraw: clear, draw grid/boundary, then scene overlays. */
export function redrawOverlay(): void {
  if (!overlayCtx || !overlayCanvas) return;

  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // Draw grid and boundary in scene coordinates
  overlayCtx.save();
  overlayCtx.setTransform(zoom, 0, 0, zoom, panX, panY);
  drawSceneBoundary(overlayCtx);
  drawGrid(overlayCtx);
  overlayCtx.restore();

  // Scene overlays (positions, routes, selection, etc.)
  overlayDrawCallback?.(overlayCtx, zoom, panX, panY);
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

function applyTransform(): void {
  updateCamera();
  updateZoomDisplay();
  redrawOverlay();
}

/** Center and fit the scene in the viewport. */
export function fitToView(): void {
  if (!camera) return;
  const { dimensions } = getSceneState();
  const fitZoom =
    Math.min(canvasWidth / dimensions.width, canvasHeight / dimensions.height) *
    0.85;
  zoom = Math.min(fitZoom, 2);
  panX = (canvasWidth - dimensions.width * zoom) / 2;
  panY = (canvasHeight - dimensions.height * zoom) / 2;
  applyTransform();
}

/** Set zoom to an exact level, centered on the viewport. */
export function setZoomLevel(level: number): void {
  const newZoom = Math.max(0.1, Math.min(10, level));
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
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
    const { activeTool, activeZoneTypeId } = getEditorState();
    if (activeTool === "background" && activeZoneTypeId !== null) {
      canvasContainer.style.cursor = "crosshair";
    } else {
      canvasContainer.style.cursor = TOOL_CURSORS[activeTool] ?? "default";
    }
  }
}

// ---------------------------------------------------------------------------
// Scene boundary (Canvas2D overlay)
// ---------------------------------------------------------------------------

function drawSceneBoundary(ctx: CanvasRenderingContext2D): void {
  const { dimensions } = getSceneState();

  // Border outline — brand "border" (#1E1E2E)
  ctx.strokeStyle = "#1e1e2e";
  ctx.lineWidth = 1.5 / zoom;
  ctx.strokeRect(0, 0, dimensions.width, dimensions.height);
}

// ---------------------------------------------------------------------------
// Grid (Canvas2D overlay)
// ---------------------------------------------------------------------------

function drawGrid(ctx: CanvasRenderingContext2D): void {
  const { gridEnabled, gridSize } = getEditorState();
  if (!gridEnabled) return;

  const { dimensions } = getSceneState();

  ctx.beginPath();
  for (let x = gridSize; x < dimensions.width; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, dimensions.height);
  }
  for (let y = gridSize; y < dimensions.height; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(dimensions.width, y);
  }

  ctx.strokeStyle = "rgba(30, 30, 46, 0.5)";
  ctx.lineWidth = 1 / zoom;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function handleWheel(e: WheelEvent): void {
  e.preventDefault();
  if (!overlayCanvas) return;
  const rect = overlayCanvas.getBoundingClientRect();
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
  const isHandTool =
    getEditorState().activeTool === "hand" && e.button === 0;
  if (!isMiddle && !isSpaceLeft && !isHandTool) return;
  e.preventDefault();
  panning = {
    startX: e.clientX,
    startY: e.clientY,
    origPanX: panX,
    origPanY: panY,
  };
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
  if (!webGLRenderer || !overlayCanvas) return;
  canvasWidth = canvasContainer.clientWidth || 800;
  canvasHeight = canvasContainer.clientHeight || 600;

  webGLRenderer.setSize(canvasWidth, canvasHeight);
  overlayCanvas.width = canvasWidth;
  overlayCanvas.height = canvasHeight;
  overlayCanvas.style.width = `${canvasWidth}px`;
  overlayCanvas.style.height = `${canvasHeight}px`;

  updateCamera();
  redrawOverlay();
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

function startRenderLoop(): void {
  if (animFrameId !== null) return;

  const loop = (): void => {
    animFrameId = requestAnimationFrame(loop);
    if (webGLRenderer && scene && camera) {
      webGLRenderer.render(scene, camera);
    }
  };
  loop();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the Three.js canvas + Canvas2D overlay. */
export function initCanvas(): void {
  canvasWidth = canvasContainer.clientWidth || 800;
  canvasHeight = canvasContainer.clientHeight || 600;

  // --- Three.js WebGL renderer ---
  const webGLCanvas = document.createElement("canvas");
  webGLCanvas.style.position = "absolute";
  webGLCanvas.style.top = "0";
  webGLCanvas.style.left = "0";

  webGLRenderer = new THREE.WebGLRenderer({
    canvas: webGLCanvas,
    antialias: false,
    alpha: false,
  });
  webGLRenderer.setSize(canvasWidth, canvasHeight);
  webGLRenderer.setPixelRatio(window.devicePixelRatio);
  webGLRenderer.setClearColor(0x07070c); // void color

  canvasContainer.appendChild(webGLCanvas);

  // --- Three.js scene + camera ---
  scene = new THREE.Scene();

  camera = createTopDownCamera(canvasWidth, canvasHeight);

  // Ambient light for flat 2D rendering
  const ambient = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambient);

  // Ground plane (scene area fill + background color)
  updateGroundPlane();

  // --- Canvas2D overlay (transparent, on top of WebGL) ---
  overlayCanvas = document.createElement("canvas");
  overlayCanvas.width = canvasWidth;
  overlayCanvas.height = canvasHeight;
  overlayCanvas.style.position = "absolute";
  overlayCanvas.style.top = "0";
  overlayCanvas.style.left = "0";
  overlayCanvas.style.width = `${canvasWidth}px`;
  overlayCanvas.style.height = `${canvasHeight}px`;
  overlayCanvas.style.pointerEvents = "auto";

  overlayCtx = overlayCanvas.getContext("2d");
  canvasContainer.appendChild(overlayCanvas);

  // Center the scene
  fitToView();

  // Start Three.js render loop
  startRenderLoop();

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
    if (isRunModeActive()) return;
    toolHandler?.onMouseDown?.(e, screenToScene(e));
  });
  document.addEventListener("mousemove", (e) => {
    if (panning) return;
    if (isRunModeActive()) return;
    toolHandler?.onMouseMove?.(e, screenToScene(e));
  });
  document.addEventListener("mouseup", (e) => {
    if (e.button !== 0) return;
    if (isRunModeActive()) return;
    toolHandler?.onMouseUp?.(e, screenToScene(e));
  });
  canvasContainer.addEventListener("dblclick", (e) => {
    if (e.button !== 0 || spaceDown || panning) return;
    if (getEditorState().activeTool === "hand") return;
    if (isRunModeActive()) return;
    toolHandler?.onDoubleClick?.(e, screenToScene(e));
  });

  // Redraw when state changes
  subscribeEditor(() => {
    redrawOverlay();
    updateCursor();
  });
  subscribeScene(() => {
    updateGroundPlane();
    redrawOverlay();
  });

  // Initial cursor
  updateCursor();
  updateZoomDisplay();
}
