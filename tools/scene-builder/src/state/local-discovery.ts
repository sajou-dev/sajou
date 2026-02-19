/**
 * Local service discovery — browser-side probing.
 *
 * Probes local services directly from the browser instead of relying on a
 * server-side endpoint. This works both in dev mode (Vite) and in production
 * (sajou.app static build).
 *
 * Services probed:
 * - Claude Code: relative SSE endpoint `/__signals__/stream` (dev mode only)
 * - OpenClaw: WebSocket probe on port 18789
 * - LM Studio: HTTP probe on port 1234 (`/v1/models`)
 * - Ollama: HTTP probe on port 11434 (`/v1/models`)
 * - MIDI: Web MIDI API (handled by midi-discovery.ts)
 *
 * For OpenClaw, also attempts to fetch the gateway auth token from the
 * dev server via `GET /api/openclaw/token` (silently fails in production).
 */

import type { TransportProtocol } from "../types.js";
import type { DiscoveredService } from "./signal-source-state.js";
import { upsertLocalSources, getSource, updateSource } from "./signal-source-state.js";
import { discoverMIDIDevices, registerMIDIHotPlug } from "../midi/midi-discovery.js";
import { connectLocalSSE, connectSource } from "../views/signal-connection.js";
import { platformFetch } from "../utils/platform-fetch.js";

/** Timeout for all local probes (ms). */
const PROBE_TIMEOUT = 800;

// ---------------------------------------------------------------------------
// Browser-side probes
// ---------------------------------------------------------------------------

/**
 * Probe an HTTP endpoint (LM Studio, Ollama) and extract model IDs.
 * Uses `no-cors` fallback if CORS headers are missing — in that case,
 * models list will be empty but availability is still detected.
 */
async function httpProbe(
  url: string,
  timeoutMs: number,
): Promise<{ ok: boolean; models: string[] }> {
  try {
    const resp = await platformFetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return { ok: false, models: [] };
    const json: unknown = await resp.json();
    const models: string[] = [];
    if (
      json !== null &&
      typeof json === "object" &&
      "data" in json &&
      Array.isArray((json as Record<string, unknown>).data)
    ) {
      for (const m of (json as { data: unknown[] }).data) {
        if (m !== null && typeof m === "object" && "id" in m) {
          models.push(String((m as { id: unknown }).id));
        }
      }
    }
    return { ok: true, models };
  } catch {
    return { ok: false, models: [] };
  }
}

/**
 * Probe a WebSocket endpoint by attempting to connect.
 * Resolves `true` if the connection opens, `false` on error or timeout.
 * The connection is closed immediately after detection.
 */
function wsProbe(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (result: boolean): void => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* already closed or never opened */
      }
      resolve(result);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
      ws.onopen = () => done(true);
      ws.onerror = () => done(false);
    } catch {
      done(false);
    }
  });
}

/**
 * Probe a relative endpoint (dev-server SSE stream).
 * Resolves `true` if the server returns 200, `false` otherwise.
 * The connection is aborted immediately after status check to avoid
 * keeping an SSE stream open.
 */
async function relativeProbe(
  path: string,
  timeoutMs: number,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(path, { signal: controller.signal });
    const ok = resp.ok;
    clearTimeout(timer);
    controller.abort(); // close SSE stream immediately
    return ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Probe all known local services directly from the browser. */
export async function discoverLocalServices(): Promise<DiscoveredService[]> {
  // Claude Code probe only makes sense in dev mode (Vite dev server provides
  // the /__signals__/stream SSE endpoint). In Tauri production builds or
  // static deployments, the endpoint doesn't exist — and Tauri's SPA fallback
  // would return index.html as 200, causing a false positive.
  const claudeCodeProbe: Promise<DiscoveredService | null> = import.meta.env?.DEV
    ? relativeProbe("/__signals__/stream", PROBE_TIMEOUT).then(
        (up): DiscoveredService => ({
          id: "local:claude-code",
          label: "Claude Code",
          protocol: "sse" as TransportProtocol,
          url: "/__signals__/stream",
          available: up,
          models: [],
        }),
      )
    : Promise.resolve(null);

  const results = await Promise.allSettled([
    claudeCodeProbe,

    // OpenClaw — WebSocket probe on 18789
    wsProbe("ws://127.0.0.1:18789", PROBE_TIMEOUT).then(
      (up): DiscoveredService => ({
        id: "local:openclaw",
        label: "OpenClaw",
        protocol: "openclaw" as TransportProtocol,
        url: "ws://127.0.0.1:18789",
        available: up,
        needsApiKey: true,
        models: [],
      }),
    ),

    // LM Studio — HTTP probe on 1234
    httpProbe("http://127.0.0.1:1234/v1/models", PROBE_TIMEOUT).then(
      (r): DiscoveredService => ({
        id: "local:lm-studio",
        label: "LM Studio",
        protocol: "openai" as TransportProtocol,
        url: "http://127.0.0.1:1234",
        available: r.ok,
        needsApiKey: true,
        models: r.models,
      }),
    ),

    // Ollama — HTTP probe on 11434
    httpProbe("http://127.0.0.1:11434/v1/models", PROBE_TIMEOUT).then(
      (r): DiscoveredService => ({
        id: "local:ollama",
        label: "Ollama",
        protocol: "openai" as TransportProtocol,
        url: "http://127.0.0.1:11434",
        available: r.ok,
        models: r.models,
      }),
    ),
  ]);

  const services: DiscoveredService[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value !== null) {
      services.push(result.value);
    }
  }
  return services;
}

/**
 * Fetch the OpenClaw gateway auth token.
 *
 * - **Tauri desktop**: reads ~/.openclaw/openclaw.json via Rust command.
 * - **Vite dev server**: fetches from GET /api/openclaw/token.
 * - **Production browser**: silently returns null.
 */
export async function fetchOpenClawToken(): Promise<string | null> {
  // Tauri — read directly from filesystem via Rust command
  if ("__TAURI_INTERNALS__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<string>("read_openclaw_token");
    } catch {
      return null;
    }
  }

  // Vite dev server — HTTP endpoint
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
 * Probes browser-side services (LM Studio, Ollama, OpenClaw, Claude Code)
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

  // Auto-connect available local sources that are ready
  for (const service of services) {
    if (!service.available) continue;
    const source = getSource(service.id);
    if (!source || source.status !== "disconnected") continue;

    if (source.id === "local:claude-code") {
      void connectLocalSSE(source.id);
    } else if (source.id === "local:openclaw" && source.apiKey) {
      void connectSource(source.id, source.url, source.apiKey);
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
