/**
 * Canvas module.
 *
 * Creates and manages the Three.js WebGLRenderer + Canvas2D overlay
 * for the scene builder. Full-screen canvas behind all panels.
 * Handles zoom (wheel), pan (middle-click, Space+drag, or Hand tool).
 *
 * Three.js renders entities via a CameraController that supports
 * both top-down and isometric projection modes.
 * A transparent Canvas2D overlay on top draws editor chrome
 * (grid, boundary, selection, positions, routes, etc.).
 */

import * as THREE from "three";
import { getSceneState, subscribeScene } from "../state/scene-state.js";
import { getEditorState, subscribeEditor } from "../state/editor-state.js";
import { isRunModeActive } from "../run-mode/run-mode-state.js";
import type { ToolId, ViewMode } from "../types.js";
import {
  TopDownController,
  createController,
  type CameraController,
} from "./camera-controller.js";
import { initLightRenderer, tickFlicker } from "./light-renderer.js";
import { initParticleRenderer, tickParticles } from "./particle-renderer.js";

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
  light: "crosshair",
  particle: "crosshair",
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let webGLRenderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let controller: CameraController | null = null;
let overlayCanvas: HTMLCanvasElement | null = null;
let overlayCtx: CanvasRenderingContext2D | null = null;
let animFrameId: number | null = null;
let toolHandler: CanvasToolHandler | null = null;
let overlayDrawCallback:
  | ((ctx: CanvasRenderingContext2D, z: number, px: number, py: number) => void)
  | null = null;

/** Listeners notified when the controller is swapped (for billboarding etc.). */
type ControllerChangeListener = (ctrl: CameraController) => void;
const controllerChangeListeners: ControllerChangeListener[] = [];

/** Resolved in initCanvas() — null before init. */
let canvasContainer: HTMLElement | null = null;
let zoomLevelBtn: HTMLElement | null = null;

let canvasWidth = 800;
let canvasHeight = 600;
let spaceDown = false;
let panning: {
  lastX: number;
  lastY: number;
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

/** Get the active camera. */
export function getCamera(): THREE.OrthographicCamera | null {
  return controller?.camera ?? null;
}

/** Get the active camera controller. */
export function getController(): CameraController | null {
  return controller;
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

/** Get current effective zoom level. */
export function getZoom(): number {
  return controller?.getEffectiveZoom() ?? 1;
}

/** Get current pan offset (top-down only; iso returns 0,0). */
export function getPan(): { x: number; y: number } {
  if (controller) {
    const t = controller.getOverlayTransform();
    return { x: t.e, y: t.f };
  }
  return { x: 0, y: 0 };
}

/** Get the canvas container DOM element (null before initCanvas). */
export function getCanvasContainer(): HTMLElement | null {
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

/**
 * Subscribe to controller changes (when switching top-down ↔ iso).
 * Returns unsubscribe function.
 */
export function onControllerChange(fn: ControllerChangeListener): () => void {
  controllerChangeListeners.push(fn);
  return () => {
    const idx = controllerChangeListeners.indexOf(fn);
    if (idx >= 0) controllerChangeListeners.splice(idx, 1);
  };
}

// ---------------------------------------------------------------------------
// Coordinate transforms
// ---------------------------------------------------------------------------

/** Convert screen (mouse) coordinates to scene coordinates. */
export function screenToScene(e: MouseEvent): { x: number; y: number } {
  if (!overlayCanvas || !controller) return { x: 0, y: 0 };
  const rect = overlayCanvas.getBoundingClientRect();
  return controller.screenToScene(e.clientX, e.clientY, rect);
}

/** Convert scene coordinates to screen (viewport) pixel coordinates. */
export function sceneToScreen(sceneX: number, sceneY: number): { x: number; y: number } {
  if (!controller) return { x: 0, y: 0 };
  return controller.sceneToScreen(sceneX, sceneY);
}

/** Convert world-space (x, y, z) coordinates to screen pixel coordinates. */
export function worldToScreen(wx: number, wy: number, wz: number): { x: number; y: number } {
  if (!controller || !overlayCanvas) return { x: 0, y: 0 };
  const v = new THREE.Vector3(wx, wy, wz);
  v.project(controller.camera);
  return {
    x: (v.x * 0.5 + 0.5) * overlayCanvas.width,
    y: (-v.y * 0.5 + 0.5) * overlayCanvas.height,
  };
}

// ---------------------------------------------------------------------------
// Camera + overlay update
// ---------------------------------------------------------------------------

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
  groundPlane.position.y = -0.1;
  scene.add(groundPlane);
}

/** Full overlay redraw: clear, draw grid/boundary, then scene overlays. */
export function redrawOverlay(): void {
  if (!overlayCtx || !overlayCanvas || !controller) return;

  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  const t = controller.getOverlayTransform();
  const effectiveZoom = controller.getEffectiveZoom();

  // Draw grid and boundary in scene coordinates
  overlayCtx.save();
  overlayCtx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
  drawSceneBoundary(overlayCtx, effectiveZoom);
  drawGrid(overlayCtx, effectiveZoom);
  overlayCtx.restore();

  // Scene overlays (positions, routes, selection, etc.)
  overlayDrawCallback?.(overlayCtx, effectiveZoom, t.e, t.f);
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

function applyTransform(): void {
  if (!controller) return;
  controller.updateCamera();
  updateZoomDisplay();
  redrawOverlay();
}

/** Center and fit the scene in the viewport. */
export function fitToView(): void {
  if (!controller) return;
  const { dimensions } = getSceneState();
  controller.fitToView(dimensions.width, dimensions.height);
  applyTransform();
}

/** Set zoom to an exact level, centered on the viewport. */
export function setZoomLevel(level: number): void {
  if (!controller) return;
  if (controller instanceof TopDownController) {
    controller.setZoomLevel(level);
  } else {
    // For iso, convert level to a relative factor from current zoom
    const current = controller.getEffectiveZoom();
    if (current > 0) {
      controller.applyZoom(level / current, canvasWidth / 2, canvasHeight / 2);
    }
  }
  applyTransform();
}

/** Zoom in by one step (~10%). */
export function zoomIn(): void {
  if (!controller) return;
  controller.applyZoom(1.15, canvasWidth / 2, canvasHeight / 2);
  applyTransform();
}

/** Zoom out by one step (~10%). */
export function zoomOut(): void {
  if (!controller) return;
  controller.applyZoom(1 / 1.15, canvasWidth / 2, canvasHeight / 2);
  applyTransform();
}

function updateZoomDisplay(): void {
  const z = controller?.getEffectiveZoom() ?? 1;
  if (zoomLevelBtn) zoomLevelBtn.textContent = `${Math.round(z * 100)}%`;
}

// ---------------------------------------------------------------------------
// Controller switching
// ---------------------------------------------------------------------------

/** Track the last view mode to detect changes from editor state. */
let currentViewMode: ViewMode = "top-down";

/** Switch the active camera controller to match a new view mode. */
export function switchController(mode: ViewMode): void {
  if (!scene) return;
  const { dimensions } = getSceneState();

  controller = createController(mode, canvasWidth, canvasHeight, dimensions.width, dimensions.height);
  controller.fitToView(dimensions.width, dimensions.height);
  controller.updateCamera();
  currentViewMode = mode;

  // Notify listeners (e.g., scene-renderer for billboarding)
  for (const fn of controllerChangeListeners) fn(controller);

  applyTransform();
}

// ---------------------------------------------------------------------------
// Cursor management
// ---------------------------------------------------------------------------

/** Update the canvas cursor based on active tool. */
export function updateCursor(): void {
  if (!canvasContainer) return;
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

function drawSceneBoundary(ctx: CanvasRenderingContext2D, effectiveZoom: number): void {
  const { dimensions } = getSceneState();

  // Border outline — brand "border" (#1E1E2E)
  ctx.strokeStyle = "#1e1e2e";
  ctx.lineWidth = 1.5 / effectiveZoom;
  ctx.strokeRect(0, 0, dimensions.width, dimensions.height);
}

// ---------------------------------------------------------------------------
// Grid (Canvas2D overlay)
// ---------------------------------------------------------------------------

function drawGrid(ctx: CanvasRenderingContext2D, effectiveZoom: number): void {
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
  ctx.lineWidth = 1 / effectiveZoom;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function handleWheel(e: WheelEvent): void {
  e.preventDefault();
  if (!overlayCanvas || !controller) return;
  const rect = overlayCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  controller.applyZoom(factor, mx, my);
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
    lastX: e.clientX,
    lastY: e.clientY,
  };
  if (canvasContainer) canvasContainer.style.cursor = "grabbing";
}

function handlePanMove(e: MouseEvent): void {
  if (!panning || !controller) return;
  const dx = e.clientX - panning.lastX;
  const dy = e.clientY - panning.lastY;
  panning.lastX = e.clientX;
  panning.lastY = e.clientY;
  controller.applyPan(dx, dy);
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
  if (!webGLRenderer || !overlayCanvas || !controller || !canvasContainer) return;
  canvasWidth = canvasContainer.clientWidth || 800;
  canvasHeight = canvasContainer.clientHeight || 600;

  webGLRenderer.setSize(canvasWidth, canvasHeight);
  overlayCanvas.width = canvasWidth;
  overlayCanvas.height = canvasHeight;
  overlayCanvas.style.width = `${canvasWidth}px`;
  overlayCanvas.style.height = `${canvasHeight}px`;

  controller.resize(canvasWidth, canvasHeight);
  controller.updateCamera();
  redrawOverlay();
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

function startRenderLoop(): void {
  if (animFrameId !== null) return;

  let lastFrameTime = performance.now();

  const loop = (): void => {
    animFrameId = requestAnimationFrame(loop);
    if (webGLRenderer && scene && controller) {
      const now = performance.now();
      const dt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      tickFlicker(now);
      tickParticles(dt);
      webGLRenderer.render(scene, controller.camera);
    }
  };
  loop();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the Three.js canvas + Canvas2D overlay. */
export function initCanvas(): void {
  canvasContainer = document.getElementById("canvas-container");
  zoomLevelBtn = document.getElementById("zoom-level");
  if (!canvasContainer) return;

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

  // --- Three.js scene ---
  scene = new THREE.Scene();

  // --- Camera controller (top-down by default) ---
  controller = new TopDownController(canvasWidth, canvasHeight);
  currentViewMode = "top-down";

  // Ground plane (scene area fill + background color)
  updateGroundPlane();

  // Light renderer (ambient, directional, point lights from state)
  initLightRenderer();

  // Particle renderer (particle emitters from state)
  initParticleRenderer();

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
    // Detect view mode change
    const { viewMode } = getEditorState();
    if (viewMode !== currentViewMode) {
      switchController(viewMode);
    }
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
