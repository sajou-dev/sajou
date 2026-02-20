/**
 * Server configuration — detects and connects to the sajou state server.
 *
 * In dev mode, Vite proxies /api/* to the server, so the browser uses
 * relative URLs by default. When a custom server URL is set (e.g. the user
 * changed the port in the connection panel), all fetches go directly to
 * that URL instead of through the proxy.
 */

const STORAGE_KEY = "sajou:server-url";

/** Whether the server has been probed and found available. */
let serverAvailable: boolean | null = null;

/**
 * Server base URL override.
 * - Empty string "" = use relative paths (Vite proxy)
 * - "http://localhost:3001" = bypass proxy, talk directly
 */
let serverBaseUrl: string = localStorage.getItem(STORAGE_KEY) ?? "";

/** Get the current server base URL. Empty = using Vite proxy (relative paths). */
export function getServerBaseUrl(): string {
  return serverBaseUrl;
}

/**
 * Set the server base URL. Persisted to localStorage.
 * Pass empty string to reset to Vite proxy (default).
 */
export function setServerBaseUrl(url: string): void {
  // Normalize: strip trailing slash
  serverBaseUrl = url.replace(/\/+$/, "");
  if (serverBaseUrl) {
    localStorage.setItem(STORAGE_KEY, serverBaseUrl);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Resolve a server path to a full URL.
 * When a base URL is set, prepends it. Otherwise returns the path as-is
 * (relative, goes through Vite proxy).
 */
export function serverUrl(path: string): string {
  if (serverBaseUrl) return serverBaseUrl + path;
  return path;
}

/**
 * Probe the sajou server to check if it's running and has real state.
 *
 * Returns the server state if the server is available and has been
 * mutated (lastMutationAt !== null). Returns null if the server is
 * unreachable or has only default empty state.
 */
export async function probeServer(): Promise<{
  available: boolean;
  hasState: boolean;
  data: Record<string, unknown> | null;
}> {
  try {
    const resp = await fetch(serverUrl("/api/state/full"), {
      signal: AbortSignal.timeout(2000),
    });
    if (!resp.ok) {
      serverAvailable = false;
      return { available: false, hasState: false, data: null };
    }

    const body = (await resp.json()) as {
      ok: boolean;
      lastPushAt: number | null;
      data: Record<string, unknown>;
    };

    serverAvailable = true;

    // Server is available but has never been written to — use IDB instead
    if (body.lastPushAt === null) {
      return { available: true, hasState: false, data: null };
    }

    return { available: true, hasState: true, data: body.data };
  } catch {
    serverAvailable = false;
    return { available: false, hasState: false, data: null };
  }
}

/** Whether the server was found available on last probe. */
export function isServerAvailable(): boolean {
  return serverAvailable === true;
}
