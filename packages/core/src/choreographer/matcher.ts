/**
 * Signal condition matcher for the `when` clause.
 *
 * Evaluates declarative conditions against a signal's payload using
 * the resolver's dot-path lookup. Pure functions, zero side effects.
 *
 * @example
 * ```ts
 * const when = { "signal.content": { contains: "amour" } };
 * matchesWhen(when, { type: "token_usage", payload: { content: "je t'amour" } });
 * // → true
 * ```
 */

import type { PerformanceSignal, WhenClause, WhenCondition, WhenOperator } from "./types.js";
import { resolveSignalRef } from "./resolver.js";

/**
 * Evaluate a `when` clause against a signal.
 *
 * - `undefined` → `true` (no filter = always match).
 * - Object → all entries must match (AND).
 * - Array → at least one entry must match (OR).
 */
export function matchesWhen(
  when: WhenClause | undefined,
  signal: PerformanceSignal,
): boolean {
  if (when === undefined) {
    return true;
  }

  if (Array.isArray(when)) {
    // OR: at least one condition must match (empty array = vacuously true)
    const conditions = when as readonly WhenCondition[];
    return conditions.length === 0 || conditions.some((condition) => evaluateCondition(condition, signal));
  }

  // Single object: AND of all entries
  return evaluateCondition(when as WhenCondition, signal);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Evaluate a single WhenCondition (all entries AND-combined).
 * Each key is a signal path, each value is an operator to evaluate.
 */
function evaluateCondition(
  condition: WhenCondition,
  signal: PerformanceSignal,
): boolean {
  for (const [path, operator] of Object.entries(condition)) {
    const value = resolveSignalRef(path, signal);
    if (!evaluateOperator(operator, value)) {
      return false;
    }
  }
  return true;
}

/**
 * Evaluate an operator against a resolved value.
 *
 * Multiple operator keys in the same object are AND-combined
 * (all must pass). Returns `true` for an empty operator (no keys).
 */
function evaluateOperator(operator: WhenOperator, value: unknown): boolean {
  // Negation — wraps another operator
  if (operator.not !== undefined) {
    if (!evaluateOperator(operator.not, value)) {
      return true;
    }
    // If the inner operator matched, the negation fails.
    // But we only fail here if `not` is the ONLY operator.
    // If there are other operators, we continue checking them.
    // However, `not` with other siblings is unusual — we treat `not`
    // as a standalone gate: if it fails, the whole operator fails.
    return false;
  }

  // exists
  if (operator.exists !== undefined) {
    const fieldExists = value !== null && value !== undefined;
    if (!(operator.exists ? fieldExists : !fieldExists)) return false;
  }

  // equals — strict equality
  if (operator.equals !== undefined) {
    if (value !== operator.equals) return false;
  }

  // contains — substring match
  if (operator.contains !== undefined) {
    if (typeof value !== "string" || !value.includes(operator.contains)) return false;
  }

  // matches — regex
  if (operator.matches !== undefined) {
    if (typeof value !== "string") return false;
    try {
      if (!new RegExp(operator.matches).test(value)) return false;
    } catch {
      return false; // Invalid regex = no match
    }
  }

  // gt — numeric greater than
  if (operator.gt !== undefined) {
    if (typeof value !== "number" || value <= operator.gt) return false;
  }

  // lt — numeric less than
  if (operator.lt !== undefined) {
    if (typeof value !== "number" || value >= operator.lt) return false;
  }

  return true;
}
