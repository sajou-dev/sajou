/**
 * Unit tests for the MIDI parser.
 *
 * Tests parse raw MIDI bytes into sajou signal payloads.
 * Uses the same deterministic ID reset pattern as signal-parser-openclaw.test.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { parseMIDIMessage, MIDI_SIGNAL_TYPES } from "./midi-parser.js";
import { resetIdCounter } from "../simulator/signal-parser.js";

beforeEach(() => {
  resetIdCounter();
});

describe("parseMIDIMessage", () => {
  // -------------------------------------------------------------------
  // Note On
  // -------------------------------------------------------------------

  it("parses NoteOn (channel 1, note 60, velocity 100)", () => {
    const data = new Uint8Array([0x90, 60, 100]);
    const result = parseMIDIMessage(data, "Test Device");

    expect(result).not.toBeNull();
    expect(result!.type).toBe(MIDI_SIGNAL_TYPES.noteOn);
    expect(result!.source).toBe("Test Device");
    expect(result!.payload).toEqual({
      channel: 1,
      note: 60,
      velocity: 100,
      raw: [0x90, 60, 100],
    });
  });

  // -------------------------------------------------------------------
  // Note On with velocity 0 → Note Off
  // -------------------------------------------------------------------

  it("converts NoteOn with velocity 0 to NoteOff", () => {
    const data = new Uint8Array([0x90, 64, 0]);
    const result = parseMIDIMessage(data, "Test Device");

    expect(result).not.toBeNull();
    expect(result!.type).toBe(MIDI_SIGNAL_TYPES.noteOff);
    expect(result!.payload).toEqual({
      channel: 1,
      note: 64,
      velocity: 0,
      raw: [0x90, 64, 0],
    });
  });

  // -------------------------------------------------------------------
  // Note Off
  // -------------------------------------------------------------------

  it("parses NoteOff (channel 1, note 60, velocity 64)", () => {
    const data = new Uint8Array([0x80, 60, 64]);
    const result = parseMIDIMessage(data, "Test Device");

    expect(result).not.toBeNull();
    expect(result!.type).toBe(MIDI_SIGNAL_TYPES.noteOff);
    expect(result!.payload).toEqual({
      channel: 1,
      note: 60,
      velocity: 64,
      raw: [0x80, 60, 64],
    });
  });

  // -------------------------------------------------------------------
  // Control Change
  // -------------------------------------------------------------------

  it("parses Control Change (CC 7 = volume, value 127)", () => {
    const data = new Uint8Array([0xB0, 7, 127]);
    const result = parseMIDIMessage(data, "Controller");

    expect(result).not.toBeNull();
    expect(result!.type).toBe(MIDI_SIGNAL_TYPES.controlChange);
    expect(result!.payload).toEqual({
      channel: 1,
      controller: 7,
      value: 127,
      raw: [0xB0, 7, 127],
    });
  });

  // -------------------------------------------------------------------
  // Pitch Bend — center
  // -------------------------------------------------------------------

  it("parses Pitch Bend at center position (value = 0)", () => {
    // Center = 8192 → LSB=0x00, MSB=0x40
    const data = new Uint8Array([0xE0, 0x00, 0x40]);
    const result = parseMIDIMessage(data, "Keys");

    expect(result).not.toBeNull();
    expect(result!.type).toBe(MIDI_SIGNAL_TYPES.pitchBend);
    expect(result!.payload["value"]).toBe(0);
    expect(result!.payload["channel"]).toBe(1);
  });

  // -------------------------------------------------------------------
  // Pitch Bend — max up
  // -------------------------------------------------------------------

  it("parses Pitch Bend at max up (value = +8191)", () => {
    // Max = 16383 → LSB=0x7F, MSB=0x7F
    const data = new Uint8Array([0xE0, 0x7F, 0x7F]);
    const result = parseMIDIMessage(data, "Keys");

    expect(result).not.toBeNull();
    expect(result!.type).toBe(MIDI_SIGNAL_TYPES.pitchBend);
    expect(result!.payload["value"]).toBe(8191);
  });

  // -------------------------------------------------------------------
  // Pitch Bend — max down
  // -------------------------------------------------------------------

  it("parses Pitch Bend at max down (value = -8192)", () => {
    // Min = 0 → LSB=0x00, MSB=0x00
    const data = new Uint8Array([0xE0, 0x00, 0x00]);
    const result = parseMIDIMessage(data, "Keys");

    expect(result).not.toBeNull();
    expect(result!.type).toBe(MIDI_SIGNAL_TYPES.pitchBend);
    expect(result!.payload["value"]).toBe(-8192);
  });

  // -------------------------------------------------------------------
  // Program Change
  // -------------------------------------------------------------------

  it("parses Program Change (program 42)", () => {
    const data = new Uint8Array([0xC0, 42]);
    const result = parseMIDIMessage(data, "Synth");

    expect(result).not.toBeNull();
    expect(result!.type).toBe(MIDI_SIGNAL_TYPES.programChange);
    expect(result!.payload).toEqual({
      channel: 1,
      program: 42,
      raw: [0xC0, 42],
    });
  });

  // -------------------------------------------------------------------
  // Channel 10 (drums) — 0-indexed channel 9
  // -------------------------------------------------------------------

  it("parses NoteOn on channel 10 (drums)", () => {
    // Channel 10 = 0-indexed 9 → status byte = 0x99
    const data = new Uint8Array([0x99, 36, 110]);
    const result = parseMIDIMessage(data, "Drums");

    expect(result).not.toBeNull();
    expect(result!.type).toBe(MIDI_SIGNAL_TYPES.noteOn);
    expect(result!.payload["channel"]).toBe(10);
    expect(result!.payload["note"]).toBe(36);
    expect(result!.payload["velocity"]).toBe(110);
  });

  // -------------------------------------------------------------------
  // System messages → null
  // -------------------------------------------------------------------

  it("returns null for system messages (SysEx, Clock, etc.)", () => {
    // SysEx start
    expect(parseMIDIMessage(new Uint8Array([0xF0, 0x7E, 0xF7]), "Dev")).toBeNull();
    // Timing Clock
    expect(parseMIDIMessage(new Uint8Array([0xF8]), "Dev")).toBeNull();
    // Active Sensing
    expect(parseMIDIMessage(new Uint8Array([0xFE]), "Dev")).toBeNull();
  });

  // -------------------------------------------------------------------
  // Empty / null data → null
  // -------------------------------------------------------------------

  it("returns null for empty data", () => {
    expect(parseMIDIMessage(new Uint8Array([]), "Dev")).toBeNull();
  });

  it("returns null for insufficient bytes (NoteOn needs 3)", () => {
    // NoteOn status but only 2 bytes
    expect(parseMIDIMessage(new Uint8Array([0x90, 60]), "Dev")).toBeNull();
  });

  // -------------------------------------------------------------------
  // Raw bytes preservation
  // -------------------------------------------------------------------

  it("preserves original raw bytes in the payload", () => {
    const data = new Uint8Array([0xB3, 1, 64]);
    const result = parseMIDIMessage(data, "Mod Wheel");

    expect(result).not.toBeNull();
    expect(result!.payload["raw"]).toEqual([0xB3, 1, 64]);
    // Channel 4 (0-indexed 3)
    expect(result!.payload["channel"]).toBe(4);
  });

  // -------------------------------------------------------------------
  // Contract: pitch bend uses "value", not "pitch_bend_value"
  // -------------------------------------------------------------------

  it("pitch bend payload field is 'value', not 'pitch_bend_value'", () => {
    const data = new Uint8Array([0xE0, 0x00, 0x40]);
    const result = parseMIDIMessage(data, "Keys");

    expect(result).not.toBeNull();
    expect(result!.payload).toHaveProperty("value");
    expect(result!.payload).not.toHaveProperty("pitch_bend_value");
  });
});
