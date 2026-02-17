/**
 * Local service discovery client.
 *
 * Calls the Vite dev server's `GET /api/discover/local` endpoint to probe
 * for known local services (Claude Code, OpenClaw, LM Studio, Ollama).
 * Results are synced into the signal-source-state store as local sources.
 *
 * For OpenClaw, also fetches the gateway auth token from the local config
 * file via `GET /api/openclaw/token` and pre-fills the API key.
 */

import type { TransportProtocol } from "../types.js";
import type { DiscoveredService } from "./signal-source-state.js";
import { upsertLocalSources, getSource, updateSource } from "./signal-source-state.js";
import { discoverMIDIDevices, registerMIDIHotPlug } from "../midi/midi-discovery.js";
import { connectLocalSSE } from "../views/signal-connection.js";

/** Raw service descriptor from the discovery endpoint. */
interface DiscoveryResponse {
  services: Array<{
    id: string;
    label: string;
    protocol: string;
    url: string;
    available: boolean;
    needsApiKey?: boolean;
    models: string[];
  }>;
}

/** Probe the Vite dev server's discovery endpoint. */
export async function discoverLocalServices(): Promise<DiscoveredService[]> {
  try {
    const resp = await fetch("/api/discover/local", {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return [];
    const json = (await resp.json()) as DiscoveryResponse;
    return json.services.map((s) => ({
      id: s.id,
      label: s.label,
      protocol: s.protocol as TransportProtocol,
      url: s.url,
      available: s.available,
      needsApiKey: s.needsApiKey,
      models: s.models,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch the OpenClaw gateway auth token from the Vite dev server.
 * Returns the token string or null if unavailable.
 */
export async function fetchOpenClawToken(): Promise<string | null> {
  try {
    const resp = await fetch("/api/openclaw/token", {
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { ok: boolean; token?: string };
    return json.ok ? (json.token ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Run discovery, sync results into signal source state,
 * and auto-fill the OpenClaw token if available and not already set.
 *
 * Probes server-side services (Claude Code, OpenClaw, LM Studio, Ollama)
 * and browser-side MIDI devices in parallel.
 */
export async function scanAndSyncLocal(): Promise<void> {
  const [serverServices, midiServices] = await Promise.all([
    discoverLocalServices(),
    discoverMIDIDevices(),
  ]);
  const services = [...serverServices, ...midiServices];
  upsertLocalSources(services);

  // Auto-fill OpenClaw token if the source exists, is available, and has no key yet
  const openclawService = services.find((s) => s.id === "local:openclaw" && s.available);
  if (openclawService) {
    const source = getSource("local:openclaw");
    if (source && !source.apiKey) {
      const token = await fetchOpenClawToken();
      if (token) {
        updateSource("local:openclaw", { apiKey: token, tokenAutoFilled: true });
      }
    }
  }

  // Auto-connect Claude Code if available and not already connected
  const claudeService = services.find((s) => s.id === "local:claude-code" && s.available);
  if (claudeService) {
    const source = getSource("local:claude-code");
    if (source && source.status === "disconnected") {
      void connectLocalSSE(source.id);
    }
  }
}

/**
 * Wire up MIDI hot-plug events to trigger automatic rescans.
 *
 * When a MIDI device is plugged or unplugged, the browser fires a
 * `statechange` event on the `MIDIAccess` object. This function
 * connects that event to `scanAndSyncLocal()` so the source list
 * stays up-to-date without manual intervention.
 *
 * Returns an unsubscribe function. Call this once at init time.
 */
export function initMIDIHotPlug(): () => void {
  return registerMIDIHotPlug(() => {
    void scanAndSyncLocal();
  });
}
