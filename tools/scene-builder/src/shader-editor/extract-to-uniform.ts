/**
 * Extract-to-uniform GLSL source rewriter.
 *
 * Takes a DetectedValue and rewrites the GLSL source to replace
 * the literal with a named uniform, inserting the uniform declaration
 * with an appropriate `@ui` annotation.
 *
 * Also provides `revertUniform()` to undo the extraction: removes the
 * uniform declaration and replaces the name back with the original literal.
 */

import type { DetectedValue } from "./shader-analyzer.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result of extracting a literal to a uniform. */
export interface ExtractResult {
  /** The rewritten GLSL source. */
  newSource: string;
  /** The generated uniform name. */
  uniformName: string;
  /** The `@ui` annotation line appended to the uniform declaration. */
  annotation: string;
}

// ---------------------------------------------------------------------------
// Name generation
// ---------------------------------------------------------------------------

/** Context string → suggested uniform name prefix. */
const CONTEXT_PREFIXES: Record<string, string> = {
  "smoothstep threshold": "uThreshold",
  "time frequency": "uFreq",
  "mix factor": "uMixFactor",
  "pow exponent": "uGamma",
  "clamp bounds": "uBound",
  "sin/cos frequency": "uFreq",
  "color": "uColor",
  "position": "uPos",
  "offset": "uOffset",
  "hash constant": "uHash",
};

/** Generate a uniform name from a DetectedValue context. */
function generateName(detected: DetectedValue, existingNames: Set<string>): string {
  let base: string;

  // SDF context: extract primitive name
  if (detected.context.startsWith("SDF radius/size in ")) {
    const fnName = detected.context.slice("SDF radius/size in ".length);
    const primName = fnName.slice(2); // strip "sd"
    base = `u${capitalize(primName)}Radius`;
  } else {
    base = CONTEXT_PREFIXES[detected.context] ?? "uParam";
  }

  // vec2 without specific context → uOffset
  if (detected.glslType === "vec2" && base === "uParam") {
    base = "uOffset";
  }

  // Deduplicate with numeric suffix
  if (!existingNames.has(base)) return base;

  let i = 1;
  while (existingNames.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

/** Capitalize first letter of a string. */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Annotation generation
// ---------------------------------------------------------------------------

/** Generate a `// @ui: ...` annotation from a DetectedValue. */
function generateAnnotation(detected: DetectedValue): string {
  if (detected.suggestedControl === "color") {
    return "// @ui: color";
  }

  if (detected.suggestedControl === "xy" && detected.suggestedRange) {
    return `// @ui: xy, min: ${formatNum(detected.suggestedRange.min)}, max: ${formatNum(detected.suggestedRange.max)}`;
  }

  if (detected.suggestedRange) {
    return `// @ui: slider, min: ${formatNum(detected.suggestedRange.min)}, max: ${formatNum(detected.suggestedRange.max)}`;
  }

  return `// @ui: ${detected.suggestedControl}`;
}

/** Format a number: strip trailing zeros but keep at least one decimal. */
function formatNum(n: number): string {
  // Use up to 3 decimal places, strip trailing zeros
  const s = n.toFixed(3).replace(/\.?0+$/, "");
  // Ensure at least one decimal for GLSL readability
  return s.includes(".") ? s : s + ".0";
}

// ---------------------------------------------------------------------------
// Insertion point
// ---------------------------------------------------------------------------

/**
 * Find the line index where a new uniform declaration should be inserted.
 * After `#version`, `precision`, `in`/`out`, existing `uniform` lines,
 * but before the first code (function/void/etc.).
 */
function findInsertionLine(lines: string[]): number {
  let lastPreambleLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (
      trimmed.startsWith("#version") ||
      trimmed.startsWith("precision") ||
      trimmed.startsWith("in ") ||
      trimmed.startsWith("out ") ||
      trimmed.startsWith("uniform ") ||
      trimmed.startsWith("// @object") ||
      trimmed === ""
    ) {
      lastPreambleLine = i;
    } else {
      break;
    }
  }

  return lastPreambleLine + 1;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Extract a detected literal value into a uniform declaration.
 *
 * Replaces the literal in the source with the uniform name, and inserts
 * a `uniform <type> <name>; // @ui: ...` declaration in the preamble.
 *
 * @param source - The original GLSL fragment source.
 * @param detected - The detected value to extract.
 * @param uniformName - Optional override for the uniform name.
 * @returns The rewrite result, or null if the replacement cannot be made.
 */
export function extractToUniform(
  source: string,
  detected: DetectedValue,
  uniformName?: string,
): ExtractResult | null {
  const lines = source.split("\n");
  const lineIdx = detected.location.line - 1;

  if (lineIdx < 0 || lineIdx >= lines.length) return null;

  // Collect existing uniform names for dedup
  const existingNames = new Set<string>();
  for (const line of lines) {
    const match = line.match(/uniform\s+\w+\s+(\w+)\s*;/);
    if (match) existingNames.add(match[1]);
  }

  const name = uniformName ?? generateName(detected, existingNames);
  const annotation = generateAnnotation(detected);

  // Step 1: Replace the literal in its line
  const line = lines[lineIdx];
  const col = detected.location.col;
  const len = detected.location.length;

  // Verify the literal is still at the expected position
  const actual = line.slice(col, col + len);
  if (actual !== detected.raw) {
    // Source has changed since analysis — cannot safely replace
    return null;
  }

  lines[lineIdx] = line.slice(0, col) + name + line.slice(col + len);

  // Step 2: Build the uniform declaration line
  const declLine = `uniform ${detected.glslType} ${name}; ${annotation}`;

  // Step 3: Find insertion point and insert
  const insertIdx = findInsertionLine(lines);

  // Add an empty line before if the previous line is not empty
  if (insertIdx > 0 && lines[insertIdx - 1].trim() !== "") {
    lines.splice(insertIdx, 0, declLine);
  } else {
    lines.splice(insertIdx, 0, declLine);
  }

  return {
    newSource: lines.join("\n"),
    uniformName: name,
    annotation,
  };
}

// ---------------------------------------------------------------------------
// Revert (unexpose)
// ---------------------------------------------------------------------------

/**
 * Revert a previously extracted uniform back to its original literal.
 *
 * Removes the `uniform <type> <name>; ...` declaration line and replaces
 * all occurrences of the uniform name in the source with the original
 * literal text.
 *
 * @param source - The current GLSL source containing the uniform.
 * @param uniformName - The uniform name to revert (e.g. "uFreq").
 * @param originalRaw - The original literal text to restore (e.g. "0.5").
 * @returns The reverted source, or null if the uniform was not found.
 */
export function revertUniform(
  source: string,
  uniformName: string,
  originalRaw: string,
): string | null {
  const lines = source.split("\n");

  // Find and remove the uniform declaration line
  const declPattern = new RegExp(`^\\s*uniform\\s+\\w+\\s+${escapeRegex(uniformName)}\\s*;`);
  const declIdx = lines.findIndex((l) => declPattern.test(l));
  if (declIdx < 0) return null;

  lines.splice(declIdx, 1);

  // Replace all occurrences of the uniform name with the original literal.
  // Use word-boundary matching to avoid partial replacements.
  const namePattern = new RegExp(`\\b${escapeRegex(uniformName)}\\b`, "g");
  const result = lines.join("\n").replace(namePattern, originalRaw);

  return result;
}

/** Escape a string for use in a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
