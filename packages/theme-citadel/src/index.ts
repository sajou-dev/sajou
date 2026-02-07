/**
 * @sajou/theme-citadel — WC3-inspired medieval fantasy theme for Sajou.
 *
 * This is the reference theme implementation. It demonstrates how to:
 * - Define entities declaratively (peon, pigeon, forge, oracle, effects)
 * - Declare a scene layout with named positions
 * - Implement the ThemeContract from @sajou/theme-api
 * - Provide a renderer for choreographer primitives
 */

export { citadelTheme } from "./citadel-theme.js";
export { citadelManifest } from "./citadel-manifest.js";
export { PixiCommandSink } from "./renderers/pixi-command-sink.js";
export type { PositionAliasMap, PixiCommandSinkOptions } from "./renderers/pixi-command-sink.js";
export { validateEntityVisuals } from "./renderers/validate-entity-visuals.js";
export type { ValidationResult } from "./renderers/validate-entity-visuals.js";

// Entity visual config — declarative JSON loaded at import time
import _citadelEntityVisuals from "./entity-visuals.json" with { type: "json" };
import type { EntityVisualConfig } from "@sajou/schema";

/**
 * Declarative entity visual configuration for the Citadel theme.
 *
 * Cast is needed because JSON imports widen string literals (e.g.,
 * `"static"` becomes `string`), but the shape is validated by the
 * JSON Schema at test time.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
export const citadelEntityVisuals: EntityVisualConfig = _citadelEntityVisuals as EntityVisualConfig;
export {
  citadelEntities,
  peonEntity,
  pigeonEntity,
  forgeEntity,
  oracleEntity,
  goldCoinsEntity,
  explosionEntity,
} from "./entities/citadel-entities.js";
export {
  citadelChoreographies,
  taskDispatchChoreography,
  errorChoreography,
  toolCallChoreography,
  tokenUsageChoreography,
} from "./choreographies/citadel-choreographies.js";
