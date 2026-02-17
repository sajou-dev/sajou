/**
 * Shader editor type definitions.
 *
 * Covers GLSL shaders with uniform annotations, multi-pass support,
 * and the editor state model.
 */

// ---------------------------------------------------------------------------
// Uniform definitions
// ---------------------------------------------------------------------------

/** Control widget type for a shader uniform in the editor UI. */
export type UniformControl = "slider" | "color" | "toggle" | "xy";

/** GLSL uniform types supported by the editor. */
export type UniformType = "float" | "int" | "bool" | "vec2" | "vec3" | "vec4";

/** Semantic binding hint for choreographer integration. */
export interface UniformBinding {
  /** Semantic role (e.g. "position", "scale", "rotation", "intensity"). */
  semantic: string;
}

/** A group of uniforms representing a virtual object in the shader. */
export interface ShaderObjectDef {
  /** Object identifier (e.g. "sphere", "camera"). */
  id: string;
  /** Display label for the UI panel. */
  label: string;
}

/** A single user-defined uniform exposed in the editor. */
export interface ShaderUniformDef {
  /** Uniform name as declared in GLSL source (e.g. "uSpeed"). */
  name: string;
  /** GLSL type. */
  type: UniformType;
  /** UI control widget. */
  control: UniformControl;
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
  /** Object this uniform belongs to (undefined = ungrouped). */
  objectId?: string;
  /** Semantic binding for choreographer integration. */
  bind?: UniformBinding;
}

// ---------------------------------------------------------------------------
// Shader definition
// ---------------------------------------------------------------------------

/** Shader authoring mode. */
export type ShaderMode = "glsl";

/** A complete shader definition as stored in the editor. */
export interface ShaderDef {
  /** Unique shader ID. */
  id: string;
  /** Display name. */
  name: string;
  /** Authoring mode. */
  mode: ShaderMode;
  /** Vertex shader GLSL source. */
  vertexSource: string;
  /** Fragment shader GLSL source. */
  fragmentSource: string;
  /** User-defined uniforms (excludes auto-injected iTime etc.). */
  uniforms: ShaderUniformDef[];
  /** Virtual objects declared via @object annotations. */
  objects: ShaderObjectDef[];
  /** Number of render passes (1 = single-pass, 2+ = ping-pong feedback). */
  passes: number;
  /** Buffer resolution for feedback passes (0 = match canvas). */
  bufferResolution: number;
}

// ---------------------------------------------------------------------------
// Editor state
// ---------------------------------------------------------------------------

/** Full state for the shader editor. */
export interface ShaderEditorState {
  /** All shader definitions. */
  shaders: ShaderDef[];
  /** Currently selected shader ID (null = none). */
  selectedShaderId: string | null;
  /** Active authoring mode. */
  activeMode: ShaderMode;
  /** Whether the preview animation loop is running. */
  playing: boolean;
}
