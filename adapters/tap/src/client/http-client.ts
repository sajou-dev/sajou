/**
 * HTTP transport — sends signals via POST to a sajou endpoint.
 *
 * Stateless, fire-and-forget. Each signal is an independent HTTP request.
 * Default target is the scene-builder's `POST /api/signal` endpoint.
 *
 * Endpoint resolution order:
 *   1. Explicit `endpoint` option (full URL)
 *   2. `SAJOU_ENDPOINT` env var (full URL) — handled by caller
 *   3. `SAJOU_PORT` env var → http://localhost:<port>/api/signal
 *   4. Auto-discovery: TCP probe ports 5175, 5173–5180
 *   5. Fallback: http://localhost:5175/api/signal
 */

import { createConnection } from "node:net";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SignalEnvelope } from "@sajou/schema";
import type { TapTransport } from "./transport.js";

/** Signal API path on the scene-builder Vite dev server. */
const SIGNAL_PATH = "/api/signal";

/** Default port configured in scene-builder's vite.config.ts. */
const DEFAULT_PORT = 5175;

/** Ports to probe, in priority order (configured port first). */
const PROBE_PORTS = [5175, 5173, 5174, 5176, 5177, 5178, 5179, 5180];

/** TCP probe timeout per port (ms). Localhost connects are sub-millisecond. */
const PROBE_TIMEOUT_MS = 150;

/** Cache file path for discovered port. */
const PORT_CACHE_FILE = join(tmpdir(), "sajou-emit-port");

/** Cache TTL — re-probe after 5 minutes. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Options for creating an HTTP transport. */
export interface HttpTransportOptions {
  /** The URL to POST signals to. Skips port discovery if set. */
  endpoint?: string;
}

/**
 * Probes a single TCP port on localhost.
 *
 * @returns true if something is listening, false otherwise.
 */
function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Reads cached port from /tmp/sajou-emit-port.
 *
 * @returns The cached port number, or null if cache is missing/stale.
 */
async function readPortCache(): Promise<number | null> {
  try {
    const raw = await readFile(PORT_CACHE_FILE, "utf8");
    const [portStr, tsStr] = raw.trim().split(" ");
    const port = Number(portStr);
    const ts = Number(tsStr);
    if (Number.isNaN(port) || Number.isNaN(ts)) return null;
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return port;
  } catch {
    return null;
  }
}

/**
 * Writes discovered port to cache file.
 */
async function writePortCache(port: number): Promise<void> {
  try {
    await writeFile(PORT_CACHE_FILE, `${String(port)} ${String(Date.now())}`, "utf8");
  } catch {
    // Non-critical — cache write failure is silent.
  }
}

/**
 * Discovers the scene-builder's port.
 *
 * Resolution:
 *   1. SAJOU_PORT env var
 *   2. Cached port (if still alive)
 *   3. TCP probe across Vite's port range
 *   4. Fallback to DEFAULT_PORT
 */
async function discoverPort(): Promise<number> {
  // 1. Explicit env var
  const envPort = process.env["SAJOU_PORT"];
  if (envPort) {
    const port = Number(envPort);
    if (!Number.isNaN(port)) return port;
  }

  // 2. Cached port — verify it's still alive
  const cached = await readPortCache();
  if (cached !== null) {
    const alive = await probePort(cached);
    if (alive) return cached;
  }

  // 3. Probe port range
  for (const port of PROBE_PORTS) {
    const alive = await probePort(port);
    if (alive) {
      await writePortCache(port);
      return port;
    }
  }

  // 4. Fallback
  return DEFAULT_PORT;
}

/** HTTP POST transport — implements TapTransport. */
export class HttpTransport implements TapTransport {
  private endpoint: string | undefined;
  private readonly explicitEndpoint: boolean;
  private isConnected = false;

  constructor(options?: HttpTransportOptions) {
    this.endpoint = options?.endpoint;
    this.explicitEndpoint = options?.endpoint !== undefined;
  }

  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Resolves the endpoint (auto-discovers port if needed) and marks ready.
   */
  async connect(): Promise<void> {
    if (!this.explicitEndpoint) {
      const port = await discoverPort();
      this.endpoint = `http://localhost:${String(port)}${SIGNAL_PATH}`;
    }
    this.isConnected = true;
  }

  /** Sends a signal envelope via HTTP POST. */
  async send(signal: SignalEnvelope): Promise<void> {
    const url = this.endpoint ?? `http://localhost:${String(DEFAULT_PORT)}${SIGNAL_PATH}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signal),
    });
    if (!response.ok) {
      throw new Error(
        `HTTP ${String(response.status)}: ${await response.text()}`,
      );
    }
  }

  /** Marks transport as disconnected. */
  async close(): Promise<void> {
    this.isConnected = false;
  }
}
