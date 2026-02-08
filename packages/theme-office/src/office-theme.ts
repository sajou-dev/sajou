/**
 * Office theme entry point — implements the ThemeContract.
 *
 * For V1, the renderer is a stub that will be replaced with a real
 * rendering implementation (PixiJS) once the choreographer runtime
 * drives it via the dev playground.
 */

import type {
  ThemeContract,
  ThemeRenderer,
  RendererOptions,
  EntityHandle,
  Position,
} from "@sajou/theme-api";
import { officeManifest } from "./office-manifest.js";

/**
 * Stub renderer for early development.
 *
 * Implements the ThemeRenderer interface with no-op methods.
 * This allows the choreographer to be developed and tested against
 * the Office theme before the visual rendering is ready.
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
      const definition = officeManifest.entities[entityId];
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
 * The Office theme — modern workplace with LimeZu pixel art.
 *
 * Agents are workers. Tools are server racks. Signals travel by email.
 * Token costs appear as invoices. Errors crash the screen.
 */
export const officeTheme: ThemeContract = {
  manifest: officeManifest,
  createRenderer(options: RendererOptions): ThemeRenderer {
    return createStubRenderer(options);
  },
};
