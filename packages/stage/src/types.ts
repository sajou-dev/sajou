/**
 * Internal types for the Stage renderer.
 */

import type * as THREE from "three";

/** Internal record for a managed entity. */
export interface EntityRecord {
  readonly id: string;
  readonly group: THREE.Group;
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshStandardMaterial;
  /** Current board position (board X → world X, board Y → world Z). */
  boardX: number;
  boardZ: number;
}

/** Active tween for an animated entity move. */
export interface MoveTween {
  readonly entityId: string;
  readonly fromX: number;
  readonly fromZ: number;
  readonly toX: number;
  readonly toZ: number;
}

/** User interaction event emitted by the input handler. */
export interface InteractionEvent {
  /** "click" if an entity was hit, "point" if empty ground was clicked. */
  readonly type: "click" | "point";
  /** Entity ID (only for "click" type). */
  readonly entityId?: string;
  /** Board X coordinate of the interaction. */
  readonly boardX: number;
  /** Board Z coordinate (mapped from board Y). */
  readonly boardZ: number;
}

/** Callback for user interaction events. */
export type InteractionCallback = (event: InteractionEvent) => void;
