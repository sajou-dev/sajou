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

/** Input ranges for each MIDI payload field. */
export const MIDI_RANGES: Record<string, [number, number]> = {
  velocity: [0, 127],
  note: [0, 127],
  value: [0, 127],
  controller: [0, 127],
  program: [0, 127],
  channel: [1, 16],
  pitch_bend_value: [-8192, 8191],
};

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
    { field: "pitch_bend_value", label: "Value" },
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
  _signalType: string,
  sourceField: string,
  targetProperty: string,
): BindingMapping | undefined {
  const inputRange = MIDI_RANGES[sourceField];
  if (!inputRange) return undefined;

  const outputRange = TARGET_RANGES[targetProperty];
  if (!outputRange) return undefined;

  return {
    fn: "lerp",
    inputRange,
    outputRange,
  };
}
