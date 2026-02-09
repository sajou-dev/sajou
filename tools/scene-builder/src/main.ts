/**
 * Entry point for the Sajou Scene Builder.
 */

import { initWorkspace } from "./workspace/workspace.js";

initWorkspace().catch((err) => {
  console.error("[scene-builder] Failed to initialize:", err);
});
