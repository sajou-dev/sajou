/**
 * TypeScript types for the Stage bridge — the JS ↔ Godot WASM communication contract.
 *
 * Commands flow from the TypeScript host (core/choreographer) to Godot.
 * Events flow from Godot (user interactions) back to the TypeScript host.
 *
 * Both sides serialize as JSON. The bridge is the only coupling point
 * between the TypeScript world and the GDScript world.
 */

import type { BoardPosition } from "./signal-types.js";

// ---------------------------------------------------------------------------
// Commands: host → Stage (core/choreographer tells Godot what to do)
// ---------------------------------------------------------------------------

/** Spawn a new entity on the board. */
export interface SpawnEntityCommand {
  readonly type: "spawn_entity";
  readonly entity: {
    readonly id: string;
    readonly label?: string;
    readonly position: BoardPosition;
    readonly spritesheet?: string;
    readonly animation?: string;
  };
}

/** Move an entity to a new position with animation. */
export interface MoveEntityCommand {
  readonly type: "move_entity";
  readonly entityId: string;
  readonly position: BoardPosition;
  /** Duration in seconds. Defaults to 1.0. */
  readonly duration?: number;
}

/** Remove an entity from the board. */
export interface RemoveEntityCommand {
  readonly type: "remove_entity";
  readonly entityId: string;
}

/** Play an animation on an entity. */
export interface PlayAnimationCommand {
  readonly type: "play_animation";
  readonly entityId: string;
  readonly animation: string;
  /** Whether to loop. Defaults to false (play once). */
  readonly loop?: boolean;
}

/** Update a light source's properties. */
export interface SetLightingCommand {
  readonly type: "set_lighting";
  readonly lightId: string;
  readonly properties: {
    readonly color?: string;
    readonly intensity?: number;
    readonly radius?: number;
    readonly enabled?: boolean;
  };
}

/** Discriminated union of all commands the host can send to the Stage. */
export type StageBridgeCommand =
  | SpawnEntityCommand
  | MoveEntityCommand
  | RemoveEntityCommand
  | PlayAnimationCommand
  | SetLightingCommand;

// ---------------------------------------------------------------------------
// Events: Stage → host (Godot tells the host what the user did)
// ---------------------------------------------------------------------------

/**
 * Events are user interaction signals emitted by the Stage.
 * They follow the signal protocol — same shape as `SignalEnvelope`
 * but with `user.*` types and `source: "stage"`.
 *
 * The host receives these via `sajouBridge.on()` and can either:
 * - Feed them into the choreographer (for visual feedback)
 * - Forward them to the signal bus (for agent consumption)
 * - Both
 */
export interface StageBridgeEvent {
  readonly type: string;
  readonly target?: string;
  readonly entityId?: string;
  readonly position?: BoardPosition;
  readonly zone?: string;
  readonly action?: string;
  readonly timestamp?: number;
  readonly [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Bridge interface: the window.sajouBridge contract
// ---------------------------------------------------------------------------

/**
 * The bridge object exposed on `window.sajouBridge` by the Godot WASM runtime.
 *
 * @example
 * ```ts
 * // Send a command to the Stage
 * window.sajouBridge.send({ type: "spawn_entity", entity: { id: "a1", position: { x: 0, y: 0 } } });
 *
 * // Listen for user interaction events
 * window.sajouBridge.on((event) => {
 *   console.log(event.type, event.target);
 * });
 * ```
 */
export interface SajouBridge {
  /** Whether the bridge has been initialized by Godot. */
  readonly _ready: boolean;

  /** Send a command to the Stage (JS → Godot). */
  send(command: StageBridgeCommand): void;

  /** Register a listener for Stage events (Godot → JS). */
  on(listener: (event: StageBridgeEvent) => void): SajouBridge;

  /** Remove a previously registered listener. */
  off(listener: (event: StageBridgeEvent) => void): SajouBridge;

  /** Called by the Stage once the bridge is ready. Assign before Godot loads. */
  onReady?: () => void;
}

// ---------------------------------------------------------------------------
// Global augmentation
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    sajouBridge?: SajouBridge;
    sajouReceiveCommand?: (json: string) => void;
  }
}
