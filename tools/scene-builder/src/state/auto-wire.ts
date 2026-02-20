/**
 * Auto-wire module.
 *
 * Automatically creates `signal → signal-type` wires for connected sources
 * so that imported choreographies "just work" without manual re-wiring.
 *
 * Two entry points:
 *   - `autoWireConnectedSources()` — one-shot, called after import
 *   - `initAutoWire()` — subscribes to source state, wires on connect transitions
 */

import { getSignalSourcesState, subscribeSignalSources } from "./signal-source-state.js";
import { getWiringState, hasWire, addWire } from "./wiring-state.js";
import { getChoreographyState } from "./choreography-state.js";
import type { ConnectionStatus } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect all signal types that are actively used by choreographies.
 * A signal type is "active" if at least one `signal-type → choreographer` wire
 * targets it, OR if a choreography declares it via its `on` field.
 */
function getAllActiveSignalTypes(): Set<string> {
  const types = new Set<string>();

  // 1. Explicit wires: signal-type → choreographer
  const { wires } = getWiringState();
  for (const w of wires) {
    if (w.fromZone === "signal-type" && w.toZone === "choreographer") {
      types.add(w.fromId);
    }
  }

  // 2. Implicit triggers from choreography `on` field (fallback when no wire exists)
  const { choreographies } = getChoreographyState();
  for (const c of choreographies) {
    if (c.on) types.add(c.on);
  }

  return types;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create missing `signal → signal-type` wires for all connected sources
 * across all active signal types.
 *
 * Idempotent — skips any (source, signalType) pair that already has a wire.
 */
export function autoWireConnectedSources(): void {
  const signalTypes = getAllActiveSignalTypes();
  if (signalTypes.size === 0) return;

  const { sources } = getSignalSourcesState();
  const connected = sources.filter((s) => s.status === "connected");
  if (connected.length === 0) return;

  for (const source of connected) {
    for (const signalType of signalTypes) {
      if (!hasWire("signal", source.id, "signal-type", signalType)) {
        addWire({
          fromZone: "signal",
          fromId: source.id,
          toZone: "signal-type",
          toId: signalType,
        });
      }
    }
  }
}

/**
 * Subscribe to signal source state changes and auto-wire sources
 * that transition to "connected".
 *
 * Tracks previous status per source to detect real transitions
 * (avoids re-firing on unrelated state updates).
 */
export function initAutoWire(): void {
  const previousStatus = new Map<string, ConnectionStatus>();

  // Seed with current statuses
  const { sources } = getSignalSourcesState();
  for (const s of sources) {
    previousStatus.set(s.id, s.status);
  }

  subscribeSignalSources(() => {
    const { sources: currentSources } = getSignalSourcesState();
    const signalTypes = getAllActiveSignalTypes();
    if (signalTypes.size === 0) {
      // Update tracking even if no types exist yet
      for (const s of currentSources) previousStatus.set(s.id, s.status);
      return;
    }

    for (const source of currentSources) {
      const prev = previousStatus.get(source.id);
      previousStatus.set(source.id, source.status);

      // Only react to transitions *into* "connected"
      if (source.status === "connected" && prev !== "connected") {
        for (const signalType of signalTypes) {
          if (!hasWire("signal", source.id, "signal-type", signalType)) {
            addWire({
              fromZone: "signal",
              fromId: source.id,
              toZone: "signal-type",
              toId: signalType,
            });
          }
        }
      }
    }

    // Clean up tracking for removed sources
    const currentIds = new Set(currentSources.map((s) => s.id));
    for (const id of previousStatus.keys()) {
      if (!currentIds.has(id)) previousStatus.delete(id);
    }
  });
}
