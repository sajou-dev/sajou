/**
 * Entity lifecycle manager for the Stage.
 *
 * Entities are upright PlaneGeometry meshes with MeshStandardMaterial,
 * rotated to face the isometric camera (Y-axis only, no vertical tilt).
 * Supports spawn, move (tweened), remove, and property mutations.
 */

import * as THREE from "three";
import type { EntityRecord, MoveTween } from "./types.js";

/** Options for spawning an entity. */
export interface SpawnOptions {
  /** Unique entity identifier. */
  readonly id: string;
  /** Board X position (maps to world X). */
  readonly x: number;
  /** Board Z position / board Y (maps to world Z). */
  readonly z: number;
  /** Entity color (used for solid-color fallback). Default: 0x4488ff. */
  readonly color?: number;
  /** Plane width in world units. Default: 1. */
  readonly size?: number;
}

/**
 * Manages entity lifecycle in the Three.js scene.
 *
 * Each entity is a Group containing an upright Mesh (PlaneGeometry +
 * MeshStandardMaterial). The mesh is rotated once to face the isometric
 * camera on the Y-axis — no dynamic billboarding needed.
 */
export class EntityManager {
  private readonly entities = new Map<string, EntityRecord>();
  private readonly tweens = new Map<string, MoveTween>();
  private readonly scene: THREE.Scene;
  private readonly billboardAngle: number;

  constructor(scene: THREE.Scene, billboardAngle: number) {
    this.scene = scene;
    this.billboardAngle = billboardAngle;
  }

  /** Spawn a new entity at the given board position. */
  spawn(options: SpawnOptions): EntityRecord {
    const { id, x, z, color = 0x4488ff, size = 1 } = options;

    if (this.entities.has(id)) {
      this.remove(id);
    }

    const height = size * 1.5;
    const geometry = new THREE.PlaneGeometry(size, height);
    const material = new THREE.MeshStandardMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData["entityId"] = id;
    mesh.position.y = height / 2;
    mesh.rotation.y = this.billboardAngle;

    const group = new THREE.Group();
    group.add(mesh);
    group.position.set(x, 0, z);

    this.scene.add(group);

    const record: EntityRecord = {
      id,
      group,
      mesh,
      material,
      boardX: x,
      boardZ: z,
    };

    this.entities.set(id, record);
    return record;
  }

  /** Start a move tween for an entity. Called by onActionStart("move"). */
  startMove(entityId: string, toX: number, toZ: number): void {
    const record = this.entities.get(entityId);
    if (!record) return;

    this.tweens.set(entityId, {
      entityId,
      fromX: record.group.position.x,
      fromZ: record.group.position.z,
      toX,
      toZ,
    });
  }

  /** Update a move tween. Progress is 0–1, already eased by the choreographer. */
  updateMove(entityId: string, progress: number): void {
    const record = this.entities.get(entityId);
    const tween = this.tweens.get(entityId);
    if (!record || !tween) return;

    record.group.position.x =
      tween.fromX + (tween.toX - tween.fromX) * progress;
    record.group.position.z =
      tween.fromZ + (tween.toZ - tween.fromZ) * progress;
  }

  /** Complete a move tween — snap to final position. */
  completeMove(entityId: string): void {
    const record = this.entities.get(entityId);
    const tween = this.tweens.get(entityId);
    if (!record || !tween) return;

    record.group.position.x = tween.toX;
    record.group.position.z = tween.toZ;
    record.boardX = tween.toX;
    record.boardZ = tween.toZ;
    this.tweens.delete(entityId);
  }

  // -----------------------------------------------------------------------
  // Property setters (for scene-builder adapter)
  // -----------------------------------------------------------------------

  /** Set an entity's board position directly (2D: x,y → world: x,z). */
  setPosition(entityId: string, x: number, z: number): void {
    const record = this.entities.get(entityId);
    if (!record) return;
    record.group.position.x = x;
    record.group.position.z = z;
    record.boardX = x;
    record.boardZ = z;
  }

  /** Set an entity's uniform scale. */
  setScale(entityId: string, scale: number): void {
    const record = this.entities.get(entityId);
    if (!record) return;
    record.group.scale.setScalar(scale);
  }

  /** Set per-axis scale (for direction flip). */
  setScaleXY(entityId: string, sx: number, sy: number): void {
    const record = this.entities.get(entityId);
    if (!record) return;
    record.group.scale.set(sx, sy, 1);
  }

  /** Set an entity's Y-axis rotation (degrees → radians). */
  setRotation(entityId: string, radians: number): void {
    const record = this.entities.get(entityId);
    if (!record) return;
    // Rotation is applied to the group, billboard angle is on the mesh
    record.group.rotation.y = radians;
  }

  /** Set an entity's opacity. */
  setOpacity(entityId: string, alpha: number): void {
    const record = this.entities.get(entityId);
    if (!record) return;
    record.material.opacity = alpha;
  }

  /** Set an entity's tint color. */
  setTint(entityId: string, color: number): void {
    const record = this.entities.get(entityId);
    if (!record) return;
    record.material.color.setHex(color);
  }

  /** Set an entity's visibility. */
  setVisible(entityId: string, visible: boolean): void {
    const record = this.entities.get(entityId);
    if (!record) return;
    record.group.visible = visible;
  }

  /** Set the diffuse texture (map) on an entity's material. */
  setTexture(entityId: string, texture: THREE.Texture): void {
    const record = this.entities.get(entityId);
    if (!record) return;
    record.material.map = texture;
    record.material.needsUpdate = true;
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  /** Remove an entity from the scene. */
  remove(entityId: string): void {
    const record = this.entities.get(entityId);
    if (!record) return;

    this.scene.remove(record.group);
    record.mesh.geometry.dispose();
    record.material.dispose();
    this.entities.delete(entityId);
    this.tweens.delete(entityId);
  }

  /** Get an entity record by ID. */
  get(entityId: string): EntityRecord | undefined {
    return this.entities.get(entityId);
  }

  /** Get all entity meshes for raycasting. */
  getRaycastTargets(): THREE.Object3D[] {
    return [...this.entities.values()].map((r) => r.mesh);
  }

  /** Find entity ID from a raycaster hit object (walks up the parent chain). */
  findEntityId(object: THREE.Object3D): string | undefined {
    let current: THREE.Object3D | null = object;
    while (current) {
      const id = current.userData["entityId"] as string | undefined;
      if (id) return id;
      current = current.parent;
    }
    return undefined;
  }

  /** Dispose all entities and clean up resources. */
  dispose(): void {
    for (const id of [...this.entities.keys()]) {
      this.remove(id);
    }
  }
}
