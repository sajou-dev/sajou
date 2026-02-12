/**
 * Wiring queries — derived lookups for the wire graph.
 *
 * Combines wiring-state and choreography-state to resolve effective
 * inputs, active signal types, and source provenance for choreographies.
 *
 * Wire-driven model:
 *   - If signal-type→choreographer wires exist for a choreo, those are authoritative.
 *   - If no wires target a choreo, its `on` field is used as fallback.
 */

import {
  getWiresTo,
  getWiresBetween,
} from "./wiring-state.js";
import { getChoreographyState } from "./choreography-state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Effective input info for a single choreography. */
export interface ChoreoInputInfo {
  /** Signal types derived from wires (authoritative when non-empty). */
  wiredTypes: string[];
  /** The `on` field value (fallback/bootstrap). */
  defaultType: string;
  /** Whether this choreo has any signal-type→choreographer wires. */
  hasWires: boolean;
  /** Effective trigger types: wiredTypes if hasWires, else [defaultType]. */
  effectiveTypes: string[];
}

/** A source→signal-type provenance entry. */
export interface SourceProvenance {
  sourceId: string;
  signalType: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Resolve input info for a single choreography by ID.
 *
 * Checks signal-type→choreographer wires targeting this choreo.
 * Falls back to the choreography's `on` field when no wires exist.
 */
export function getChoreoInputInfo(choreoId: string): ChoreoInputInfo {
  const { choreographies } = getChoreographyState();
  const choreo = choreographies.find((c) => c.id === choreoId);
  const defaultType = choreo?.on ?? "error";

  const wiresTo = getWiresTo("choreographer");
  const incoming = wiresTo.filter((w) => w.toId === choreoId && w.fromZone === "signal-type");
  const wiredTypes = [...new Set(incoming.map((w) => w.fromId))];

  const hasWires = wiredTypes.length > 0;
  const effectiveTypes = hasWires ? wiredTypes : [defaultType];

  return { wiredTypes, defaultType, hasWires, effectiveTypes };
}

/**
 * Resolve the full set of active signal types across all choreographies.
 *
 * A signal type is "active" if at least one choreography is triggered by it
 * (either via wire or via the `on` fallback).
 */
export function getAllActiveSignalTypes(): Set<string> {
  const { choreographies } = getChoreographyState();
  const result = new Set<string>();

  for (const choreo of choreographies) {
    const info = getChoreoInputInfo(choreo.id);
    for (const t of info.effectiveTypes) {
      result.add(t);
    }
  }

  return result;
}

/**
 * Resolve source provenance for a choreography.
 *
 * Two-hop resolution:
 *   1. Find signal-type→choreographer wires targeting this choreo (gives signal types).
 *   2. For each signal type, find signal→signal-type wires (gives source IDs).
 *
 * Returns an array of { sourceId, signalType } pairs.
 * If no signal→signal-type wires exist for a type, that type is omitted.
 */
export function getSourcesForChoreo(choreoId: string): SourceProvenance[] {
  const info = getChoreoInputInfo(choreoId);
  const result: SourceProvenance[] = [];

  // Find all signal→signal-type wires
  const signalToType = getWiresBetween("signal", "signal-type");

  for (const signalType of info.effectiveTypes) {
    const sources = signalToType.filter((w) => w.toId === signalType);
    for (const wire of sources) {
      result.push({ sourceId: wire.fromId, signalType });
    }
  }

  return result;
}
