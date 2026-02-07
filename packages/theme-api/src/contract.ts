/**
 * The ThemeContract — the root interface that every Sajou theme must implement.
 *
 * A theme is a complete visual scene: entities, layout, sounds, renderers.
 * The ThemeContract is the single entry point that the choreographer uses
 * to interact with a theme.
 *
 * Signal → Choreographer → ThemeContract.createRenderer() → visual output
 */

import type { ThemeManifest } from "./manifest.js";
import type { ThemeRenderer } from "./renderer.js";

// ---------------------------------------------------------------------------
// Renderer factory options
// ---------------------------------------------------------------------------

/**
 * Options passed to `createRenderer` when the theme initializes its
 * rendering context.
 */
export interface RendererOptions {
  /**
   * The DOM container element where the theme should render.
   * The theme owns this element and can create canvases, SVGs, etc. inside it.
   *
   * Typed as `unknown` to keep @sajou/theme-api framework-agnostic.
   * Theme implementations cast this to their expected type (HTMLElement, etc.).
   */
  readonly container: unknown;
  /** Scene width in CSS pixels. */
  readonly width: number;
  /** Scene height in CSS pixels. */
  readonly height: number;
}

// ---------------------------------------------------------------------------
// Theme contract
// ---------------------------------------------------------------------------

/**
 * The contract that every Sajou theme must implement.
 *
 * The choreographer uses this interface to:
 * 1. Read the manifest (what entities exist, what layout, what capabilities)
 * 2. Create a renderer (the live rendering context for executing primitives)
 *
 * @example
 * ```ts
 * // In a theme package:
 * export const citadelTheme: ThemeContract = {
 *   manifest: citadelManifest,
 *   createRenderer(options) {
 *     return new CitadelRenderer(options);
 *   },
 * };
 * ```
 */
export interface ThemeContract {
  /** The theme's declarative manifest — entities, layout, capabilities. */
  readonly manifest: ThemeManifest;

  /**
   * Create a new renderer instance bound to a DOM container.
   *
   * Called once when the theme is activated. The returned renderer
   * must be initialized via `renderer.init()` before use.
   */
  createRenderer(options: RendererOptions): ThemeRenderer;
}
