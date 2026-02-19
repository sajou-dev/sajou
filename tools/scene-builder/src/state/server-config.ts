/**
 * Server configuration — detects and connects to the sajou state server.
 *
 * In dev mode, Vite proxies /api/* to the server, so the browser uses
 * relative URLs. This module is used only for the initial server probe
 * during workspace init (to decide IDB vs server-first loading).
 */

/** Whether the server has been probed and found available. */
let serverAvailable: boolean | null = null;

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
    const resp = await fetch("/api/state/full", {
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
