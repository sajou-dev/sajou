/**
 * MIDI presets — input ranges, bindable fields, and mapping suggestions.
 *
 * Provides structural knowledge about MIDI signal payloads so that the
 * binding system can suggest sensible default mappings (e.g. CC value 0–127
 * mapped to opacity 0–1) instead of requiring manual range configuration.
 */

import type { BindingMapping } from "../types.js";

// ---------------------------------------------------------------------------
// Input ranges
// ---------------------------------------------------------------------------

/** Default input ranges for MIDI payload fields. */
const DEFAULT_RANGES: Record<string, [number, number]> = {
  velocity: [0, 127],
  note: [0, 127],
  value: [0, 127],
  controller: [0, 127],
  program: [0, 127],
  channel: [1, 16],
};

/** Per-signal-type range overrides (where a field has a different range). */
const TYPE_RANGE_OVERRIDES: Record<string, Record<string, [number, number]>> = {
  "midi.pitch_bend": {
    value: [-8192, 8191],
  },
};

/**
 * Get the input range for a MIDI field, taking signal type into account.
 *
 * Pitch bend `value` is [-8192, 8191] while CC `value` is [0, 127].
 * Returns `undefined` when no range is known for the field.
 */
export function getMidiRange(signalType: string, field: string): [number, number] | undefined {
  return TYPE_RANGE_OVERRIDES[signalType]?.[field] ?? DEFAULT_RANGES[field];
}

// ---------------------------------------------------------------------------
// Bindable fields per signal type
// ---------------------------------------------------------------------------

/** Field descriptor for the MIDI source field selector. */
export interface MidiFieldDescriptor {
  /** Payload field key. */
  field: string;
  /** Human-readable label. */
  label: string;
}

/** Bindable fields by MIDI signal type. */
export const MIDI_SOURCE_FIELDS: Record<string, MidiFieldDescriptor[]> = {
  "midi.note_on": [
    { field: "velocity", label: "Velocity" },
    { field: "note", label: "Note" },
    { field: "channel", label: "Channel" },
  ],
  "midi.note_off": [
    { field: "velocity", label: "Velocity" },
    { field: "note", label: "Note" },
    { field: "channel", label: "Channel" },
  ],
  "midi.control_change": [
    { field: "value", label: "Value" },
    { field: "controller", label: "Controller" },
    { field: "channel", label: "Channel" },
  ],
  "midi.pitch_bend": [
    { field: "value", label: "Pitch" },
    { field: "channel", label: "Channel" },
  ],
  "midi.program_change": [
    { field: "program", label: "Program" },
    { field: "channel", label: "Channel" },
  ],
};

// ---------------------------------------------------------------------------
// Output ranges by target property
// ---------------------------------------------------------------------------

/** Default output ranges for common bindable properties. */
const TARGET_RANGES: Record<string, [number, number]> = {
  opacity: [0, 1],
  rotation: [0, 360],
  scale: [0.1, 3],
};

// ---------------------------------------------------------------------------
// Mapping suggestion
// ---------------------------------------------------------------------------

/**
 * Suggest a mapping preset based on the MIDI signal type, source field,
 * and target entity property.
 *
 * Returns `undefined` when no sensible preset exists (e.g. channel → position.x
 * has no obvious default range).
 */
export function suggestMapping(
  signalType: string,
  sourceField: string,
  targetProperty: string,
): BindingMapping | undefined {
  const inputRange = getMidiRange(signalType, sourceField);
  if (!inputRange) return undefined;

  const outputRange = TARGET_RANGES[targetProperty];
  if (!outputRange) return undefined;

  return {
    fn: "lerp",
    inputRange,
    outputRange,
  };
}
