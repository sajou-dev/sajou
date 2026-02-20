/**
 * Isometric camera setup for the Stage.
 *
 * OrthographicCamera at (d, d, d) looking at origin — equal
 * projection on all axes. Entities rotate on Y-axis to face camera.
 */

import * as THREE from "three";

/** Configuration for creating an isometric camera. */
export interface IsometricCameraOptions {
  /** Viewport width in pixels. */
  readonly width: number;
  /** Viewport height in pixels. */
  readonly height: number;
  /** Vertical view span in world units. Default: 20. */
  readonly viewSize?: number;
}

/**
 * Create an OrthographicCamera for isometric projection.
 * Camera sits at (d, d, d) looking at origin.
 */
export function createIsometricCamera(
  options: IsometricCameraOptions,
): THREE.OrthographicCamera {
  const { width, height, viewSize = 20 } = options;
  const aspect = width / height;

  const camera = new THREE.OrthographicCamera(
    (-viewSize * aspect) / 2,
    (viewSize * aspect) / 2,
    viewSize / 2,
    -viewSize / 2,
    0.1,
    1000,
  );

  const d = 50;
  camera.position.set(d, d, d);
  camera.lookAt(0, 0, 0);

  return camera;
}

/**
 * Create a top-down OrthographicCamera for the editor.
 * Camera sits directly above the scene looking straight down.
 * Scene coordinates map 1:1 to pixels.
 */
export function createTopDownCamera(
  width: number,
  height: number,
): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(
    0,        // left
    width,    // right
    0,        // top
    -height,  // bottom (negative: camera +Y = world -Z)
    0.1,
    1000,
  );

  camera.position.set(0, 100, 0);
  camera.lookAt(0, 0, 0);
  // Rotate so +X is right, +Z is down (matching 2D screen coords)
  camera.up.set(0, 0, -1);
  camera.updateProjectionMatrix();

  return camera;
}

/**
 * Compute the Y-axis billboard angle so sprites face the isometric camera.
 *
 * Uses the camera's world direction (not position) so the angle is constant
 * for orthographic cameras regardless of pan/target position.
 */
const _billboardDir = new THREE.Vector3();
export function computeBillboardAngle(
  camera: THREE.OrthographicCamera,
): number {
  camera.getWorldDirection(_billboardDir);
  // Face toward the camera: negate the direction
  return Math.atan2(-_billboardDir.x, -_billboardDir.z);
}

/** Update camera frustum for a new viewport size. */
export function resizeCamera(
  camera: THREE.OrthographicCamera,
  width: number,
  height: number,
  viewSize: number,
): void {
  const aspect = width / height;
  camera.left = (-viewSize * aspect) / 2;
  camera.right = (viewSize * aspect) / 2;
  camera.top = viewSize / 2;
  camera.bottom = -viewSize / 2;
  camera.updateProjectionMatrix();
}

/** Update a top-down camera frustum for a new viewport size. */
export function resizeTopDownCamera(
  camera: THREE.OrthographicCamera,
  width: number,
  height: number,
): void {
  camera.right = width;
  camera.bottom = height;
  camera.updateProjectionMatrix();
}
