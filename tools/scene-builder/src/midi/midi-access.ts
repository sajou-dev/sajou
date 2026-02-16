/**
 * Web MIDI API access manager.
 *
 * Wraps `navigator.requestMIDIAccess()` with a singleton pattern:
 * the permission prompt is shown at most once, and the resulting
 * `MIDIAccess` object is cached for the lifetime of the page.
 *
 * Covers both USB hardware devices and macOS network MIDI sessions
 * (RTP-MIDI), which appear as virtual ports in the Web MIDI API.
 */

// ---------------------------------------------------------------------------
// Module state (singleton)
// ---------------------------------------------------------------------------

let cachedAccess: MIDIAccess | null = null;
let accessRequested = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Whether the browser supports the Web MIDI API. */
export function isMIDISupported(): boolean {
  return typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
}

/**
 * Request MIDI access (singleton — prompts the user at most once).
 *
 * Returns the `MIDIAccess` object or `null` if the API is unavailable
 * or the user denied access.
 */
export async function getMIDIAccess(): Promise<MIDIAccess | null> {
  if (cachedAccess) return cachedAccess;
  if (accessRequested) return null; // Already tried and failed
  if (!isMIDISupported()) return null;

  accessRequested = true;
  try {
    cachedAccess = await navigator.requestMIDIAccess({ sysex: false });
    return cachedAccess;
  } catch {
    return null;
  }
}

/** Return the list of currently available MIDI input ports. */
export function getMIDIInputs(): MIDIInput[] {
  if (!cachedAccess) return [];
  return Array.from(cachedAccess.inputs.values());
}

/**
 * Register a callback for MIDI device hot-plug events.
 *
 * Fires when a device is plugged/unplugged (or a network session
 * appears/disappears). Returns an unsubscribe function.
 */
export function onMIDIDeviceChange(callback: (event: Event) => void): () => void {
  if (!cachedAccess) return () => {};

  cachedAccess.addEventListener("statechange", callback);
  return () => {
    cachedAccess?.removeEventListener("statechange", callback);
  };
}
