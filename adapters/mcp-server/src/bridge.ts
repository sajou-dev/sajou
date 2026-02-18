/**
 * Bridge to the sajou scene-builder dev server.
 *
 * All communication happens via HTTP to the Vite dev server running
 * scene-builder. The bridge translates MCP tool calls into HTTP requests
 * against the existing signal ingestion and scene state endpoints.
 */

/** Default scene-builder dev server URL. Override via SAJOU_DEV_SERVER env var. */
const DEFAULT_DEV_SERVER = "http://localhost:5175";

/** Resolved base URL for the scene-builder dev server. */
function getBaseUrl(): string {
  return process.env["SAJOU_DEV_SERVER"] ?? DEFAULT_DEV_SERVER;
}

/** Response from the signal emission endpoint. */
export interface EmitSignalResponse {
  readonly ok: boolean;
  readonly id?: string;
  readonly clients?: number;
  readonly error?: string;
}

/**
 * Emit a signal to the scene-builder via HTTP POST.
 *
 * Uses the `POST /api/signal` endpoint from the signal ingestion plugin
 * in the scene-builder's Vite dev server.
 */
export async function emitSignal(signal: {
  readonly type: string;
  readonly source?: string;
  readonly payload?: Record<string, unknown>;
}): Promise<EmitSignalResponse> {
  const url = `${getBaseUrl()}/api/signal`;

  const envelope: Record<string, unknown> = {
    type: signal.type,
    source: signal.source ?? "mcp",
    payload: signal.payload ?? {},
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
  });

  return (await resp.json()) as EmitSignalResponse;
}

/**
 * Map a signal type to a choreography via HTTP POST.
 *
 * Uses `POST /api/signal` to send a special `_map_signal` meta-signal
 * that the scene-builder can interpret to create wiring.
 */
export async function mapSignal(
  signalType: string,
  choreographyId: string,
): Promise<EmitSignalResponse> {
  const url = `${getBaseUrl()}/api/signal`;

  const envelope: Record<string, unknown> = {
    type: "_map_signal",
    source: "mcp",
    payload: {
      signalType,
      choreographyId,
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(envelope),
  });

  return (await resp.json()) as EmitSignalResponse;
}

/** Entity state returned from the scene-builder. */
export interface SceneEntity {
  readonly id: string;
  readonly semanticId?: string;
  readonly position?: { readonly x: number; readonly y: number };
  readonly visible?: boolean;
}

/**
 * Get current scene state from the scene-builder.
 *
 * Attempts to fetch from the scene state API. Returns an empty array
 * if the endpoint is not available (scene-builder not running or
 * endpoint not yet implemented).
 */
export async function getSceneState(): Promise<readonly SceneEntity[]> {
  try {
    const url = `${getBaseUrl()}/api/scene/state`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = (await resp.json()) as { entities?: SceneEntity[] };
    return data.entities ?? [];
  } catch {
    return [];
  }
}

/**
 * Check if the scene-builder dev server is reachable.
 */
export async function ping(): Promise<boolean> {
  try {
    const resp = await fetch(getBaseUrl(), {
      method: "HEAD",
      signal: AbortSignal.timeout(2000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
