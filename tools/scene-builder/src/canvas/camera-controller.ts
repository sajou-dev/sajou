/**
 * Camera controller module.
 *
 * Abstracts zoom, pan, and coordinate projection behind a common interface.
 * Two implementations: TopDownController (2D editor) and IsometricController (3D iso view).
 *
 * The overlay transform is always affine (orthographic projection is affine),
 * so Canvas2D setTransform() works for both modes.
 */

import * as THREE from "three";
import {
  createTopDownCamera,
  createIsometricCamera,
  resizeCamera,
  computeBillboardAngle,
} from "@sajou/stage";
import type { ViewMode } from "../types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/** Affine transform matrix components for Canvas2D setTransform(a,b,c,d,e,f). */
export interface AffineTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** Common interface for camera controllers. */
export interface CameraController {
  readonly mode: ViewMode;
  readonly camera: THREE.OrthographicCamera;

  /** Convert screen (client) coordinates to scene coordinates. */
  screenToScene(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number };

  /** Convert scene coordinates to screen (viewport) pixel coordinates. */
  sceneToScreen(sceneX: number, sceneY: number): { x: number; y: number };

  /** Apply zoom around a screen point. */
  applyZoom(factor: number, screenX: number, screenY: number): void;

  /** Apply pan delta in screen pixels. */
  applyPan(dx: number, dy: number): void;

  /** Fit the scene dimensions into the viewport. */
  fitToView(sceneW: number, sceneH: number): void;

  /** Handle viewport resize. */
  resize(w: number, h: number): void;

  /** Get the affine transform for Canvas2D overlays. */
  getOverlayTransform(): AffineTransform;

  /** Get the effective zoom level (for UI display and line width scaling). */
  getEffectiveZoom(): number;

  /** Update the camera projection matrix. Called after zoom/pan changes. */
  updateCamera(): void;
}

// ---------------------------------------------------------------------------
// TopDownController
// ---------------------------------------------------------------------------

/**
 * Top-down camera controller.
 *
 * Exact extraction of the existing zoom/panX/panY logic from canvas.ts.
 * Scene coordinates map 1:1 to pixels at zoom=1.
 */
export class TopDownController implements CameraController {
  readonly mode: ViewMode = "top-down";
  readonly camera: THREE.OrthographicCamera;

  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private viewportW: number;
  private viewportH: number;

  constructor(w: number, h: number) {
    this.viewportW = w;
    this.viewportH = h;
    this.camera = createTopDownCamera(w, h);
  }

  screenToScene(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } {
    return {
      x: (clientX - rect.left - this.panX) / this.zoom,
      y: (clientY - rect.top - this.panY) / this.zoom,
    };
  }

  sceneToScreen(sceneX: number, sceneY: number): { x: number; y: number } {
    return {
      x: sceneX * this.zoom + this.panX,
      y: sceneY * this.zoom + this.panY,
    };
  }

  applyZoom(factor: number, screenX: number, screenY: number): void {
    const newZoom = Math.max(0.1, Math.min(10, this.zoom * factor));
    this.panX = screenX - ((screenX - this.panX) / this.zoom) * newZoom;
    this.panY = screenY - ((screenY - this.panY) / this.zoom) * newZoom;
    this.zoom = newZoom;
  }

  applyPan(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
  }

  fitToView(sceneW: number, sceneH: number): void {
    const fitZoom = Math.min(this.viewportW / sceneW, this.viewportH / sceneH) * 0.85;
    this.zoom = Math.min(fitZoom, 2);
    this.panX = (this.viewportW - sceneW * this.zoom) / 2;
    this.panY = (this.viewportH - sceneH * this.zoom) / 2;
  }

  resize(w: number, h: number): void {
    this.viewportW = w;
    this.viewportH = h;
  }

  getOverlayTransform(): AffineTransform {
    return { a: this.zoom, b: 0, c: 0, d: this.zoom, e: this.panX, f: this.panY };
  }

  getEffectiveZoom(): number {
    return this.zoom;
  }

  updateCamera(): void {
    this.camera.left = -this.panX / this.zoom;
    this.camera.right = (this.viewportW - this.panX) / this.zoom;
    this.camera.top = this.panY / this.zoom;
    this.camera.bottom = (this.panY - this.viewportH) / this.zoom;
    this.camera.updateProjectionMatrix();
  }

  /** Set zoom to an exact level centered on the viewport. */
  setZoomLevel(level: number): void {
    const newZoom = Math.max(0.1, Math.min(10, level));
    const cx = this.viewportW / 2;
    const cy = this.viewportH / 2;
    this.panX = cx - ((cx - this.panX) / this.zoom) * newZoom;
    this.panY = cy - ((cy - this.panY) / this.zoom) * newZoom;
    this.zoom = newZoom;
  }
}

// ---------------------------------------------------------------------------
// IsometricController
// ---------------------------------------------------------------------------

/** Scratch vectors for projection math (avoid allocations). */
const _vec3 = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _intersection = new THREE.Vector3();

/**
 * Isometric camera controller.
 *
 * OrthographicCamera at (d,d,d) looking at a moveable target on the Y=0 plane.
 * Zoom controls the ortho frustum size (viewSize).
 * Pan moves the camera target along the screen-projected XZ axes.
 */
export class IsometricController implements CameraController {
  readonly mode: ViewMode = "isometric";
  readonly camera: THREE.OrthographicCamera;

  private viewSize: number;
  private target = new THREE.Vector3();
  private viewportW: number;
  private viewportH: number;
  private sceneW: number;
  private sceneH: number;

  /** Camera distance from target (along the (1,1,1) direction). */
  private static readonly CAMERA_DIST = 500;

  constructor(w: number, h: number, sceneW: number, sceneH: number) {
    this.viewportW = w;
    this.viewportH = h;
    this.sceneW = sceneW;
    this.sceneH = sceneH;
    // Initial viewSize: fit the scene
    this.viewSize = Math.max(sceneW, sceneH) * 1.2;
    this.target.set(sceneW / 2, 0, sceneH / 2);

    this.camera = createIsometricCamera({ width: w, height: h, viewSize: this.viewSize });
    this.positionCamera();
  }

  /** Move camera to target + offset along (1,1,1). */
  private positionCamera(): void {
    const d = IsometricController.CAMERA_DIST;
    const dir = new THREE.Vector3(1, 1, 1).normalize();
    this.camera.position.copy(this.target).addScaledVector(dir, d);
    this.camera.lookAt(this.target);
    // Ensure near/far encompass the full scene from this position.
    // Far must cover camera→farthest-corner distance for any scene size.
    const diag = Math.hypot(this.sceneW, this.sceneH);
    this.camera.near = 0.1;
    this.camera.far = d + diag * 2;
  }

  screenToScene(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } {
    // Convert screen to NDC
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

    // Raycast from camera through NDC point onto Y=0 plane
    _raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = _raycaster.ray.intersectPlane(_groundPlane, _intersection);

    if (hit) {
      return { x: hit.x, y: hit.z };
    }
    // Fallback (should not happen with ortho)
    return { x: 0, y: 0 };
  }

  sceneToScreen(sceneX: number, sceneY: number): { x: number; y: number } {
    _vec3.set(sceneX, 0, sceneY);
    _vec3.project(this.camera);
    return {
      x: (_vec3.x * 0.5 + 0.5) * this.viewportW,
      y: (-_vec3.y * 0.5 + 0.5) * this.viewportH,
    };
  }

  applyZoom(factor: number, _screenX: number, _screenY: number): void {
    this.viewSize = Math.max(10, Math.min(5000, this.viewSize / factor));
    this.updateFrustum();
  }

  applyPan(dx: number, dy: number): void {
    // Compute camera's right and up vectors projected onto the XZ plane
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.camera.getWorldDirection(_vec3);

    // Camera right = cross(direction, worldUp)
    right.crossVectors(_vec3, new THREE.Vector3(0, 1, 0)).normalize();
    // Camera up projected onto XZ = cross(right, direction) but we use screen up
    up.crossVectors(right, _vec3).normalize();
    // Project up onto XZ (zero out Y, renormalize)
    up.y = 0;
    if (up.lengthSq() > 0.001) up.normalize();

    // Convert pixel delta to world units
    const pixelsPerUnit = this.viewportH / this.viewSize;
    const worldDx = -dx / pixelsPerUnit;
    const worldDy = dy / pixelsPerUnit;

    this.target.addScaledVector(right, worldDx);
    this.target.addScaledVector(up, worldDy);
    this.positionCamera();
  }

  fitToView(sceneW: number, sceneH: number): void {
    this.viewSize = Math.max(sceneW, sceneH) * 1.2;
    this.target.set(sceneW / 2, 0, sceneH / 2);
    this.positionCamera();
    this.updateFrustum();
  }

  resize(w: number, h: number): void {
    this.viewportW = w;
    this.viewportH = h;
    this.updateFrustum();
  }

  getOverlayTransform(): AffineTransform {
    // Derive affine transform from projecting basis vectors
    const o = this.sceneToScreen(0, 0);
    const rx = this.sceneToScreen(1, 0);
    const ry = this.sceneToScreen(0, 1);

    // Basis vectors in screen space
    const ax = rx.x - o.x;
    const bx = rx.y - o.y;
    const cx = ry.x - o.x;
    const dx = ry.y - o.y;

    return { a: ax, b: bx, c: cx, d: dx, e: o.x, f: o.y };
  }

  getEffectiveZoom(): number {
    // Approximate: pixels per scene unit
    const o = this.sceneToScreen(0, 0);
    const r = this.sceneToScreen(1, 0);
    return Math.hypot(r.x - o.x, r.y - o.y);
  }

  updateCamera(): void {
    this.positionCamera();
    this.updateFrustum();
  }

  /** Update the ortho frustum from current viewSize. */
  private updateFrustum(): void {
    resizeCamera(this.camera, this.viewportW, this.viewportH, this.viewSize);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create the appropriate camera controller for a given view mode. */
export function createController(
  mode: ViewMode,
  viewportW: number,
  viewportH: number,
  sceneW: number,
  sceneH: number,
): CameraController {
  if (mode === "isometric") {
    return new IsometricController(viewportW, viewportH, sceneW, sceneH);
  }
  return new TopDownController(viewportW, viewportH);
}

export { computeBillboardAngle };
