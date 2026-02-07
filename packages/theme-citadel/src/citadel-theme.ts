/**
 * Citadel theme entry point — implements the ThemeContract.
 *
 * For V1, the renderer is a stub that will be replaced with a real
 * rendering implementation (PixiJS or Canvas2D) once the choreographer
 * runtime is ready to drive it.
 */

import type {
  ThemeContract,
  ThemeRenderer,
  RendererOptions,
  EntityHandle,
  Position,
} from "@sajou/theme-api";
import { citadelManifest } from "./citadel-manifest.js";

/**
 * Stub renderer for early development.
 *
 * Implements the ThemeRenderer interface with no-op methods.
 * This allows the choreographer to be developed and tested against
 * the Citadel theme before the visual rendering is ready.
 */
function createStubRenderer(_options: RendererOptions): ThemeRenderer {
  let nextInstanceId = 0;
  const resolvedPromise = Promise.resolve();

  return {
    init: () => resolvedPromise,
    dispose() { /* noop */ },
    tick() { /* noop */ },

    spawnEntity(entityId: string, _position: Position, instanceId?: string): EntityHandle {
      const id = instanceId ?? `${entityId}-${String(nextInstanceId++)}`;
      const definition = citadelManifest.entities[entityId];
      if (!definition) {
        throw new Error(`Unknown entity: ${entityId}`);
      }
      return { instanceId: id, definition };
    },

    destroyEntity() { /* noop */ },
    move: () => resolvedPromise,
    fly: () => resolvedPromise,
    flash: () => resolvedPromise,
    pulse: () => resolvedPromise,
    drawBeam: () => resolvedPromise,
    typeText: () => resolvedPromise,
    playSound() { /* noop */ },
    setAnimation() { /* noop */ },
  };
}

/**
 * The Citadel theme — WC3-inspired medieval fantasy.
 *
 * Agents are peons. Tools are buildings. Signals travel by pigeon.
 * Token costs rain as gold coins. Errors explode in red.
 */
export const citadelTheme: ThemeContract = {
  manifest: citadelManifest,
  createRenderer(options: RendererOptions): ThemeRenderer {
    return createStubRenderer(options);
  },
};
