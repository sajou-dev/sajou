/**
 * MIDI device discovery — browser-side.
 *
 * Converts Web MIDI API `MIDIInput` ports into `DiscoveredService[]`
 * entries compatible with `upsertLocalSources()`.
 *
 * On macOS, network MIDI sessions (Audio MIDI Setup → Network)
 * appear as virtual ports, so this single implementation covers
 * both USB hardware and RTP-MIDI / MIDI-net devices.
 */

import type { DiscoveredService } from "../state/signal-source-state.js";
import { getMIDIAccess, getMIDIInputs, onMIDIDeviceChange } from "./midi-access.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover all available MIDI input ports and return them as
 * `DiscoveredService[]` entries for `upsertLocalSources()`.
 *
 * Requests MIDI access on first call (may trigger a browser permission prompt).
 */
export async function discoverMIDIDevices(): Promise<DiscoveredService[]> {
  const access = await getMIDIAccess();
  if (!access) return [];

  const inputs = getMIDIInputs();
  return inputs.map((input) => ({
    id: `local:midi:${input.id}`,
    label: input.name || "MIDI Device",
    protocol: "midi" as DiscoveredService["protocol"],
    url: buildMIDIUrl(input),
    available: input.state === "connected",
  }));
}

/**
 * Register a hot-plug callback that fires when MIDI devices are
 * plugged/unplugged. Calls `callback()` so the caller can trigger
 * a rescan.
 *
 * Returns an unsubscribe function.
 */
export function registerMIDIHotPlug(callback: () => void): () => void {
  return onMIDIDeviceChange(() => {
    callback();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a pseudo-URL for a MIDI port.
 *
 * Format: `midi://<manufacturer>/<name>/<portId>`
 *
 * Not a real network URL — used as a unique, human-readable identifier
 * in the signal source system.
 */
function buildMIDIUrl(input: MIDIInput): string {
  const manufacturer = encodeURIComponent(input.manufacturer || "unknown");
  const name = encodeURIComponent(input.name || "unnamed");
  const portId = encodeURIComponent(input.id);
  return `midi://${manufacturer}/${name}/${portId}`;
}

/**
 * Extract the port ID from a MIDI pseudo-URL.
 *
 * @example extractPortId("midi://Roland/A-88/abc123") → "abc123"
 */
export function extractPortId(url: string): string | null {
  if (!url.startsWith("midi://")) return null;
  const parts = url.slice(7).split("/");
  if (parts.length < 3) return null;
  return decodeURIComponent(parts[parts.length - 1]!);
}
