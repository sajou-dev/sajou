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
export {
  citadelEntities,
  peonEntity,
  pigeonEntity,
  forgeEntity,
  oracleEntity,
  goldCoinsEntity,
  explosionEntity,
} from "./entities/citadel-entities.js";
