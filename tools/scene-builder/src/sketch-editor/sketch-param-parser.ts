/**
 * p5.js param annotation parser.
 *
 * Parses JavaScript comment annotations to generate editor controls.
 * Annotations follow the format:
 *   `// @param: speed, slider, min: 0.1, max: 5.0`
 *   `// @param: color, color`
 *   `// @param: enable, toggle`
 *   `// @param: center, xy, min: 0.0, max: 1.0`
 *
 * Optional bind annotation on the same or next line:
 *   `// @bind: intensity`
 *
 * Params without annotations are not detected — only annotated params
 * are exposed in the editor.
 */

import type { SketchParamDef, SketchParamType, SketchParamControl } from "./sketch-types.js";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Regex matching `// @param: name, control [, key: value, ...]`. */
const PARAM_REGEX = /\/\/\s*@param:\s*(.+)/;

/** Regex matching `// @bind: <semantic>` on a standalone line. */
const BIND_REGEX = /\/\/\s*@bind:\s*(\w+)/;

/** Regex matching `@bind: <semantic>` inline (without requiring leading //). */
const BIND_INLINE_REGEX = /@bind:\s*(\w+)/;

/** Result of parsing a sketch source for params. */
export interface SketchParseResult {
  /** Parsed param definitions. */
  params: SketchParamDef[];
}

/**
 * Parse all user-defined params from p5.js source code.
 * Returns param definitions with control/binding metadata.
 */
export function parseSketchSource(source: string): SketchParseResult {
  const params: SketchParamDef[] = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const paramMatch = line.match(PARAM_REGEX);
    if (!paramMatch) continue;

    const parsed = parseParamAnnotation(paramMatch[1]);
    if (!parsed) continue;

    // Check for @bind on the same line (after @param) or the next line
    let bindSemantic: string | undefined;
    const bindMatchSameLine = line.match(BIND_INLINE_REGEX);
    if (bindMatchSameLine) {
      bindSemantic = bindMatchSameLine[1];
    } else if (i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const bindMatchNextLine = nextLine.match(BIND_REGEX);
      if (bindMatchNextLine && !nextLine.match(PARAM_REGEX)) {
        bindSemantic = bindMatchNextLine[1];
      }
    }

    const def: SketchParamDef = {
      name: parsed.name,
      type: parsed.type,
      control: parsed.control,
      value: parsed.defaultValue,
      defaultValue: parsed.defaultValue,
      min: parsed.min,
      max: parsed.max,
      step: parsed.step,
    };

    if (bindSemantic) {
      def.bind = { semantic: bindSemantic };
    }

    params.push(def);
  }

  return { params };
}

// ---------------------------------------------------------------------------
// Annotation parsing
// ---------------------------------------------------------------------------

interface ParsedParam {
  name: string;
  type: SketchParamType;
  control: SketchParamControl;
  defaultValue: number | boolean | number[];
  min: number;
  max: number;
  step: number;
}

/** Parse a `@param:` annotation content string. */
function parseParamAnnotation(content: string): ParsedParam | null {
  // Strip any trailing @bind annotation
  const cleaned = content.replace(/@bind:\s*\w+/, "").trim();
  const parts = cleaned.split(",").map((s) => s.trim()).filter(Boolean);

  if (parts.length < 2) return null;

  const name = parts[0];
  const controlStr = parts[1].toLowerCase();

  // Validate control type
  if (controlStr !== "slider" && controlStr !== "color" && controlStr !== "toggle" && controlStr !== "xy") {
    return null;
  }

  const control = controlStr as SketchParamControl;
  const type = controlToType(control);

  // Parse optional key:value pairs
  let min = defaultMin(type);
  let max = defaultMax(type);
  let step = defaultStep(type);

  for (let i = 2; i < parts.length; i++) {
    const part = parts[i];
    const colonIdx = part.indexOf(":");
    if (colonIdx < 0) continue;

    const key = part.slice(0, colonIdx).trim().toLowerCase();
    const val = part.slice(colonIdx + 1).trim();

    switch (key) {
      case "min": min = parseFloat(val); break;
      case "max": max = parseFloat(val); break;
      case "step": step = parseFloat(val); break;
    }
  }

  const defaultValue = defaultValueForType(type, min, max);

  return { name, type, control, defaultValue, min, max, step };
}

// ---------------------------------------------------------------------------
// Defaults by control/type
// ---------------------------------------------------------------------------

/** Map control type to param type. */
function controlToType(control: SketchParamControl): SketchParamType {
  switch (control) {
    case "slider": return "float";
    case "color": return "color";
    case "toggle": return "bool";
    case "xy": return "vec2";
  }
}

function defaultMin(type: SketchParamType): number {
  switch (type) {
    case "int": return 0;
    default: return 0.0;
  }
}

function defaultMax(type: SketchParamType): number {
  switch (type) {
    case "int": return 10;
    default: return 1.0;
  }
}

function defaultStep(type: SketchParamType): number {
  switch (type) {
    case "int": return 1;
    default: return 0.01;
  }
}

function defaultValueForType(type: SketchParamType, min: number, max: number): number | boolean | number[] {
  switch (type) {
    case "float":
    case "int":
      return (min + max) / 2;
    case "bool":
      return false;
    case "color":
      return [1.0, 1.0, 1.0]; // white
    case "vec2":
      return [0.5, 0.5];
  }
}
