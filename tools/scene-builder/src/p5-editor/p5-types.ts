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
export type P5ParamControl = "slider" | "color" | "toggle" | "xy";

/** Supported param value types. */
export type P5ParamType = "float" | "int" | "bool" | "color" | "vec2";

/** Semantic binding hint for choreographer integration. */
export interface P5ParamBinding {
  /** Semantic role (e.g. "intensity", "position", "scale"). */
  semantic: string;
}

/** A single user-defined param exposed in the editor. */
export interface P5ParamDef {
  /** Param name as used in `p.sajou.xxx`. */
  name: string;
  /** Value type. */
  type: P5ParamType;
  /** UI control widget. */
  control: P5ParamControl;
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
  bind?: P5ParamBinding;
}

// ---------------------------------------------------------------------------
// Sketch definition
// ---------------------------------------------------------------------------

/** A complete p5.js sketch definition as stored in the editor. */
export interface P5SketchDef {
  /** Unique sketch ID. */
  id: string;
  /** Display name. */
  name: string;
  /** JavaScript source code (p5 instance mode). */
  source: string;
  /** User-defined params parsed from annotations. */
  params: P5ParamDef[];
  /** Canvas width (0 = fit container). */
  width: number;
  /** Canvas height (0 = fit container). */
  height: number;
}

// ---------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------

/** Full state for the p5.js editor. */
export interface P5EditorState {
  /** All sketch definitions. */
  sketches: P5SketchDef[];
  /** Currently selected sketch ID (null = none). */
  selectedSketchId: string | null;
  /** Whether the sketch is running. */
  playing: boolean;
}
