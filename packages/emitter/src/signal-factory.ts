/**
 * Factory helpers to build well-typed SignalEvent objects.
 *
 * Generates auto-incrementing IDs and captures timestamps.
 * Used by scenarios to construct signal sequences.
 */

import type {
  WellKnownSignalType,
  SignalEnvelope,
  SignalPayloadMap,
} from "@sajou/schema";

let counter = 0;

/** Resets the signal ID counter. Useful for tests. */
export function resetCounter(): void {
  counter = 0;
}

/**
 * Creates a typed signal envelope.
 *
 * @param type - The signal type discriminator
 * @param payload - The typed payload for this signal type
 * @param options - Optional envelope fields (source, correlationId, metadata)
 * @returns A fully formed SignalEnvelope
 *
 * @example
 * ```ts
 * const signal = createSignal("task_dispatch", {
 *   taskId: "t-1",
 *   from: "orchestrator",
 *   to: "agent-solver",
 * });
 * ```
 */
export function createSignal<T extends WellKnownSignalType>(
  type: T,
  payload: SignalPayloadMap[T],
  options?: {
    source?: string;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  },
): SignalEnvelope<T> {
  counter++;
  // Cast is safe: T extends WellKnownSignalType ⊂ keyof SignalPayloadMap,
  // but TS cannot simplify the conditional type in a generic context.
  return {
    id: `sig-${String(counter).padStart(4, "0")}`,
    type,
    timestamp: Date.now(),
    source: options?.source ?? "adapter:emitter",
    correlationId: options?.correlationId,
    metadata: options?.metadata,
    payload,
  } as SignalEnvelope<T>;
}
