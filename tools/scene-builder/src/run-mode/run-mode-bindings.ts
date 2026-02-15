/**
 * Run mode binding executor — applies entity bindings when signals match.
 *
 * The BindingExecutor is a peer of the Choreographer in the signal dispatch
 * path. When a signal arrives:
 *
 *   1. For each choreography that has bindings:
 *      - Check if the signal type matches the choreo's effective types
 *      - Check if the signal payload matches the choreo's `when` clause
 *   2. For each matched binding:
 *      - Execute the appropriate property change on the target entity
 *
 * ```
 * Signal arrives
 *   ├──→ choreographer.handleSignal()     [steps: move, fly, flash…]
 *   └──→ bindingExecutor.handleSignal()   [bindings: animation.state, opacity…]
 * ```
 *
 * Bindings are immediate property assignments, not temporal animations.
 * They are a side-effect of the choreography trigger, not of step sequencing.
 */

import type {
  EntityBinding,
  BindingMapping,
  WhenClauseDef,
  WhenConditionDef,
  WhenOperatorDef,
} from "../types.js";
import type { RenderAdapter } from "../canvas/render-adapter.js";
import { getChoreographyState } from "../state/choreography-state.js";
import { getChoreoInputInfo } from "../state/wiring-queries.js";
import { getBindingsFromChoreography } from "../state/binding-store.js";
import { resolveEntityId, resolvePosition } from "./run-mode-resolve.js";
import { switchAnimation } from "./run-mode-animator.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Handle for a running binding executor. */
export interface BindingExecutor {
  /** Evaluate a signal against all choreography bindings and execute matches. */
  handleSignal(signal: { type: string; payload: Record<string, unknown> }): void;
  /** Clean up resources. */
  dispose(): void;
}

/**
 * Create a BindingExecutor that reads bindings from the binding-store
 * and executes them when matching signals arrive.
 *
 * Reads binding state lazily on each signal (not snapshotted at creation)
 * so that bindings added during run mode are immediately effective.
 */
export function createBindingExecutor(adapter: RenderAdapter): BindingExecutor {
  let disposed = false;

  return {
    handleSignal(signal) {
      if (disposed) return;

      const { choreographies } = getChoreographyState();

      for (const choreo of choreographies) {
        // Get bindings for this choreography
        const bindings = getBindingsFromChoreography(choreo.id);
        if (bindings.length === 0) continue;

        // Check signal type match
        const inputInfo = getChoreoInputInfo(choreo.id);
        if (!inputInfo.effectiveTypes.includes(signal.type)) continue;

        // Check when clause match
        if (!matchesWhen(choreo.when, signal)) continue;

        // All conditions met — execute each binding
        for (const binding of bindings) {
          executeBinding(binding, signal, adapter);
        }
      }
    },

    dispose() {
      disposed = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Binding execution
// ---------------------------------------------------------------------------

/** Execute a single binding against a matched signal. */
function executeBinding(
  binding: EntityBinding,
  signal: { type: string; payload: Record<string, unknown> },
  adapter: RenderAdapter,
): void {
  const placedId = resolveEntityId(binding.targetEntityId);
  if (!placedId) {
    console.warn(`[bindings] Target entity not found: ${binding.targetEntityId}`);
    return;
  }

  switch (binding.property) {
    case "animation.state":
      executeAnimationState(placedId, binding);
      break;

    case "visible":
      executeVisible(placedId, adapter);
      break;

    case "opacity":
      executeValueBinding(placedId, binding, signal, "alpha", adapter);
      break;

    case "rotation":
      executeValueBinding(placedId, binding, signal, "rotation", adapter);
      break;

    case "scale":
      executeValueBinding(placedId, binding, signal, "scale", adapter);
      break;

    case "position.x":
      executeValueBinding(placedId, binding, signal, "x", adapter);
      break;

    case "position.y":
      executeValueBinding(placedId, binding, signal, "y", adapter);
      break;

    case "teleportTo":
      executeTeleportTo(placedId, binding, adapter);
      break;

    default:
      console.warn(`[bindings] Unknown property: ${binding.property}`);
  }
}

/** Switch the entity's spritesheet animation state. */
function executeAnimationState(placedId: string, binding: EntityBinding): void {
  const animState = binding.action?.animationDuring;
  if (!animState) {
    console.warn(`[bindings] animation.state binding has no animationDuring`);
    return;
  }

  const ok = switchAnimation(placedId, animState);
  if (ok) {
    console.log(`[bindings] ${binding.targetEntityId} → animation: ${animState}`);
  } else {
    console.warn(`[bindings] Failed to switch animation for ${binding.targetEntityId} to ${animState}`);
  }
}

/** Toggle entity visibility. */
function executeVisible(placedId: string, adapter: RenderAdapter): void {
  const handle = adapter.getHandle(placedId);
  if (!handle) return;
  handle.visible = !handle.visible;
  console.log(`[bindings] ${placedId} → visible: ${handle.visible}`);
}

/** Execute a value binding (opacity, rotation, scale, position) with optional mapping. */
function executeValueBinding(
  placedId: string,
  binding: EntityBinding,
  signal: { type: string; payload: Record<string, unknown> },
  prop: "alpha" | "rotation" | "scale" | "x" | "y",
  adapter: RenderAdapter,
): void {
  const handle = adapter.getHandle(placedId);
  if (!handle) return;

  // Extract numeric value from signal payload
  const raw = extractNumericValue(signal.payload, binding.property);
  if (raw === null) {
    console.warn(`[bindings] No numeric value found in payload for ${binding.property}`);
    return;
  }

  // Apply mapping if configured, otherwise use raw value
  const mapped = binding.mapping
    ? applyMapping(raw, binding.mapping)
    : raw;

  // Apply to handle
  if (prop === "scale") {
    handle.scale.set(mapped);
  } else if (prop === "alpha") {
    handle.alpha = mapped;
  } else if (prop === "rotation") {
    handle.rotation = mapped;
  } else if (prop === "x") {
    handle.x = mapped;
  } else if (prop === "y") {
    handle.y = mapped;
  }

  console.log(`[bindings] ${binding.targetEntityId} → ${prop}: ${mapped}`);
}

/** Teleport entity to a named waypoint position. */
function executeTeleportTo(placedId: string, binding: EntityBinding, adapter: RenderAdapter): void {
  const waypointName = binding.action?.waypoint;
  if (!waypointName) {
    console.warn(`[bindings] teleportTo binding has no waypoint`);
    return;
  }

  const pos = resolvePosition(waypointName);
  if (!pos) {
    console.warn(`[bindings] Waypoint not found: ${waypointName}`);
    return;
  }

  const handle = adapter.getHandle(placedId);
  if (!handle) return;

  handle.x = pos.x;
  handle.y = pos.y;
  console.log(`[bindings] ${binding.targetEntityId} → teleport to ${waypointName} (${pos.x}, ${pos.y})`);
}

// ---------------------------------------------------------------------------
// Value extraction and mapping
// ---------------------------------------------------------------------------

/**
 * Extract a numeric value from the signal payload.
 *
 * Strategy:
 *   1. Try the binding property as a path (e.g., "opacity" → payload.opacity)
 *   2. Try "value" as a conventional field
 *   3. Find the first numeric field in the payload
 */
function extractNumericValue(
  payload: Record<string, unknown>,
  bindingProperty: string,
): number | null {
  // Strategy 1: direct path from binding property name
  const directKeys = bindingProperty.split(".");
  const lastKey = directKeys[directKeys.length - 1];
  if (lastKey && typeof payload[lastKey] === "number") {
    return payload[lastKey] as number;
  }

  // Strategy 2: conventional "value" field
  if (typeof payload["value"] === "number") {
    return payload["value"] as number;
  }

  // Strategy 3: first numeric field
  for (const val of Object.values(payload)) {
    if (typeof val === "number") return val;
  }

  return null;
}

/**
 * Apply a mapping function to transform a raw value to the target range.
 *
 * Supports: lerp (default), clamp, step, smoothstep.
 */
function applyMapping(raw: number, mapping: BindingMapping): number {
  const [inMin, inMax] = mapping.inputRange;
  const [outMin, outMax] = mapping.outputRange;

  // Guard against division by zero
  const inRange = inMax - inMin;
  if (inRange === 0) return outMin;

  const t = Math.max(0, Math.min(1, (raw - inMin) / inRange));

  switch (mapping.fn) {
    case "lerp":
      return outMin + t * (outMax - outMin);

    case "clamp":
      return Math.max(outMin, Math.min(outMax, raw));

    case "step":
      return t >= 0.5 ? outMax : outMin;

    case "smoothstep": {
      const s = t * t * (3 - 2 * t);
      return outMin + s * (outMax - outMin);
    }

    default:
      // Unknown fn — fallback to lerp
      return outMin + t * (outMax - outMin);
  }
}

// ---------------------------------------------------------------------------
// When clause matching (local implementation)
// ---------------------------------------------------------------------------

/**
 * Evaluate a `when` clause against a signal.
 *
 * Mirrors `@sajou/core`'s matchesWhen() but operates on the Scene Builder's
 * local type definitions (WhenClauseDef, WhenConditionDef, WhenOperatorDef).
 *
 * - `undefined` → `true` (no filter = always match).
 * - Object → all entries must match (AND).
 * - Array → at least one entry must match (OR).
 */
function matchesWhen(
  when: WhenClauseDef | undefined,
  signal: { type: string; payload: Record<string, unknown> },
): boolean {
  if (when === undefined) return true;

  if (Array.isArray(when)) {
    const conditions = when as WhenConditionDef[];
    return conditions.length === 0 || conditions.some((c) => evaluateCondition(c, signal));
  }

  return evaluateCondition(when as WhenConditionDef, signal);
}

/** Evaluate a single condition (all path→operator entries AND-combined). */
function evaluateCondition(
  condition: WhenConditionDef,
  signal: { type: string; payload: Record<string, unknown> },
): boolean {
  for (const [path, operator] of Object.entries(condition)) {
    const value = resolveSignalPath(path, signal);
    if (!evaluateOperator(operator, value)) return false;
  }
  return true;
}

/** Resolve a signal path (e.g., "signal.content") to a value. */
function resolveSignalPath(
  path: string,
  signal: { type: string; payload: Record<string, unknown> },
): unknown {
  // Strip "signal." prefix if present
  const normalized = path.startsWith("signal.") ? path.slice(7) : path;

  if (normalized === "type") return signal.type;

  // Resolve against payload via dot-path
  return getByPath(signal.payload, normalized);
}

/** Dot-path resolver for nested objects. */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
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

/** Evaluate an operator against a resolved value. */
function evaluateOperator(operator: WhenOperatorDef, value: unknown): boolean {
  // not — negation
  if (operator.not !== undefined) {
    return !evaluateOperator(operator.not, value);
  }

  // exists
  if (operator.exists !== undefined) {
    const fieldExists = value !== null && value !== undefined;
    if (!(operator.exists ? fieldExists : !fieldExists)) return false;
  }

  // equals
  if (operator.equals !== undefined) {
    if (value !== operator.equals) return false;
  }

  // contains
  if (operator.contains !== undefined) {
    if (typeof value !== "string" || !value.includes(operator.contains)) return false;
  }

  // matches
  if (operator.matches !== undefined) {
    if (typeof value !== "string") return false;
    try {
      if (!new RegExp(operator.matches).test(value)) return false;
    } catch {
      return false;
    }
  }

  // gt
  if (operator.gt !== undefined) {
    if (typeof value !== "number" || value <= operator.gt) return false;
  }

  // lt
  if (operator.lt !== undefined) {
    if (typeof value !== "number" || value >= operator.lt) return false;
  }

  return true;
}
