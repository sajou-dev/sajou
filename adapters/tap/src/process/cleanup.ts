/**
 * Shutdown handlers — ensures adapters and transports are cleaned up
 * on SIGINT, SIGTERM, and normal exit.
 */

import type { TapAdapter } from "../adapters/types.js";
import type { TapTransport } from "../client/transport.js";
import type { ProcessHandle } from "./process-wrapper.js";

/** Resources to clean up on shutdown. */
export interface CleanupResources {
  adapter?: TapAdapter;
  transport?: TapTransport;
  process?: ProcessHandle;
}

/**
 * Installs shutdown handlers that clean up resources on exit.
 *
 * Handles SIGINT, SIGTERM, and beforeExit.
 */
export function installCleanupHandlers(resources: CleanupResources): void {
  let cleaning = false;

  const cleanup = async (): Promise<void> => {
    if (cleaning) return;
    cleaning = true;

    try {
      resources.process?.kill();
      await resources.adapter?.stop();
      await resources.transport?.close();
    } catch {
      // Best-effort cleanup
    }
  };

  const syncCleanup = (): void => {
    cleanup().catch(() => {});
  };

  process.on("SIGINT", () => {
    syncCleanup();
    // Allow the default SIGINT behavior after cleanup
    setTimeout(() => process.exit(130), 200);
  });

  process.on("SIGTERM", () => {
    syncCleanup();
    setTimeout(() => process.exit(143), 200);
  });

  process.on("beforeExit", syncCleanup);
}
