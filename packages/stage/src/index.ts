/**
 * @sajou/stage — Three.js isometric board renderer.
 *
 * Implements CommandSink from @sajou/core. The choreographer calls
 * the Stage renderer directly — no bridge, no IPC, pure TypeScript.
 */

// Classes
export { StageRenderer } from "./stage-renderer.js";
export { EntityManager } from "./entity-manager.js";
export { LightManager } from "./light-manager.js";
export { InputHandler } from "./input-handler.js";
export { FrameAnimator } from "./frame-animator.js";

// Camera utilities
export {
  createIsometricCamera,
  createTopDownCamera,
  computeBillboardAngle,
  resizeCamera,
  resizeTopDownCamera,
} from "./isometric-camera.js";

// Sprite mesh factory
export { createSpriteMesh, setUVFrame } from "./sprite-mesh.js";

// Texture loading
export {
  loadTexture,
  getCachedTexture,
  getCachedTextureSize,
  clearTextureCache,
} from "./texture-loader.js";

// Types (re-export)
export type { StageRendererOptions } from "./stage-renderer.js";
export type { SpawnOptions } from "./entity-manager.js";
export type { LightConfig, PointLightUpdate } from "./light-manager.js";
export type {
  IsometricCameraOptions,
} from "./isometric-camera.js";
export type { SpriteMeshOptions } from "./sprite-mesh.js";
export type { FrameDef, AnimationState } from "./frame-animator.js";
export type {
  EntityRecord,
  MoveTween,
  InteractionEvent,
  InteractionCallback,
} from "./types.js";
