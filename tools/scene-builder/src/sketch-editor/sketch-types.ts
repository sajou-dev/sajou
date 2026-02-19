/**
 * p5.js editor type definitions.
 *
 * Covers p5 sketches with param annotations, presets,
 * and the editor state model.
 */

// ---------------------------------------------------------------------------
// Param definitions
// ---------------------------------------------------------------------------

/** Control widget type for a sketch param in the editor UI. */
export type SketchParamControl = "slider" | "color" | "toggle" | "xy";

/** Supported param value types. */
export type SketchParamType = "float" | "int" | "bool" | "color" | "vec2";

/** Semantic binding hint for choreographer integration. */
export interface SketchParamBinding {
  /** Semantic role (e.g. "intensity", "position", "scale"). */
  semantic: string;
}

/** A single user-defined param exposed in the editor. */
export interface SketchParamDef {
  /** Param name as used in `p.sajou.xxx`. */
  name: string;
  /** Value type. */
  type: SketchParamType;
  /** UI control widget. */
  control: SketchParamControl;
  /** Current value. Type depends on `type`: number, boolean, or number[]. */
  value: number | boolean | number[];
  /** Default value (reset target). */
  defaultValue: number | boolean | number[];
  /** Minimum for numeric controls. */
  min: number;
  /** Maximum for numeric controls. */
  max: number;
  /** Step increment for sliders. */
  step: number;
  /** Semantic binding for choreographer integration. */
  bind?: SketchParamBinding;
}

// ---------------------------------------------------------------------------
// Sketch definition
// ---------------------------------------------------------------------------

/** Sketch runtime mode. */
export type SketchMode = "p5" | "threejs";

/** A complete sketch definition as stored in the editor. */
export interface SketchDef {
  /** Unique sketch ID. */
  id: string;
  /** Display name. */
  name: string;
  /** JavaScript source code. */
  source: string;
  /** User-defined params parsed from annotations. */
  params: SketchParamDef[];
  /** Canvas width (0 = fit container). */
  width: number;
  /** Canvas height (0 = fit container). */
  height: number;
  /** Runtime mode: p5.js or Three.js. Default: "p5". */
  mode?: SketchMode;
}

// ---------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------

/** Full state for the p5.js editor. */
export interface SketchEditorState {
  /** All sketch definitions. */
  sketches: SketchDef[];
  /** Currently selected sketch ID (null = none). */
  selectedSketchId: string | null;
  /** Whether the sketch is running. */
  playing: boolean;
}
