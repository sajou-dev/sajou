/**
 * Shader uniform annotation parser.
 *
 * Parses GLSL uniform declarations with `// @ui:` annotations to generate
 * editor controls. Annotations follow the format:
 *   `uniform float uSpeed; // @ui: slider, min: 0.0, max: 10.0`
 *
 * Uniforms without annotations get default controls based on their type.
 * Auto-injected uniforms (iTime, iResolution, etc.) are excluded.
 */

import type { ShaderUniformDef, ShaderObjectDef, UniformType, UniformControl } from "./shader-types.js";
import { AUTO_UNIFORMS } from "./shader-defaults.js";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Regex matching `uniform <type> <name>;` with optional trailing comment. */
const UNIFORM_REGEX = /uniform\s+(float|int|bool|vec2|vec3|vec4)\s+(\w+)\s*;(?:\s*\/\/\s*(.*))?/;

/** Regex matching `@ui:` annotation in a comment. */
const UI_ANNOTATION_REGEX = /@ui:\s*(.+)/;

/** Regex matching `// @object: <id>, label: <display name>` on a standalone line. */
const OBJECT_REGEX = /\/\/\s*@object:\s*(\w+)(?:\s*,\s*label:\s*(.+))?/;

/** Regex matching `@bind: <semantic>` within a comment. */
const BIND_REGEX = /@bind:\s*(\w+)/;

/** Result of parsing a shader source for uniforms and object groups. */
export interface ParseResult {
  /** Parsed uniform definitions. */
  uniforms: ShaderUniformDef[];
  /** Virtual objects declared via @object annotations. */
  objects: ShaderObjectDef[];
}

/**
 * Parse all user-defined uniforms and @object groups from GLSL source code.
 * Returns uniform definitions with control/binding metadata, and object groups.
 */
export function parseShaderSource(source: string): ParseResult {
  const uniforms: ShaderUniformDef[] = [];
  const objects: ShaderObjectDef[] = [];
  let currentObjectId: string | undefined;

  const lines = source.split("\n");

  for (const line of lines) {
    // Check for @object annotation (standalone comment, not a uniform line)
    const objectMatch = line.match(OBJECT_REGEX);
    if (objectMatch && !line.match(UNIFORM_REGEX)) {
      const id = objectMatch[1];
      const label = objectMatch[2]?.trim() ?? id;
      objects.push({ id, label });
      currentObjectId = id;
      continue;
    }

    // Check for uniform declaration
    const uniformMatch = line.match(UNIFORM_REGEX);
    if (!uniformMatch) continue;

    const type = uniformMatch[1] as UniformType;
    const name = uniformMatch[2];
    const comment = uniformMatch[3]?.trim() ?? "";

    // Skip auto-injected uniforms
    if (AUTO_UNIFORMS.has(name)) continue;

    // Parse annotation if present
    const annotation = parseAnnotation(comment);
    const control = annotation.control ?? defaultControl(type);
    const min = annotation.min ?? defaultMin(type);
    const max = annotation.max ?? defaultMax(type);
    const step = annotation.step ?? defaultStep(type);
    const defaultValue = defaultValueForType(type, min, max);

    const def: ShaderUniformDef = {
      name,
      type,
      control,
      value: defaultValue,
      defaultValue,
      min,
      max,
      step,
    };

    if (currentObjectId) {
      def.objectId = currentObjectId;
    }

    if (annotation.bind) {
      def.bind = { semantic: annotation.bind };
    }

    uniforms.push(def);
  }

  return { uniforms, objects };
}

/**
 * Parse all user-defined uniforms from GLSL source code.
 * Returns uniform definitions with control metadata.
 *
 * @deprecated Use `parseShaderSource()` for full object/binding support.
 */
export function parseUniforms(source: string): ShaderUniformDef[] {
  return parseShaderSource(source).uniforms;
}

// ---------------------------------------------------------------------------
// Annotation parsing
// ---------------------------------------------------------------------------

interface ParsedAnnotation {
  control?: UniformControl;
  min?: number;
  max?: number;
  step?: number;
  bind?: string;
}

/** Parse `@ui: ...` and `@bind: ...` annotations from a comment string. */
function parseAnnotation(comment: string): ParsedAnnotation {
  const result: ParsedAnnotation = {};

  // Extract @bind semantic
  const bindMatch = comment.match(BIND_REGEX);
  if (bindMatch) {
    result.bind = bindMatch[1];
  }

  // Extract @ui controls
  const uiMatch = comment.match(UI_ANNOTATION_REGEX);
  if (!uiMatch) return result;

  // The @ui match may include `@bind:` at the end — strip everything from the next `@` onward
  const uiContent = uiMatch[1].replace(/@\w+:.*$/, "").trim();
  const parts = uiContent.split(",").map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx < 0) {
      // Bare keyword — treat as control type
      const lower = part.toLowerCase();
      if (lower === "slider" || lower === "color" || lower === "toggle" || lower === "xy") {
        result.control = lower as UniformControl;
      }
      continue;
    }

    const key = part.slice(0, colonIdx).trim().toLowerCase();
    const val = part.slice(colonIdx + 1).trim();

    switch (key) {
      case "min": result.min = parseFloat(val); break;
      case "max": result.max = parseFloat(val); break;
      case "step": result.step = parseFloat(val); break;
      case "control": {
        const lower = val.toLowerCase();
        if (lower === "slider" || lower === "color" || lower === "toggle" || lower === "xy") {
          result.control = lower as UniformControl;
        }
        break;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Defaults by type
// ---------------------------------------------------------------------------

function defaultControl(type: UniformType): UniformControl {
  switch (type) {
    case "float":
    case "int":
      return "slider";
    case "vec3":
      return "color";
    case "bool":
      return "toggle";
    case "vec2":
      return "xy";
    case "vec4":
      return "slider"; // fallback
  }
}

function defaultMin(type: UniformType): number {
  switch (type) {
    case "int": return 0;
    default: return 0.0;
  }
}

function defaultMax(type: UniformType): number {
  switch (type) {
    case "int": return 10;
    default: return 1.0;
  }
}

function defaultStep(type: UniformType): number {
  switch (type) {
    case "int": return 1;
    default: return 0.01;
  }
}

function defaultValueForType(type: UniformType, min: number, max: number): number | boolean | number[] {
  switch (type) {
    case "float":
      return (min + max) / 2;
    case "int":
      return Math.floor((min + max) / 2);
    case "bool":
      return false;
    case "vec2":
      return [0.5, 0.5];
    case "vec3":
      return [1.0, 1.0, 1.0]; // white for color picker
    case "vec4":
      return [1.0, 1.0, 1.0, 1.0];
  }
}
