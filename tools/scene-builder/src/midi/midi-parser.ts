/**
 * Pure MIDI message parser — bytes → sajou signal.
 *
 * Parses a raw MIDI message (Uint8Array, typically 2–3 bytes) into
 * a `ParsedSignal` compatible with the scene-builder signal bus.
 *
 * Same pattern as `signal-parser-openclaw.ts` — pure functions,
 * unit-testable without DOM or Web MIDI API.
 */

import type { ParsedSignal } from "../simulator/signal-parser.js";
import { generateId } from "../simulator/signal-parser.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** MIDI status byte masks. */
const STATUS_NOTE_OFF = 0x80;
const STATUS_NOTE_ON = 0x90;
const STATUS_CONTROL_CHANGE = 0xB0;
const STATUS_PROGRAM_CHANGE = 0xC0;
const STATUS_PITCH_BEND = 0xE0;

/** All MIDI signal type strings emitted by this parser. */
export const MIDI_SIGNAL_TYPES = {
  noteOn: "midi.note_on",
  noteOff: "midi.note_off",
  controlChange: "midi.control_change",
  pitchBend: "midi.pitch_bend",
  programChange: "midi.program_change",
} as const;

/** Flat set of all MIDI signal type strings (for KNOWN_TYPES registration). */
export const ALL_MIDI_TYPES: readonly string[] = Object.values(MIDI_SIGNAL_TYPES);

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a raw MIDI message into a sajou signal.
 *
 * @param data — Raw MIDI bytes (from `MIDIMessageEvent.data`).
 * @param deviceName — Human-readable device name (used as signal `source`).
 * @returns A `ParsedSignal` or `null` if the message is unsupported (system messages, etc.).
 */
export function parseMIDIMessage(data: Uint8Array, deviceName: string): ParsedSignal | null {
  if (!data || data.length < 1) return null;

  const status = data[0]!;

  // System messages (0xF0–0xFF) — not supported yet
  if (status >= 0xF0) return null;

  const command = status & 0xF0;
  // MIDI channels are 0-indexed in the wire format; we expose 1-indexed (1–16)
  const channel = (status & 0x0F) + 1;
  const raw = Array.from(data);

  switch (command) {
    case STATUS_NOTE_ON: {
      if (data.length < 3) return null;
      const note = data[1]!;
      const velocity = data[2]!;
      // NoteOn with velocity 0 is equivalent to NoteOff
      if (velocity === 0) {
        return {
          id: generateId(),
          type: MIDI_SIGNAL_TYPES.noteOff,
          timestamp: Date.now(),
          source: deviceName,
          payload: { channel, note, velocity: 0, raw },
        };
      }
      return {
        id: generateId(),
        type: MIDI_SIGNAL_TYPES.noteOn,
        timestamp: Date.now(),
        source: deviceName,
        payload: { channel, note, velocity, raw },
      };
    }

    case STATUS_NOTE_OFF: {
      if (data.length < 3) return null;
      const note = data[1]!;
      const velocity = data[2]!;
      return {
        id: generateId(),
        type: MIDI_SIGNAL_TYPES.noteOff,
        timestamp: Date.now(),
        source: deviceName,
        payload: { channel, note, velocity, raw },
      };
    }

    case STATUS_CONTROL_CHANGE: {
      if (data.length < 3) return null;
      const controller = data[1]!;
      const value = data[2]!;
      return {
        id: generateId(),
        type: MIDI_SIGNAL_TYPES.controlChange,
        timestamp: Date.now(),
        source: deviceName,
        payload: { channel, controller, value, raw },
      };
    }

    case STATUS_PROGRAM_CHANGE: {
      if (data.length < 2) return null;
      const program = data[1]!;
      return {
        id: generateId(),
        type: MIDI_SIGNAL_TYPES.programChange,
        timestamp: Date.now(),
        source: deviceName,
        payload: { channel, program, raw },
      };
    }

    case STATUS_PITCH_BEND: {
      if (data.length < 3) return null;
      const lsb = data[1]!;
      const msb = data[2]!;
      // 14-bit value centered at 8192 → range -8192..+8191
      const value = ((msb << 7) | lsb) - 8192;
      return {
        id: generateId(),
        type: MIDI_SIGNAL_TYPES.pitchBend,
        timestamp: Date.now(),
        source: deviceName,
        payload: { channel, value, raw },
      };
    }

    default:
      // Channel aftertouch (0xA0, 0xD0) and other messages — not supported yet
      return null;
  }
}
