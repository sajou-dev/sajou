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

import type { ShaderUniformDef, UniformType, UniformControl } from "./shader-types.js";
import { AUTO_UNIFORMS } from "./shader-defaults.js";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Regex matching `uniform <type> <name>;` with optional trailing comment. */
const UNIFORM_REGEX = /uniform\s+(float|int|bool|vec2|vec3|vec4)\s+(\w+)\s*;(?:\s*\/\/\s*(.*))?/g;

/** Regex matching `@ui:` annotation in a comment. */
const UI_ANNOTATION_REGEX = /@ui:\s*(.+)/;

/**
 * Parse all user-defined uniforms from GLSL source code.
 * Returns uniform definitions with control metadata.
 */
export function parseUniforms(source: string): ShaderUniformDef[] {
  const results: ShaderUniformDef[] = [];

  let match: RegExpExecArray | null;
  // Reset lastIndex for global regex
  UNIFORM_REGEX.lastIndex = 0;

  while ((match = UNIFORM_REGEX.exec(source)) !== null) {
    const type = match[1] as UniformType;
    const name = match[2];
    const comment = match[3]?.trim() ?? "";

    // Skip auto-injected uniforms
    if (AUTO_UNIFORMS.has(name)) continue;

    // Parse annotation if present
    const annotation = parseAnnotation(comment);
    const control = annotation.control ?? defaultControl(type);
    const min = annotation.min ?? defaultMin(type);
    const max = annotation.max ?? defaultMax(type);
    const step = annotation.step ?? defaultStep(type);
    const defaultValue = defaultValueForType(type, min, max);

    results.push({
      name,
      type,
      control,
      value: defaultValue,
      defaultValue,
      min,
      max,
      step,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Annotation parsing
// ---------------------------------------------------------------------------

interface ParsedAnnotation {
  control?: UniformControl;
  min?: number;
  max?: number;
  step?: number;
}

/** Parse a `@ui: ...` annotation from a comment string. */
function parseAnnotation(comment: string): ParsedAnnotation {
  const uiMatch = comment.match(UI_ANNOTATION_REGEX);
  if (!uiMatch) return {};

  const parts = uiMatch[1].split(",").map((s) => s.trim());
  const result: ParsedAnnotation = {};

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
