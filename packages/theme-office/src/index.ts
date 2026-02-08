/**
 * @sajou/theme-office — Modern office theme for Sajou using LimeZu pixel art.
 *
 * This is the second theme implementation, proving the architecture works
 * with completely different assets. Same signals, same choreographer,
 * entirely different visual output.
 */

export { officeTheme } from "./office-theme.js";
export { officeManifest } from "./office-manifest.js";
export { PixiCommandSink } from "./renderers/pixi-command-sink.js";
export type { PositionAliasMap, PixiCommandSinkOptions } from "./renderers/pixi-command-sink.js";
export { validateEntityVisuals } from "./renderers/validate-entity-visuals.js";
export type { ValidationResult } from "./renderers/validate-entity-visuals.js";

// Entity visual config — declarative JSON loaded at import time
import _officeEntityVisuals from "./entity-visuals.json" with { type: "json" };
import type { EntityVisualConfig } from "@sajou/schema";

/**
 * Declarative entity visual configuration for the Office theme.
 *
 * Cast is needed because JSON imports widen string literals (e.g.,
 * `"static"` becomes `string`), but the shape is validated by the
 * JSON Schema at test time.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
export const officeEntityVisuals: EntityVisualConfig = _officeEntityVisuals as EntityVisualConfig;
export {
  officeEntities,
  workerEntity,
  emailEntity,
  serverRackEntity,
  managerDeskEntity,
  invoiceEntity,
  crashEntity,
} from "./entities/office-entities.js";
export {
  officeChoreographies,
  taskDispatchChoreography,
  errorChoreography,
  toolCallChoreography,
  tokenUsageChoreography,
} from "./choreographies/office-choreographies.js";
