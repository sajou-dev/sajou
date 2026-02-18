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
 *      - Execute the appropriate property change on **all** entities matching
 *        the target semantic ID (multi-instance fan-out)
 *
 * ```
 * Signal arrives
 *   ├──→ choreographer.handleSignal()     [steps: move, fly, flash…]
 *   └──→ bindingExecutor.handleSignal()   [bindings: animation.state, opacity…]
 *        └──→ resolveAllEntityIds(semanticId) → apply to every instance
 * ```
 *
 * Bindings support two modes:
 *   - **Instant**: immediate property assignment (MIDI, continuous values)
 *   - **Temporal**: smooth animation to a target value with easing and optional revert
 *     (AI event signals, triggers)
 */

import type {
  EntityBinding,
  BindingMapping,
  BindingTransition,
  WhenClauseDef,
  WhenConditionDef,
  WhenOperatorDef,
} from "../types.js";
import type { RenderAdapter, DisplayObjectHandle } from "../canvas/render-adapter.js";
import { getChoreographyState } from "../state/choreography-state.js";
import { getChoreoInputInfo } from "../state/wiring-queries.js";
import { getBindingsFromChoreography } from "../state/binding-store.js";
import { resolveEntityId, resolveAllEntityIds, resolvePosition } from "./run-mode-resolve.js";
import { switchAnimation } from "./run-mode-animator.js";
import { getSnapshot } from "./run-mode-state.js";

// ---------------------------------------------------------------------------
// Easing functions (local — no @sajou/core dependency)
// ---------------------------------------------------------------------------

/** Easing function: maps normalized time t (0→1) to progress (0→1). */
type EasingFn = (t: number) => number;

const EASING_FNS: Record<string, EasingFn> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  arc: (t) => Math.sin(t * Math.PI),
};

/** Resolve an easing name to its function. Falls back to linear. */
function resolveEasing(name: string): EasingFn {
  return EASING_FNS[name] ?? EASING_FNS["linear"]!;
}

// ---------------------------------------------------------------------------
// Active property animation state
// ---------------------------------------------------------------------------

/** A property animation currently in flight. */
interface ActivePropertyAnim {
  handle: DisplayObjectHandle;
  prop: "alpha" | "rotation" | "scale" | "x" | "y";
  fromValue: number;
  toValue: number;
  durationMs: number;
  easingFn: EasingFn;
  elapsed: number;
  revert?: { delayMs: number; originalValue: number };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Handle for a running binding executor. */
export interface BindingExecutor {
  /** Evaluate a signal against all choreography bindings and execute matches. */
  handleSignal(signal: { type: string; payload: Record<string, unknown> }): void;
  /** Advance all active property animations by dt milliseconds. */
  tick(dtMs: number): void;
  /** Clean up resources (cancel rAF, clear pending timeouts). */
  dispose(): void;
}

/**
 * Create a BindingExecutor that reads bindings from the binding-store
 * and executes them when matching signals arrive.
 *
 * Reads binding state lazily on each signal (not snapshotted at creation)
 * so that bindings added during run mode are immediately effective.
 *
 * Temporal animations are driven by an internal rAF loop started on
 * the first transition trigger and stopped when all animations complete
 * or on dispose().
 */
export function createBindingExecutor(adapter: RenderAdapter): BindingExecutor {
  let disposed = false;

  /** Active property animations keyed by `${placedId}:${prop}`. */
  const activeAnims = new Map<string, ActivePropertyAnim>();

  /** Pending revert timeout IDs for cleanup. */
  const pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();

  /** rAF handle for the animation tick loop. */
  let rafId: number | null = null;
  let lastTime = 0;

  /** Start the rAF tick loop if not already running. */
  function ensureTicking(): void {
    if (rafId !== null || disposed) return;
    lastTime = performance.now();
    rafId = requestAnimationFrame(tickLoop);
  }

  /** Internal rAF callback. */
  function tickLoop(now: number): void {
    if (disposed) return;
    const dt = now - lastTime;
    lastTime = now;

    tickAnims(dt, activeAnims, pendingTimeouts, adapter, ensureTicking);

    if (activeAnims.size > 0) {
      rafId = requestAnimationFrame(tickLoop);
    } else {
      rafId = null;
    }
  }

  return {
    handleSignal(signal) {
      if (disposed) return;

      const { choreographies } = getChoreographyState();

      for (const choreo of choreographies) {
        const bindings = getBindingsFromChoreography(choreo.id);
        if (bindings.length === 0) continue;

        const inputInfo = getChoreoInputInfo(choreo.id);
        if (!inputInfo.effectiveTypes.includes(signal.type)) continue;

        if (!matchesWhen(choreo.when, signal)) continue;

        for (const binding of bindings) {
          executeBinding(binding, signal, adapter, activeAnims, pendingTimeouts, ensureTicking);
        }
      }
    },

    tick(dtMs) {
      if (disposed) return;
      tickAnims(dtMs, activeAnims, pendingTimeouts, adapter, ensureTicking);
    },

    dispose() {
      disposed = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      activeAnims.clear();
      for (const tid of pendingTimeouts) clearTimeout(tid);
      pendingTimeouts.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Binding execution
// ---------------------------------------------------------------------------

/** Map binding property names to handle property names. */
const PROP_TO_HANDLE: Record<string, "alpha" | "rotation" | "scale" | "x" | "y"> = {
  opacity: "alpha",
  rotation: "rotation",
  scale: "scale",
  "position.x": "x",
  "position.y": "y",
};

/**
 * Execute a single binding against a matched signal.
 *
 * **Multi-instance:** when multiple placed entities share the same
 * `targetEntityId` (semantic ID), the binding is applied to every
 * matching instance.
 */
function executeBinding(
  binding: EntityBinding,
  signal: { type: string; payload: Record<string, unknown> },
  adapter: RenderAdapter,
  activeAnims: Map<string, ActivePropertyAnim>,
  pendingTimeouts: Set<ReturnType<typeof setTimeout>>,
  ensureTicking: () => void,
): void {
  const placedIds = resolveAllEntityIds(binding.targetEntityId);
  if (placedIds.length === 0) {
    console.warn(`[bindings] Target entity not found: ${binding.targetEntityId}`);
    return;
  }

  for (const placedId of placedIds) {
    const handleProp = PROP_TO_HANDLE[binding.property];

    // Continuous value path — sourceField present → live value from payload
    if (handleProp && binding.sourceField) {
      executeValueBinding(placedId, binding, signal, handleProp, adapter);
      continue;
    }

    // Temporal transition path — event-driven with fixed target value
    if (binding.transition && handleProp) {
      startTransition(
        placedId, handleProp, binding.transition,
        adapter, activeAnims, pendingTimeouts, ensureTicking,
      );
      continue;
    }

    // Instant path (backward compatible)
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
  const raw = extractNumericValue(signal.payload, binding.property, binding.sourceField);
  if (raw === null) {
    console.warn(`[bindings] No numeric value found in payload for ${binding.sourceField ?? binding.property}`);
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
// Temporal animation engine
// ---------------------------------------------------------------------------

/** Read a property value from a handle. */
function readHandleProp(handle: DisplayObjectHandle, prop: "alpha" | "rotation" | "scale" | "x" | "y"): number {
  if (prop === "scale") return handle.scale.x;
  return handle[prop];
}

/** Write a property value to a handle. */
function writeHandleProp(handle: DisplayObjectHandle, prop: "alpha" | "rotation" | "scale" | "x" | "y", value: number): void {
  if (prop === "scale") {
    handle.scale.set(value);
  } else {
    handle[prop] = value;
  }
}

/** Look up the snapshot original value for a placed entity + property. */
function getSnapshotValue(placedId: string, prop: "alpha" | "rotation" | "scale" | "x" | "y"): number | null {
  const snapshots = getSnapshot();
  if (!snapshots) return null;
  const snap = snapshots.find((s) => s.id === placedId);
  if (!snap) return null;

  switch (prop) {
    case "alpha": return snap.opacity;
    case "rotation": return snap.rotation;
    case "scale": return snap.scale;
    case "x": return snap.x;
    case "y": return snap.y;
  }
}

/** Start a temporal transition animation on a property. */
function startTransition(
  placedId: string,
  prop: "alpha" | "rotation" | "scale" | "x" | "y",
  transition: BindingTransition,
  adapter: RenderAdapter,
  activeAnims: Map<string, ActivePropertyAnim>,
  pendingTimeouts: Set<ReturnType<typeof setTimeout>>,
  ensureTicking: () => void,
): void {
  const handle = adapter.getHandle(placedId);
  if (!handle) return;

  const key = `${placedId}:${prop}`;

  // Read current value from handle (supports smooth interruption)
  const fromValue = readHandleProp(handle, prop);

  // Determine original value for revert (from snapshot, or current if no snapshot)
  const originalValue = getSnapshotValue(placedId, prop) ?? fromValue;

  const anim: ActivePropertyAnim = {
    handle,
    prop,
    fromValue,
    toValue: transition.targetValue,
    durationMs: transition.durationMs,
    easingFn: resolveEasing(transition.easing),
    elapsed: 0,
    ...(transition.revert ? { revert: { delayMs: transition.revertDelayMs, originalValue } } : {}),
  };

  // Interrupt any existing animation on the same key
  activeAnims.set(key, anim);
  ensureTicking();

  console.log(`[bindings] ${placedId} → ${prop}: ${fromValue} → ${transition.targetValue} (${transition.durationMs}ms ${transition.easing})`);
}

/** Advance all active property animations by dt milliseconds. */
function tickAnims(
  dtMs: number,
  activeAnims: Map<string, ActivePropertyAnim>,
  pendingTimeouts: Set<ReturnType<typeof setTimeout>>,
  adapter: RenderAdapter,
  ensureTicking: () => void,
): void {
  const completed: string[] = [];

  for (const [key, anim] of activeAnims) {
    anim.elapsed += dtMs;
    const t = Math.min(1, anim.elapsed / anim.durationMs);
    const progress = anim.easingFn(t);
    const value = anim.fromValue + (anim.toValue - anim.fromValue) * progress;

    writeHandleProp(anim.handle, anim.prop, value);

    if (t >= 1) {
      // Snap to final value
      writeHandleProp(anim.handle, anim.prop, anim.toValue);
      completed.push(key);

      // Schedule revert if configured
      if (anim.revert) {
        const { delayMs, originalValue } = anim.revert;
        const placedId = key.split(":")[0]!;
        const prop = anim.prop;
        const handle = anim.handle;

        const tid = setTimeout(() => {
          pendingTimeouts.delete(tid);

          // Start a revert animation back to original
          const currentValue = readHandleProp(handle, prop);
          const revertAnim: ActivePropertyAnim = {
            handle,
            prop,
            fromValue: currentValue,
            toValue: originalValue,
            durationMs: anim.durationMs,
            easingFn: anim.easingFn,
            elapsed: 0,
          };
          activeAnims.set(`${placedId}:${prop}`, revertAnim);
          ensureTicking();

          console.log(`[bindings] ${placedId} → ${prop}: revert to ${originalValue}`);
        }, delayMs);

        pendingTimeouts.add(tid);
      }
    }
  }

  for (const key of completed) {
    activeAnims.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Value extraction and mapping
// ---------------------------------------------------------------------------

/**
 * Extract a numeric value from the signal payload.
 *
 * Strategy:
 *   0. Explicit sourceField (e.g. "velocity") → payload[sourceField]
 *   1. Try the binding property as a path (e.g., "opacity" → payload.opacity)
 *   2. Try "value" as a conventional field
 *   3. Find the first numeric field in the payload
 */
function extractNumericValue(
  payload: Record<string, unknown>,
  bindingProperty: string,
  sourceField?: string,
): number | null {
  // Strategy 0: explicit source field from binding
  if (sourceField && typeof payload[sourceField] === "number") {
    return payload[sourceField] as number;
  }

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

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

export const __test__ = {
  EASING_FNS,
  resolveEasing,
  readHandleProp,
  writeHandleProp,
  tickAnims,
  extractNumericValue,
  applyMapping,
} as const;
