/**
 * @sajou/theme-api — Theme contract interfaces for Sajou.
 *
 * This package defines the contract that all Sajou themes must implement.
 * It is framework-agnostic: no rendering dependencies, no DOM specifics.
 *
 * A theme provides:
 * - A manifest (JSON) declaring entities, layout, capabilities
 * - A renderer factory that creates the live rendering context
 * - Renderer methods for each choreographer primitive (move, spawn, flash, etc.)
 */

// Contract
export type { ThemeContract, RendererOptions } from "./contract.js";

// Manifest
export type {
  ThemeManifest,
  ThemeCapabilities,
  ThemeLayout,
  AssetManifest,
} from "./manifest.js";

// Renderer
export type {
  ThemeRenderer,
  EntityHandle,
  Position,
  BeamStyle,
} from "./renderer.js";

// Entity format
export type {
  EntityDefinition,
  EntityDefaults,
  EntityVisual,
  VisualType,
  SpriteVisual,
  SpritesheetVisual,
  SpriteAnimation,
  Model3dVisual,
  ModelAnimation,
  ParticleVisual,
  ParticleEmitterConfig,
} from "./entity.js";
