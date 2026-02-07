/**
 * Signal reference resolver for choreography steps.
 *
 * Choreography steps use "signal.*" strings to reference data from the
 * triggering signal's payload. The resolver performs dot-path lookups
 * to replace these references with concrete values.
 *
 * @example
 * ```
 * // Step: { "action": "move", "entity": "agent", "to": "signal.to" }
 * // Signal payload: { from: "orchestrator", to: "agent-solver" }
 * // Resolved "to" value: "agent-solver"
 * ```
 */

import type { PerformanceSignal } from "./types.js";

/** Prefix that marks a string as a signal reference. */
const SIGNAL_REF_PREFIX = "signal.";

/**
 * Check whether a string value is a signal reference (starts with "signal.").
 */
export function isSignalRef(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(SIGNAL_REF_PREFIX);
}

/**
 * Resolve a signal reference to its concrete value.
 *
 * Supports dot-path lookups on the signal payload:
 * - `"signal.from"` → `signal.payload.from`
 * - `"signal.agentId"` → `signal.payload.agentId`
 * - `"signal.type"` → `signal.type` (envelope field)
 *
 * @returns The resolved value, or `undefined` if the path doesn't exist.
 */
export function resolveSignalRef(
  ref: string,
  signal: PerformanceSignal,
): unknown {
  const path = ref.slice(SIGNAL_REF_PREFIX.length);

  // "signal.type" resolves to the envelope type field
  if (path === "type") {
    return signal.type;
  }

  // All other paths resolve against the payload
  return getByPath(signal.payload, path);
}

/**
 * Resolve all signal references in a record of parameters.
 * Non-signal-ref values are passed through unchanged.
 *
 * @returns A new record with all signal.* references resolved.
 */
export function resolveParams(
  params: Readonly<Record<string, unknown>>,
  signal: PerformanceSignal,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    resolved[key] = isSignalRef(value)
      ? resolveSignalRef(value, signal)
      : value;
  }
  return resolved;
}

/**
 * Resolve the entity reference from a step.
 * If the entity string is a signal.* reference, it's resolved.
 * Otherwise, it's returned as-is (a logical entity name like "agent").
 */
export function resolveEntityRef(
  entityRef: string | undefined,
  signal: PerformanceSignal,
): string {
  if (entityRef === undefined) {
    return "";
  }
  if (isSignalRef(entityRef)) {
    const resolved = resolveSignalRef(entityRef, signal);
    return typeof resolved === "string" ? resolved : "";
  }
  return entityRef;
}

/**
 * Simple dot-path lookup on a record.
 * `getByPath({ a: { b: 42 } }, "a.b")` → `42`
 */
function getByPath(obj: Readonly<Record<string, unknown>>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
