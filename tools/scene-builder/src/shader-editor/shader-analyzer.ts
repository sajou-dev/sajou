/**
 * GLSL shader value analyzer.
 *
 * Statically analyzes GLSL fragment source to detect extractable numeric
 * literals (positions, sizes, frequencies, colors) that could be promoted
 * to uniforms with `@ui` annotations.
 *
 * Approach: strip comments → regex pattern matching line-by-line → dedup.
 */

import type { UniformControl } from "./shader-types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A numeric literal detected in GLSL source that could be exposed as a uniform. */
export interface DetectedValue {
  /** Position in source (1-based line, 0-based col). */
  location: { line: number; col: number; length: number };
  /** Original literal text. */
  raw: string;
  /** Parsed value. */
  value: number | number[];
  /** GLSL type. */
  glslType: "float" | "vec2" | "vec3" | "vec4";
  /** Suggested UI control. */
  suggestedControl: UniformControl;
  /** Suggested min/max range (null for colors). */
  suggestedRange: { min: number; max: number } | null;
  /** Confidence score 0-1. */
  confidence: number;
  /** Functional context description (e.g. "smoothstep threshold", "time frequency"). */
  context: string;
}

// ---------------------------------------------------------------------------
// Comment stripping
// ---------------------------------------------------------------------------

/**
 * Replace all comment characters with spaces, preserving line/column positions.
 * Handles `// ...` and `/* ... *​/` comments.
 */
export function stripComments(source: string): string {
  const chars = [...source];
  const len = chars.length;
  let i = 0;

  while (i < len - 1) {
    // Line comment
    if (chars[i] === "/" && chars[i + 1] === "/") {
      while (i < len && chars[i] !== "\n") {
        chars[i] = " ";
        i++;
      }
      continue;
    }
    // Block comment
    if (chars[i] === "/" && chars[i + 1] === "*") {
      chars[i] = " ";
      chars[i + 1] = " ";
      i += 2;
      while (i < len - 1) {
        if (chars[i] === "*" && chars[i + 1] === "/") {
          chars[i] = " ";
          chars[i + 1] = " ";
          i += 2;
          break;
        }
        if (chars[i] !== "\n") chars[i] = " ";
        i++;
      }
      continue;
    }
    i++;
  }

  return chars.join("");
}

// ---------------------------------------------------------------------------
// Location helpers
// ---------------------------------------------------------------------------

/** Pre-computed line start offsets for fast offset→location lookups. */
function buildLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

/** Convert a character offset to {line, col, length}. Line is 1-based, col is 0-based. */
function offsetToLocation(
  lineStarts: number[],
  offset: number,
  length: number,
): { line: number; col: number; length: number } {
  // Binary search for the line containing this offset
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: offset - lineStarts[lo], length };
}

// ---------------------------------------------------------------------------
// Float literal regex
// ---------------------------------------------------------------------------

/** Matches a standalone float literal: digits with optional decimal, optional sign. */
const FLOAT_RE = /-?\d+\.\d+|-?\d+\.|\.\d+|-?\d+/;

/** Parses a string as a float, returning null if not a valid number. */
function parseFloatSafe(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Exclusion checks
// ---------------------------------------------------------------------------

/** Lines starting with these keywords are excluded from analysis. */
const EXCLUDED_LINE_PREFIXES = ["uniform ", "#define ", "const ", "precision ", "#version ", "in ", "out "];

/** Check if a line should be excluded from literal analysis. */
function isExcludedLine(line: string): boolean {
  const trimmed = line.trimStart();
  return EXCLUDED_LINE_PREFIXES.some((p) => trimmed.startsWith(p));
}

/** Trivial values that get low confidence when isolated. */
function isTrivialFloat(v: number): boolean {
  return v === 0.0 || v === 1.0;
}

// ---------------------------------------------------------------------------
// Pattern matchers
// ---------------------------------------------------------------------------

// A. Vec constructors: vec2(...), vec3(...), vec4(...)
const VEC_RE = /\b(vec[234])\s*\(([^()]+)\)/g;

function matchVecConstructors(clean: string, original: string, lineStarts: number[]): DetectedValue[] {
  const results: DetectedValue[] = [];
  let m: RegExpExecArray | null;
  VEC_RE.lastIndex = 0;

  while ((m = VEC_RE.exec(clean)) !== null) {
    const vecType = m[1] as "vec2" | "vec3" | "vec4";
    const argsStr = m[2];
    const args = argsStr.split(",").map((s) => s.trim());

    // All args must be numeric literals
    const nums: number[] = [];
    let allNumeric = true;
    for (const arg of args) {
      const n = parseFloatSafe(arg);
      if (n === null) {
        allNumeric = false;
        break;
      }
      nums.push(n);
    }
    if (!allNumeric) continue;

    const expectedCount = parseInt(vecType[3]);
    if (nums.length !== expectedCount) continue;

    // Determine if this looks like a color (vec3/vec4 with all components 0-1)
    const isColor = (vecType === "vec3" || vecType === "vec4") &&
      nums.every((n) => n >= 0.0 && n <= 1.0);

    // Hash constants: large values in vec2 → low confidence
    const isHash = vecType === "vec2" && nums.some((n) => Math.abs(n) > 100);

    const fullMatch = m[0];
    const loc = offsetToLocation(lineStarts, m.index, fullMatch.length);

    // Use location from original source
    const originalLine = original.split("\n")[loc.line - 1] ?? "";
    // Check if this line is excluded in original
    if (isExcludedLine(originalLine)) continue;

    let confidence = isHash ? 0.2 : isColor ? 0.8 : 0.7;
    let suggestedControl: UniformControl = isColor ? "color" : "slider";
    let suggestedRange: { min: number; max: number } | null = isColor ? null : { min: 0, max: Math.max(...nums.map((n) => Math.abs(n))) * 3 };
    let context = isColor ? "color" : vecType === "vec2" ? "offset" : "position";

    if (isHash) {
      context = "hash constant";
      suggestedRange = null;
      suggestedControl = "slider";
    }

    if (vecType === "vec2") {
      suggestedControl = "xy";
    }

    results.push({
      location: loc,
      raw: fullMatch,
      value: nums,
      glslType: vecType,
      suggestedControl,
      suggestedRange,
      confidence,
      context,
    });
  }

  return results;
}

// B. smoothstep(A, B, x) — detect A and B as thresholds
const SMOOTHSTEP_RE = /\bsmoothstep\s*\(\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,/g;

function matchSmoothstep(clean: string, original: string, lineStarts: number[]): DetectedValue[] {
  const results: DetectedValue[] = [];
  let m: RegExpExecArray | null;
  SMOOTHSTEP_RE.lastIndex = 0;

  while ((m = SMOOTHSTEP_RE.exec(clean)) !== null) {
    const origLine = original.split("\n")[(offsetToLocation(lineStarts, m.index, 0).line) - 1] ?? "";
    if (isExcludedLine(origLine)) continue;

    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);

    // First arg
    const aOffset = m.index + m[0].indexOf(m[1]);
    results.push({
      location: offsetToLocation(lineStarts, aOffset, m[1].length),
      raw: m[1],
      value: a,
      glslType: "float",
      suggestedControl: "slider",
      suggestedRange: { min: 0, max: Math.max(1, a * 3) },
      confidence: 0.9,
      context: "smoothstep threshold",
    });

    // Second arg
    const bStart = m[0].indexOf(m[2], m[0].indexOf(",") + 1);
    const bOffset = m.index + bStart;
    results.push({
      location: offsetToLocation(lineStarts, bOffset, m[2].length),
      raw: m[2],
      value: b,
      glslType: "float",
      suggestedControl: "slider",
      suggestedRange: { min: 0, max: Math.max(1, b * 3) },
      confidence: 0.9,
      context: "smoothstep threshold",
    });
  }

  return results;
}

// C. mix(a, b, FACTOR) — detect the mix factor
const MIX_RE = /\bmix\s*\([^,]+,[^,]+,\s*(-?\d+\.?\d*)\s*\)/g;

function matchMix(clean: string, original: string, lineStarts: number[]): DetectedValue[] {
  const results: DetectedValue[] = [];
  let m: RegExpExecArray | null;
  MIX_RE.lastIndex = 0;

  while ((m = MIX_RE.exec(clean)) !== null) {
    const origLine = original.split("\n")[(offsetToLocation(lineStarts, m.index, 0).line) - 1] ?? "";
    if (isExcludedLine(origLine)) continue;

    const factor = parseFloat(m[1]);
    const litStart = m[0].lastIndexOf(m[1]);
    const offset = m.index + litStart;

    results.push({
      location: offsetToLocation(lineStarts, offset, m[1].length),
      raw: m[1],
      value: factor,
      glslType: "float",
      suggestedControl: "slider",
      suggestedRange: { min: 0, max: 1 },
      confidence: 0.85,
      context: "mix factor",
    });
  }

  return results;
}

// D. pow(x, EXP)
const POW_RE = /\bpow\s*\([^,]+,\s*(-?\d+\.?\d*)\s*\)/g;

function matchPow(clean: string, original: string, lineStarts: number[]): DetectedValue[] {
  const results: DetectedValue[] = [];
  let m: RegExpExecArray | null;
  POW_RE.lastIndex = 0;

  while ((m = POW_RE.exec(clean)) !== null) {
    const origLine = original.split("\n")[(offsetToLocation(lineStarts, m.index, 0).line) - 1] ?? "";
    if (isExcludedLine(origLine)) continue;

    const exp = parseFloat(m[1]);
    const litStart = m[0].lastIndexOf(m[1]);
    const offset = m.index + litStart;

    results.push({
      location: offsetToLocation(lineStarts, offset, m[1].length),
      raw: m[1],
      value: exp,
      glslType: "float",
      suggestedControl: "slider",
      suggestedRange: { min: 0.1, max: Math.max(10, exp * 3) },
      confidence: 0.85,
      context: "pow exponent",
    });
  }

  return results;
}

// E. clamp(x, MIN, MAX)
const CLAMP_RE = /\bclamp\s*\([^,]+,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)/g;

function matchClamp(clean: string, original: string, lineStarts: number[]): DetectedValue[] {
  const results: DetectedValue[] = [];
  let m: RegExpExecArray | null;
  CLAMP_RE.lastIndex = 0;

  while ((m = CLAMP_RE.exec(clean)) !== null) {
    const origLine = original.split("\n")[(offsetToLocation(lineStarts, m.index, 0).line) - 1] ?? "";
    if (isExcludedLine(origLine)) continue;

    const minVal = parseFloat(m[1]);
    const maxVal = parseFloat(m[2]);

    // Min arg
    const minStart = m[0].indexOf(m[1], m[0].indexOf(",") + 1);
    results.push({
      location: offsetToLocation(lineStarts, m.index + minStart, m[1].length),
      raw: m[1],
      value: minVal,
      glslType: "float",
      suggestedControl: "slider",
      suggestedRange: { min: minVal - Math.abs(minVal), max: maxVal + Math.abs(maxVal) },
      confidence: 0.7,
      context: "clamp bounds",
    });

    // Max arg
    const maxStart = m[0].indexOf(m[2], m[0].lastIndexOf(",") + 1);
    results.push({
      location: offsetToLocation(lineStarts, m.index + maxStart, m[2].length),
      raw: m[2],
      value: maxVal,
      glslType: "float",
      suggestedControl: "slider",
      suggestedRange: { min: minVal - Math.abs(minVal), max: maxVal + Math.abs(maxVal) },
      confidence: 0.7,
      context: "clamp bounds",
    });
  }

  return results;
}

// F. iTime * FREQ or FREQ * iTime
const TIME_MUL_RE = /\biTime\s*\*\s*(-?\d+\.?\d*)|(-?\d+\.?\d*)\s*\*\s*iTime\b/g;

function matchTimeMultiplier(clean: string, original: string, lineStarts: number[]): DetectedValue[] {
  const results: DetectedValue[] = [];
  let m: RegExpExecArray | null;
  TIME_MUL_RE.lastIndex = 0;

  while ((m = TIME_MUL_RE.exec(clean)) !== null) {
    const origLine = original.split("\n")[(offsetToLocation(lineStarts, m.index, 0).line) - 1] ?? "";
    if (isExcludedLine(origLine)) continue;

    const litStr = m[1] ?? m[2];
    const freq = parseFloat(litStr);
    const litStart = m[0].indexOf(litStr);
    const offset = m.index + litStart;

    results.push({
      location: offsetToLocation(lineStarts, offset, litStr.length),
      raw: litStr,
      value: freq,
      glslType: "float",
      suggestedControl: "slider",
      suggestedRange: { min: 0, max: 10 },
      confidence: 0.9,
      context: "time frequency",
    });
  }

  return results;
}

// G. sin(... * FREQ) or cos(... * FREQ)
const SINCOS_RE = /\b(?:sin|cos)\s*\([^)]*\*\s*(-?\d+\.?\d*)\s*\)/g;

function matchSinCosFreq(clean: string, original: string, lineStarts: number[]): DetectedValue[] {
  const results: DetectedValue[] = [];
  let m: RegExpExecArray | null;
  SINCOS_RE.lastIndex = 0;

  while ((m = SINCOS_RE.exec(clean)) !== null) {
    const origLine = original.split("\n")[(offsetToLocation(lineStarts, m.index, 0).line) - 1] ?? "";
    if (isExcludedLine(origLine)) continue;

    const freq = parseFloat(m[1]);
    const litStart = m[0].lastIndexOf(m[1]);
    const offset = m.index + litStart;

    results.push({
      location: offsetToLocation(lineStarts, offset, m[1].length),
      raw: m[1],
      value: freq,
      glslType: "float",
      suggestedControl: "slider",
      suggestedRange: { min: 0, max: Math.max(1, freq * 3) },
      confidence: 0.7,
      context: "sin/cos frequency",
    });
  }

  return results;
}

// H. sd*(pos, RADIUS) — SDF primitives
const SDF_RE = /\b(sd\w+)\s*\([^,]+,\s*(-?\d+\.?\d*)\s*\)/g;

function matchSdfArgs(clean: string, original: string, lineStarts: number[]): DetectedValue[] {
  const results: DetectedValue[] = [];
  let m: RegExpExecArray | null;
  SDF_RE.lastIndex = 0;

  while ((m = SDF_RE.exec(clean)) !== null) {
    const origLine = original.split("\n")[(offsetToLocation(lineStarts, m.index, 0).line) - 1] ?? "";
    if (isExcludedLine(origLine)) continue;

    const fnName = m[1];
    const radius = parseFloat(m[2]);
    const litStart = m[0].lastIndexOf(m[2]);
    const offset = m.index + litStart;

    // Capitalize first letter of primitive name for context
    const primName = fnName.slice(2); // strip "sd"
    const context = `SDF radius/size in ${fnName}`;

    results.push({
      location: offsetToLocation(lineStarts, offset, m[2].length),
      raw: m[2],
      value: radius,
      glslType: "float",
      suggestedControl: "slider",
      suggestedRange: { min: 0, max: Math.max(1, radius * 4) },
      confidence: 0.85,
      context,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Post-processing: dedup + trivial confidence
// ---------------------------------------------------------------------------

/** Deduplicate by location (line:col). First match wins. */
function dedupByLocation(values: DetectedValue[]): DetectedValue[] {
  const seen = new Set<string>();
  const result: DetectedValue[] = [];

  for (const v of values) {
    const key = `${v.location.line}:${v.location.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(v);
  }

  return result;
}

/** Lower confidence for trivial isolated values (0.0, 1.0). */
function applyTrivialPenalty(values: DetectedValue[]): DetectedValue[] {
  return values.map((v) => {
    if (v.glslType === "float" && typeof v.value === "number" && isTrivialFloat(v.value)) {
      return { ...v, confidence: Math.min(v.confidence, 0.3) };
    }
    return v;
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Analyze a GLSL fragment shader source for extractable numeric literals.
 *
 * Returns detected values sorted by line number, with confidence scores
 * and suggested UI controls for each.
 */
export function analyzeShader(source: string): DetectedValue[] {
  if (!source.trim()) return [];

  const clean = stripComments(source);
  const lineStarts = buildLineStarts(source);

  // Run all matchers
  const all: DetectedValue[] = [
    ...matchVecConstructors(clean, source, lineStarts),
    ...matchSmoothstep(clean, source, lineStarts),
    ...matchMix(clean, source, lineStarts),
    ...matchPow(clean, source, lineStarts),
    ...matchClamp(clean, source, lineStarts),
    ...matchTimeMultiplier(clean, source, lineStarts),
    ...matchSinCosFreq(clean, source, lineStarts),
    ...matchSdfArgs(clean, source, lineStarts),
  ];

  // Post-process
  const deduped = dedupByLocation(all);
  const penalized = applyTrivialPenalty(deduped);

  // Sort by line number
  return penalized.sort((a, b) => a.location.line - b.location.line || a.location.col - b.location.col);
}
