/**
 * Factory for building SignalEnvelope objects with tap-specific defaults.
 *
 * Generates UUID-based IDs prefixed with `tap-` and uses `adapter:tap` as
 * the default source.
 */

import { randomUUID } from "node:crypto";
import type {
  WellKnownSignalType,
  SignalEnvelope,
  SignalPayloadMap,
} from "@sajou/schema";

/** Default source identifier for signals created by tap. */
const DEFAULT_SOURCE = "adapter:tap";

/**
 * Creates a typed signal envelope with tap defaults.
 *
 * @param type - The signal type discriminator
 * @param payload - The typed payload for this signal type
 * @param options - Optional envelope fields (source, correlationId, metadata)
 * @returns A fully formed SignalEnvelope
 */
export function createTapSignal<T extends WellKnownSignalType>(
  type: T,
  payload: SignalPayloadMap[T],
  options?: {
    source?: string;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  },
): SignalEnvelope<T> {
  return {
    id: `tap-${randomUUID()}`,
    type,
    timestamp: Date.now(),
    source: options?.source ?? DEFAULT_SOURCE,
    correlationId: options?.correlationId,
    metadata: options?.metadata,
    payload,
  } as SignalEnvelope<T>;
}
