/**
 * StageRenderer — the main Three.js isometric board.
 *
 * Implements CommandSink from @sajou/core. The choreographer drives visuals
 * by calling onActionStart/onActionUpdate/onActionComplete/onActionExecute.
 * No bridge needed — direct TypeScript calls.
 */

import * as THREE from "three";
import type {
  CommandSink,
  ActionStartCommand,
  ActionUpdateCommand,
  ActionCompleteCommand,
  ActionExecuteCommand,
  InterruptCommand,
} from "@sajou/core";
import {
  createIsometricCamera,
  computeBillboardAngle,
  resizeCamera,
} from "./isometric-camera.js";
import { EntityManager } from "./entity-manager.js";
import { LightManager } from "./light-manager.js";
import { InputHandler } from "./input-handler.js";
import type { InteractionCallback } from "./types.js";

/** Configuration for the Stage renderer. */
export interface StageRendererOptions {
  /** Canvas element to render into. */
  readonly canvas: HTMLCanvasElement;
  /** Initial viewport width in pixels. */
  readonly width: number;
  /** Initial viewport height in pixels. */
  readonly height: number;
  /** Vertical view span in world units. Default: 20. */
  readonly viewSize?: number;
  /** Scene background color. Default: 0x1a1a2e. */
  readonly backgroundColor?: number;
}

/**
 * The Stage renderer — a Three.js isometric board implementing CommandSink.
 *
 * The choreographer calls CommandSink methods to drive entity spawning,
 * movement, destruction, and other visual actions. The Stage renders
 * the scene with an OrthographicCamera and dynamic lighting.
 *
 * @example
 * ```ts
 * const stage = new StageRenderer({ canvas, width: 800, height: 600 });
 * const choreographer = new Choreographer({ clock, sink: stage });
 * stage.start();
 * ```
 */
export class StageRenderer implements CommandSink {
  private readonly webGLRenderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly entityManager: EntityManager;
  private readonly lightManager: LightManager;
  private readonly inputHandler: InputHandler;
  private readonly viewSize: number;
  private animFrameId: number | null = null;

  constructor(options: StageRendererOptions) {
    const {
      canvas,
      width,
      height,
      viewSize = 20,
      backgroundColor = 0x1a1a2e,
    } = options;

    this.viewSize = viewSize;

    // WebGL renderer — no antialiasing for pixel art
    this.webGLRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
    });
    this.webGLRenderer.setSize(width, height);
    this.webGLRenderer.setPixelRatio(window.devicePixelRatio);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(backgroundColor);

    // Isometric camera
    this.camera = createIsometricCamera({ width, height, viewSize });
    const billboardAngle = computeBillboardAngle(this.camera);

    // Ground reference grid
    this.createGround();

    // Sub-managers
    this.entityManager = new EntityManager(this.scene, billboardAngle);
    this.lightManager = new LightManager(this.scene);
    this.inputHandler = new InputHandler(
      canvas,
      this.camera,
      this.entityManager,
    );
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Start the render loop. */
  start(): void {
    if (this.animFrameId !== null) return;

    const loop = (): void => {
      this.animFrameId = requestAnimationFrame(loop);
      this.webGLRenderer.render(this.scene, this.camera);
    };
    loop();
  }

  /** Stop the render loop. */
  stop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /** Resize the renderer and camera to match a new viewport. */
  resize(width: number, height: number): void {
    this.webGLRenderer.setSize(width, height);
    resizeCamera(this.camera, width, height, this.viewSize);
  }

  /** Register a callback for user interactions (click entity, point ground). */
  onInteraction(callback: InteractionCallback): void {
    this.inputHandler.on(callback);
  }

  /** Get the entity manager (for testing or advanced usage). */
  getEntityManager(): EntityManager {
    return this.entityManager;
  }

  /** Get the light manager. */
  getLightManager(): LightManager {
    return this.lightManager;
  }

  /** Get the Three.js scene. */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /** Clean up all resources. */
  dispose(): void {
    this.stop();
    this.inputHandler.dispose();
    this.entityManager.dispose();
    this.lightManager.dispose();
    this.webGLRenderer.dispose();
  }

  // -------------------------------------------------------------------------
  // CommandSink implementation
  // -------------------------------------------------------------------------

  /** Handle an animated action starting (e.g., "move"). */
  onActionStart(command: ActionStartCommand): void {
    switch (command.action) {
      case "move": {
        const to = this.resolvePosition(command.params["to"]);
        if (to) {
          this.entityManager.startMove(command.entityRef, to.x, to.z);
        }
        break;
      }
    }
  }

  /** Handle a frame update for an animated action. */
  onActionUpdate(command: ActionUpdateCommand): void {
    switch (command.action) {
      case "move":
        this.entityManager.updateMove(command.entityRef, command.progress);
        break;
    }
  }

  /** Handle an animated action completing normally. */
  onActionComplete(command: ActionCompleteCommand): void {
    switch (command.action) {
      case "move":
        this.entityManager.completeMove(command.entityRef);
        break;
    }
  }

  /** Handle an instant action (spawn, destroy, etc.). */
  onActionExecute(command: ActionExecuteCommand): void {
    switch (command.action) {
      case "spawn": {
        const pos = this.resolvePosition(command.params["position"]) ?? {
          x: 0,
          z: 0,
        };
        const color = command.params["color"] as number | undefined;
        this.entityManager.spawn({
          id: command.entityRef,
          x: pos.x,
          z: pos.z,
          color,
        });
        break;
      }
      case "destroy":
        this.entityManager.remove(command.entityRef);
        break;
    }
  }

  /** Handle a performance interruption. */
  onInterrupt(_command: InterruptCommand): void {
    // Prototype: in-progress tweens complete naturally.
    // A full implementation would cancel active tweens and snap positions.
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /**
   * Resolve a param value to world coordinates { x, z }.
   * Board { x, y } maps to world { x, z } (Y-up in Three.js).
   */
  private resolvePosition(
    value: unknown,
  ): { x: number; z: number } | undefined {
    if (!value || typeof value !== "object") return undefined;
    const obj = value as Record<string, unknown>;
    const x = typeof obj["x"] === "number" ? obj["x"] : undefined;
    const y = typeof obj["y"] === "number" ? obj["y"] : undefined;
    if (x === undefined || y === undefined) return undefined;
    return { x, z: y };
  }

  /** Create a ground grid and solid plane for visual reference. */
  private createGround(): void {
    const size = 20;
    const divisions = 20;
    const grid = new THREE.GridHelper(size, divisions, 0x444466, 0x333355);
    this.scene.add(grid);

    const groundGeom = new THREE.PlaneGeometry(size, size);
    groundGeom.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a3e,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.position.y = -0.01; // avoid z-fighting with grid
    this.scene.add(ground);
  }
}
