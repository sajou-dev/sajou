/**
 * Theme manifest types for Sajou.
 *
 * A theme manifest is the JSON declaration that describes everything a theme
 * provides: its identity, capabilities, entities, layout, and asset locations.
 *
 * The manifest is loaded before the renderer is created. The choreographer
 * inspects it to know what entities are available and what the theme supports.
 */

import type { EntityDefinition, VisualType } from "./entity.js";

// ---------------------------------------------------------------------------
// Theme capabilities
// ---------------------------------------------------------------------------

/**
 * Declares what a theme can render.
 * Used by the choreographer to validate choreographies against theme support.
 */
export interface ThemeCapabilities {
  /** Visual types this theme's renderer supports. */
  readonly visualTypes: readonly VisualType[];
  /** Whether the theme supports sound playback. */
  readonly sound: boolean;
  /** Whether the theme supports 3D perspective (vs flat 2D). */
  readonly perspective: boolean;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * Defines named positions in the scene that choreographies can reference.
 *
 * Instead of hardcoding pixel coordinates, choreographies use semantic names
 * like "forge", "oracle", "center". The theme's layout maps these to positions.
 *
 * @example
 * ```json
 * {
 *   "positions": {
 *     "forge": { "x": 100, "y": 300 },
 *     "oracle": { "x": 500, "y": 100 },
 *     "center": { "x": 300, "y": 200 }
 *   },
 *   "sceneWidth": 800,
 *   "sceneHeight": 600
 * }
 * ```
 */
export interface ThemeLayout {
  /** Named positions in the scene. Keys are semantic names used in choreographies. */
  readonly positions: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
  /** Scene width in logical units (not necessarily pixels). */
  readonly sceneWidth: number;
  /** Scene height in logical units. */
  readonly sceneHeight: number;
}

// ---------------------------------------------------------------------------
// Asset manifest
// ---------------------------------------------------------------------------

/**
 * Declares the asset root and preload list for the theme.
 * Assets are loaded before the renderer initializes.
 */
export interface AssetManifest {
  /** Base path for all asset references in entity definitions. */
  readonly basePath: string;
  /**
   * Assets to preload before the theme is ready.
   * Paths are relative to `basePath`.
   */
  readonly preload: readonly string[];
}

// ---------------------------------------------------------------------------
// Theme manifest — the root declaration
// ---------------------------------------------------------------------------

/**
 * The complete theme manifest — loaded from JSON, describes everything
 * the theme provides.
 *
 * @example
 * ```json
 * {
 *   "id": "citadel",
 *   "name": "Citadelle",
 *   "version": "0.1.0",
 *   "description": "WC3-inspired medieval fantasy theme",
 *   "capabilities": {
 *     "visualTypes": ["sprite", "spritesheet"],
 *     "sound": true,
 *     "perspective": false
 *   },
 *   "entities": { ... },
 *   "layout": { ... },
 *   "assets": { ... }
 * }
 * ```
 */
export interface ThemeManifest {
  /** Unique theme identifier. */
  readonly id: string;
  /** Human-readable theme name. */
  readonly name: string;
  /** Semantic version. */
  readonly version: string;
  /** Theme description — displayed in UI and used as LLM context. */
  readonly description: string;
  /** What this theme can render. */
  readonly capabilities: ThemeCapabilities;
  /** Entity definitions keyed by entity ID. */
  readonly entities: Readonly<Record<string, EntityDefinition>>;
  /** Scene layout with named positions. */
  readonly layout: ThemeLayout;
  /** Asset loading configuration. */
  readonly assets: AssetManifest;
}
