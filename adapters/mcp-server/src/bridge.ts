/**
 * Bridge to the sajou scene-builder dev server.
 *
 * All communication happens via HTTP to the Vite dev server running
 * scene-builder. The bridge translates MCP tool calls into HTTP requests
 * against the signal ingestion and state sync endpoints.
 */

/** Default scene-builder dev server URL. Override via SAJOU_DEV_SERVER env var. */
const DEFAULT_DEV_SERVER = "http://localhost:5175";

/** Resolved base URL for the scene-builder dev server. */
function getBaseUrl(): string {
  return process.env["SAJOU_DEV_SERVER"] ?? DEFAULT_DEV_SERVER;
}

// ---------------------------------------------------------------------------
// Signal emission
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// State query types
// ---------------------------------------------------------------------------

/** Wrapper for all state query responses. */
interface StateResponse<T> {
  readonly ok: boolean;
  readonly error?: string;
  readonly lastPushAt?: number;
  readonly data: T | null;
}

/** Entity as returned by the scene state endpoint. */
export interface SceneEntity {
  readonly id: string;
  readonly entityId: string;
  readonly semanticId?: string;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly layerId: string;
  readonly zIndex: number;
  readonly opacity: number;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly activeState: string;
  readonly topology?: {
    readonly home?: string;
    readonly waypoints: readonly string[];
    readonly stateMapping?: Readonly<Record<string, string>>;
  };
}

/** Position marker in the scene. */
export interface ScenePosition {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly typeHint: string;
  readonly entityBinding?: string;
}

/** Route in the scene. */
export interface SceneRoute {
  readonly id: string;
  readonly name: string;
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly style: string;
  readonly color: string;
  readonly bidirectional: boolean;
}

/** Full scene state data. */
export interface SceneStateData {
  readonly dimensions: { readonly width: number; readonly height: number } | null;
  readonly background: { readonly color: string } | null;
  readonly layers: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly order: number;
    readonly visible: boolean;
  }>;
  readonly entities: readonly SceneEntity[];
  readonly positions: readonly ScenePosition[];
  readonly routes: readonly SceneRoute[];
  readonly zoneTypes: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly color: string;
  }>;
  readonly lighting: unknown;
  readonly particles: readonly unknown[];
  readonly mode: string | null;
  readonly viewMode: string | null;
}

/** Choreography summary as returned by the endpoint. */
export interface ChoreographySummary {
  readonly id: string;
  readonly on: string;
  readonly when: unknown;
  readonly interrupts: boolean;
  readonly defaultTargetEntityId: string | null;
  readonly stepCount: number;
  readonly stepTypes: readonly string[];
  readonly wiredSignalTypes: readonly string[];
  readonly sources: ReadonlyArray<{
    readonly sourceId: string;
    readonly signalType: string;
  }>;
}

/** Entity binding as returned by the endpoint. */
export interface BindingData {
  readonly id: string;
  readonly targetEntityId: string;
  readonly property: string;
  readonly sourceChoreographyId: string;
  readonly sourceType: string;
  readonly mapping?: unknown;
  readonly action?: unknown;
  readonly sourceField?: string;
  readonly transition?: unknown;
}

/** Signal source as returned by the endpoint. */
export interface SignalSourceData {
  readonly id: string;
  readonly name: string;
  readonly protocol: string;
  readonly url: string;
  readonly status: string;
  readonly error: string | null;
  readonly category: string;
  readonly eventsPerSecond: number;
  readonly streaming: boolean;
}

/** Wire connection as returned by the endpoint. */
export interface WireData {
  readonly id: string;
  readonly fromZone: string;
  readonly fromId: string;
  readonly toZone: string;
  readonly toId: string;
  readonly mapping: unknown;
}

// ---------------------------------------------------------------------------
// Generic fetch helper
// ---------------------------------------------------------------------------

/**
 * Fetch a state endpoint from the scene-builder.
 * Returns null if the server is unreachable or the endpoint returns an error.
 */
async function fetchState<T>(path: string): Promise<StateResponse<T> | null> {
  try {
    const url = `${getBaseUrl()}${path}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return null;
    return (await resp.json()) as StateResponse<T>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API — state queries
// ---------------------------------------------------------------------------

/**
 * Get current scene state from the scene-builder.
 *
 * Returns the full scene data including entities, positions, routes,
 * dimensions, and current editor mode. Returns null if the scene-builder
 * is not running or has no state.
 */
export async function getSceneState(): Promise<SceneStateData | null> {
  const resp = await fetchState<SceneStateData>("/api/scene/state");
  if (!resp?.ok) return null;
  return resp.data;
}

/**
 * Get all choreographies defined in the current scene.
 *
 * Returns enriched choreography summaries including wiring info
 * (which signal types and sources feed into each choreography).
 */
export async function getChoreographies(): Promise<readonly ChoreographySummary[] | null> {
  const resp = await fetchState<{ choreographies: ChoreographySummary[] }>("/api/choreographies");
  if (!resp?.ok) return null;
  return resp.data?.choreographies ?? null;
}

/**
 * Get all entity bindings in the current scene.
 *
 * Bindings connect choreographer outputs to entity properties
 * (e.g., a choreography controlling an entity's position or animation state).
 */
export async function getBindings(): Promise<readonly BindingData[] | null> {
  const resp = await fetchState<{ bindings: BindingData[] }>("/api/bindings");
  if (!resp?.ok) return null;
  return resp.data?.bindings ?? null;
}

/**
 * Get all connected signal sources.
 *
 * Signal sources are the inputs to the scene — WebSocket connections,
 * SSE streams, local tools like Claude Code, etc.
 */
export async function getSignalSources(): Promise<readonly SignalSourceData[] | null> {
  const resp = await fetchState<{ sources: SignalSourceData[] }>("/api/signals/sources");
  if (!resp?.ok) return null;
  return resp.data?.sources ?? null;
}

/**
 * Get all wire connections in the current scene.
 *
 * Wires connect signal sources -> signal types -> choreographies -> theme.
 * They define the data flow through the sajou pipeline.
 */
export async function getWiring(): Promise<readonly WireData[] | null> {
  const resp = await fetchState<{ wires: WireData[] }>("/api/wiring");
  if (!resp?.ok) return null;
  return resp.data?.wires ?? null;
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
