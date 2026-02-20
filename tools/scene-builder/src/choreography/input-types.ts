/**
 * ISF-inspired input type definitions.
 *
 * Each choreography action declares its inputs with typed declarations.
 * The UI auto-generates controls based on these types.
 *
 * Type catalogue:
 *   float, int    → slider + number field
 *   bool          → toggle switch
 *   string        → text input
 *   enum          → dropdown
 *   point2D       → x/y fields
 *   color         → swatch + color picker
 *   duration      → slider ms + bar
 *   easing        → dropdown + curve preview
 *   entity-ref    → dropdown from scene entities
 *   position-ref  → dropdown from scene positions
 *   angle         → rotary knob (simplified to slider)
 *   json          → raw JSON editor (fallback)
 */

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** All supported ISF input types. */
export type InputType =
  | "float"
  | "int"
  | "bool"
  | "string"
  | "enum"
  | "point2D"
  | "color"
  | "duration"
  | "easing"
  | "entity-ref"
  | "position-ref"
  | "route-ref"
  | "waypoint-ref"
  | "angle"
  | "json";

// ---------------------------------------------------------------------------
// Input declarations
// ---------------------------------------------------------------------------

/** Base declaration shared by all input types. */
interface InputDeclBase {
  /** Unique key in the step params (e.g., "to", "color", "duration"). */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Optional hint text below the control. */
  hint?: string;
  /** Whether this input is required. Default: false. */
  required?: boolean;
}

/** Float input: continuous number with optional range. */
export interface FloatInputDecl extends InputDeclBase {
  type: "float";
  min?: number;
  max?: number;
  step?: number;
  default?: number;
}

/** Integer input: discrete number with optional range. */
export interface IntInputDecl extends InputDeclBase {
  type: "int";
  min?: number;
  max?: number;
  default?: number;
}

/** Boolean input: on/off toggle. */
export interface BoolInputDecl extends InputDeclBase {
  type: "bool";
  default?: boolean;
}

/** String input: free text. */
export interface StringInputDecl extends InputDeclBase {
  type: "string";
  placeholder?: string;
  default?: string;
}

/** Enum input: dropdown from fixed choices. */
export interface EnumInputDecl extends InputDeclBase {
  type: "enum";
  options: Array<{ value: string; label: string }>;
  default?: string;
}

/** 2D point input: x/y coordinate pair. */
export interface Point2DInputDecl extends InputDeclBase {
  type: "point2D";
  default?: { x: number; y: number };
}

/** Color input: hex color picker. */
export interface ColorInputDecl extends InputDeclBase {
  type: "color";
  default?: string;
}

/** Duration input: milliseconds slider. */
export interface DurationInputDecl extends InputDeclBase {
  type: "duration";
  min?: number;
  max?: number;
  default?: number;
}

/** Easing input: easing function dropdown. */
export interface EasingInputDecl extends InputDeclBase {
  type: "easing";
  default?: string;
}

/** Entity reference: dropdown populated from scene entities. */
export interface EntityRefInputDecl extends InputDeclBase {
  type: "entity-ref";
  /** If true, also accept signal.* references (dynamic binding). */
  allowSignalRef?: boolean;
  placeholder?: string;
  default?: string;
}

/** Position reference: dropdown populated from scene positions. */
export interface PositionRefInputDecl extends InputDeclBase {
  type: "position-ref";
  /** If true, also accept signal.* references (dynamic binding). */
  allowSignalRef?: boolean;
  placeholder?: string;
  default?: string;
}

/** Route reference: dropdown populated from scene routes. */
export interface RouteRefInputDecl extends InputDeclBase {
  type: "route-ref";
  placeholder?: string;
  default?: string;
}

/** Waypoint reference: dropdown populated from named route waypoints. */
export interface WaypointRefInputDecl extends InputDeclBase {
  type: "waypoint-ref";
  placeholder?: string;
  default?: string;
}

/** Angle input: degrees (0–360). */
export interface AngleInputDecl extends InputDeclBase {
  type: "angle";
  default?: number;
}

/** Raw JSON input: fallback for unknown param types. */
export interface JsonInputDecl extends InputDeclBase {
  type: "json";
  default?: unknown;
}

/** Discriminated union of all input declarations. */
export type InputDeclaration =
  | FloatInputDecl
  | IntInputDecl
  | BoolInputDecl
  | StringInputDecl
  | EnumInputDecl
  | Point2DInputDecl
  | ColorInputDecl
  | DurationInputDecl
  | EasingInputDecl
  | EntityRefInputDecl
  | PositionRefInputDecl
  | RouteRefInputDecl
  | WaypointRefInputDecl
  | AngleInputDecl
  | JsonInputDecl;

// ---------------------------------------------------------------------------
// Action input schema
// ---------------------------------------------------------------------------

/**
 * Schema for a choreography action's inputs.
 * Each action declares which inputs it uses.
 */
export interface ActionInputSchema {
  /** The action name (e.g., "move", "spawn"). */
  action: string;
  /** Common fields that always appear (entity, duration, easing). */
  common: InputDeclaration[];
  /** Action-specific parameter inputs. */
  params: InputDeclaration[];
}
