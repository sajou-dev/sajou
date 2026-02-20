/**
 * Pointer input handler for the Stage.
 *
 * Uses Three.js Raycaster to detect entity clicks and ground-plane hits.
 * Emits InteractionEvents to registered callbacks.
 */

import * as THREE from "three";
import type { EntityManager } from "./entity-manager.js";
import type { InteractionCallback, InteractionEvent } from "./types.js";

/**
 * Handles pointer input on the Stage canvas.
 *
 * On pointerdown:
 * 1. Raycast against entity meshes — if hit, emit "click" with entityId.
 * 2. If no entity hit, intersect the Y=0 ground plane — emit "point" with board coords.
 */
export class InputHandler {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    0,
  );
  private readonly camera: THREE.OrthographicCamera;
  private readonly entityManager: EntityManager;
  private readonly canvas: HTMLCanvasElement;
  private readonly listeners: InteractionCallback[] = [];
  private readonly onPointerDown: (e: PointerEvent) => void;

  constructor(
    canvas: HTMLCanvasElement,
    camera: THREE.OrthographicCamera,
    entityManager: EntityManager,
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.entityManager = entityManager;

    this.onPointerDown = (e: PointerEvent) => {
      this.handlePointerDown(e);
    };
    canvas.addEventListener("pointerdown", this.onPointerDown);
  }

  /** Register a callback for interaction events. */
  on(callback: InteractionCallback): void {
    this.listeners.push(callback);
  }

  /** Remove a previously registered callback. */
  off(callback: InteractionCallback): void {
    const idx = this.listeners.indexOf(callback);
    if (idx >= 0) this.listeners.splice(idx, 1);
  }

  /** Clean up event listeners and callbacks. */
  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.listeners.length = 0;
  }

  private handlePointerDown(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Check entity hits first
    const targets = this.entityManager.getRaycastTargets();
    if (targets.length > 0) {
      const hits = this.raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const firstHit = hits[0];
        if (firstHit) {
          const entityId = this.entityManager.findEntityId(firstHit.object);
          if (entityId) {
            this.emit({
              type: "click",
              entityId,
              boardX: firstHit.point.x,
              boardZ: firstHit.point.z,
            });
            return;
          }
        }
      }
    }

    // No entity hit — intersect the ground plane
    const worldPoint = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, worldPoint)) {
      this.emit({
        type: "point",
        boardX: worldPoint.x,
        boardZ: worldPoint.z,
      });
    }
  }

  private emit(event: InteractionEvent): void {
    for (const cb of this.listeners) {
      cb(event);
    }
  }
}
