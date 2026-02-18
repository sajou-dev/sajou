/**
 * Unit tests for MIDI presets — input ranges, field descriptors, and mapping suggestions.
 */

import { describe, it, expect } from "vitest";
import {
  getMidiRange,
  suggestMapping,
  MIDI_SOURCE_FIELDS,
} from "./midi-presets.js";

// ---------------------------------------------------------------------------
// getMidiRange
// ---------------------------------------------------------------------------

describe("getMidiRange", () => {
  it("returns [0, 127] for CC value", () => {
    expect(getMidiRange("midi.control_change", "value")).toEqual([0, 127]);
  });

  it("returns [-8192, 8191] for pitch bend value", () => {
    expect(getMidiRange("midi.pitch_bend", "value")).toEqual([-8192, 8191]);
  });

  it("returns [0, 127] for note_on velocity", () => {
    expect(getMidiRange("midi.note_on", "velocity")).toEqual([0, 127]);
  });

  it("returns undefined for unknown field", () => {
    expect(getMidiRange("midi.control_change", "nonexistent")).toBeUndefined();
  });

  it("falls back to defaults for unknown signal type", () => {
    expect(getMidiRange("midi.unknown", "velocity")).toEqual([0, 127]);
  });
});

// ---------------------------------------------------------------------------
// MIDI_SOURCE_FIELDS — field name contract
// ---------------------------------------------------------------------------

describe("MIDI_SOURCE_FIELDS", () => {
  it("pitch_bend first field is 'value', not 'pitch_bend_value'", () => {
    const fields = MIDI_SOURCE_FIELDS["midi.pitch_bend"];
    expect(fields).toBeDefined();
    expect(fields![0]!.field).toBe("value");
    expect(fields![0]!.label).toBe("Pitch");
  });
});

// ---------------------------------------------------------------------------
// suggestMapping
// ---------------------------------------------------------------------------

describe("suggestMapping", () => {
  it("suggests pitch bend → opacity with correct input range", () => {
    const mapping = suggestMapping("midi.pitch_bend", "value", "opacity");
    expect(mapping).toBeDefined();
    expect(mapping!.inputRange).toEqual([-8192, 8191]);
    expect(mapping!.outputRange).toEqual([0, 1]);
    expect(mapping!.fn).toBe("lerp");
  });

  it("suggests CC → opacity with correct input range", () => {
    const mapping = suggestMapping("midi.control_change", "value", "opacity");
    expect(mapping).toBeDefined();
    expect(mapping!.inputRange).toEqual([0, 127]);
    expect(mapping!.outputRange).toEqual([0, 1]);
  });

  it("returns undefined for unknown target property", () => {
    expect(suggestMapping("midi.control_change", "value", "color")).toBeUndefined();
  });

  it("returns undefined for unknown source field", () => {
    expect(suggestMapping("midi.note_on", "nonexistent", "opacity")).toBeUndefined();
  });
});
