/**
 * Mapping functions — pure math transformations for the compositor.
 *
 * These functions transform input values before they reach choreography inputs.
 * Each function is stateless and takes a value + arguments.
 *
 * Registry pattern: look up functions by name string from wiring configuration.
 */

// ---------------------------------------------------------------------------
// Function implementations
// ---------------------------------------------------------------------------

/** Linear interpolation: lerp(t, a, b) = a + t * (b - a). */
export function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

/** Clamp value to [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Step function: 0 if v < edge, 1 otherwise. */
export function step(v: number, edge: number): number {
  return v < edge ? 0 : 1;
}

/** Remap value from [inMin, inMax] to [outMin, outMax]. */
export function map(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const t = inMax !== inMin ? (v - inMin) / (inMax - inMin) : 0;
  return outMin + t * (outMax - outMin);
}

/** Hermite smoothstep: smooth transition between e0 and e1. */
export function smoothstep(v: number, e0: number, e1: number): number {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Quantize to discrete steps: floor(v / stepSize) * stepSize. */
export function quantize(v: number, steps: number): number {
  if (steps <= 0) return v;
  return Math.floor(v / steps) * steps;
}

/** Cubic bezier curve evaluation (simplified: single-axis with 2 control points). */
export function curve(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Absolute value. */
export function abs(v: number): number {
  return Math.abs(v);
}

/** Invert: 1 - v. */
export function invert(v: number): number {
  return 1 - v;
}

/** Power: v^exp. */
export function pow(v: number, exp: number): number {
  return Math.pow(v, exp);
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** A mapping function signature: takes a value and variadic args. */
export type MappingFn = (v: number, ...args: number[]) => number;

/** Metadata about a registered mapping function. */
export interface MappingFnInfo {
  /** Function name. */
  name: string;
  /** Brief description. */
  description: string;
  /** Parameter names (first is always the input value). */
  params: string[];
  /** The function implementation. */
  fn: MappingFn;
}

/** All registered mapping functions. */
const REGISTRY: Map<string, MappingFnInfo> = new Map([
  ["lerp", {
    name: "lerp",
    description: "Linear interpolation: a + t × (b − a)",
    params: ["t", "a", "b"],
    fn: lerp,
  }],
  ["clamp", {
    name: "clamp",
    description: "Clamp value to [min, max]",
    params: ["v", "min", "max"],
    fn: clamp,
  }],
  ["step", {
    name: "step",
    description: "0 if v < edge, 1 otherwise",
    params: ["v", "edge"],
    fn: step,
  }],
  ["map", {
    name: "map",
    description: "Remap from [inMin,inMax] to [outMin,outMax]",
    params: ["v", "inMin", "inMax", "outMin", "outMax"],
    fn: map,
  }],
  ["smoothstep", {
    name: "smoothstep",
    description: "Smooth hermite transition between e0 and e1",
    params: ["v", "e0", "e1"],
    fn: smoothstep,
  }],
  ["quantize", {
    name: "quantize",
    description: "Quantize to discrete steps",
    params: ["v", "stepSize"],
    fn: quantize,
  }],
  ["curve", {
    name: "curve",
    description: "Cubic bezier (p0→p1→p2→p3)",
    params: ["t", "p0", "p1", "p2", "p3"],
    fn: curve,
  }],
  ["abs", {
    name: "abs",
    description: "Absolute value",
    params: ["v"],
    fn: abs,
  }],
  ["invert", {
    name: "invert",
    description: "Invert: 1 − v",
    params: ["v"],
    fn: invert,
  }],
  ["pow", {
    name: "pow",
    description: "Power: v^exp",
    params: ["v", "exp"],
    fn: pow,
  }],
]);

/** Get a mapping function by name. Returns null for unknown names. */
export function getMappingFn(name: string): MappingFnInfo | null {
  return REGISTRY.get(name) ?? null;
}

/** Get all registered mapping function names. */
export function getAllMappingFns(): MappingFnInfo[] {
  return Array.from(REGISTRY.values());
}

/**
 * Apply a named mapping function with arguments.
 * Returns the input value unchanged if the function is not found.
 */
export function applyMapping(fnName: string, value: number, args: number[]): number {
  const info = REGISTRY.get(fnName);
  if (!info) return value;
  return info.fn(value, ...args);
}
