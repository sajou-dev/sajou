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

// ---------------------------------------------------------------------------
// Write operations — queue commands for the client to execute
// ---------------------------------------------------------------------------

/** Response from a write command endpoint. */
export interface WriteCommandResponse {
  readonly ok: boolean;
  readonly commandId?: string;
  readonly error?: string;
}

/**
 * Send a write command to the scene-builder via a POST endpoint.
 * The command is queued on the Vite dev server; the client picks it up via polling.
 */
async function sendCommand(
  path: string,
  body: Record<string, unknown>,
): Promise<WriteCommandResponse> {
  const url = `${getBaseUrl()}${path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return (await resp.json()) as WriteCommandResponse;
}

/**
 * Place an entity on the scene.
 *
 * The entity will be added to the client's scene state via the command queue.
 * Returns the generated instance ID.
 */
export async function placeEntity(data: {
  readonly entityId: string;
  readonly x: number;
  readonly y: number;
  readonly semanticId?: string;
  readonly layerId?: string;
  readonly scale?: number;
  readonly rotation?: number;
  readonly zIndex?: number;
  readonly activeState?: string;
}): Promise<WriteCommandResponse & { readonly instanceId: string }> {
  const instanceId = crypto.randomUUID();
  const result = await sendCommand("/api/scene/entities", {
    action: "add",
    id: instanceId,
    ...data,
  });
  return { ...result, instanceId };
}

/**
 * Remove an entity from the scene by its instance ID.
 */
export async function removeEntity(id: string): Promise<WriteCommandResponse> {
  return sendCommand("/api/scene/entities", { action: "remove", id });
}

/**
 * Create a choreography with steps.
 *
 * Returns the generated choreography ID.
 */
export async function createChoreography(data: {
  readonly on: string;
  readonly steps: ReadonlyArray<{
    readonly action: string;
    readonly entity?: string;
    readonly target?: string;
    readonly delay?: number;
    readonly duration?: number;
    readonly easing?: string;
    readonly params?: Record<string, unknown>;
  }>;
  readonly defaultTargetEntityId?: string;
  readonly when?: Record<string, unknown>;
  readonly interrupts?: boolean;
}): Promise<WriteCommandResponse & { readonly choreographyId: string }> {
  const choreographyId = crypto.randomUUID();
  const result = await sendCommand("/api/choreographies", {
    action: "add",
    id: choreographyId,
    ...data,
  });
  return { ...result, choreographyId };
}

/**
 * Remove a choreography by ID. Also cleans up connected wires.
 */
export async function removeChoreography(id: string): Promise<WriteCommandResponse> {
  return sendCommand("/api/choreographies", { action: "remove", id });
}

/**
 * Create an entity binding (choreography → entity property).
 *
 * Returns the command ID. The binding ID is generated client-side.
 */
export async function createBinding(data: {
  readonly targetEntityId: string;
  readonly property: string;
  readonly sourceChoreographyId: string;
  readonly sourceType?: string;
  readonly mapping?: Record<string, unknown>;
  readonly action?: Record<string, unknown>;
  readonly sourceField?: string;
  readonly transition?: Record<string, unknown>;
}): Promise<WriteCommandResponse> {
  return sendCommand("/api/bindings", {
    action: "add",
    ...data,
  });
}

/**
 * Remove a binding by ID.
 */
export async function removeBinding(id: string): Promise<WriteCommandResponse> {
  return sendCommand("/api/bindings", { action: "remove", id });
}

/**
 * Create a wire connection between two zones in the patch bay.
 *
 * Returns the command ID. The wire ID is generated client-side.
 */
export async function createWire(data: {
  readonly fromZone: string;
  readonly fromId: string;
  readonly toZone: string;
  readonly toId: string;
}): Promise<WriteCommandResponse> {
  return sendCommand("/api/wiring", {
    action: "add",
    ...data,
  });
}

/**
 * Remove a wire connection by ID.
 */
export async function removeWire(id: string): Promise<WriteCommandResponse> {
  return sendCommand("/api/wiring", { action: "remove", id });
}

/**
 * Add a signal source. Returns the command ID.
 * The source ID is generated client-side.
 */
export async function addSignalSource(data: {
  readonly name?: string;
}): Promise<WriteCommandResponse> {
  return sendCommand("/api/signals/sources", {
    action: "add",
    ...data,
  });
}

/**
 * Remove a signal source by ID.
 */
export async function removeSignalSource(id: string): Promise<WriteCommandResponse> {
  return sendCommand("/api/signals/sources", { action: "remove", id });
}

// ---------------------------------------------------------------------------
// Shader operations
// ---------------------------------------------------------------------------

/** Shader definition as returned by the shaders endpoint. */
export interface ShaderData {
  readonly id: string;
  readonly name: string;
  readonly mode: string;
  readonly vertexSource: string;
  readonly fragmentSource: string;
  readonly uniforms: ReadonlyArray<{
    readonly name: string;
    readonly type: string;
    readonly control: string;
    readonly value: number | boolean | number[];
    readonly defaultValue: number | boolean | number[];
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly objectId?: string;
    readonly bind?: { readonly semantic: string };
  }>;
  readonly objects: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
  }>;
  readonly passes: number;
  readonly bufferResolution: number;
}

/**
 * Get all shader definitions from the scene-builder.
 */
export async function getShaders(): Promise<readonly ShaderData[] | null> {
  const resp = await fetchState<{ shaders: ShaderData[] }>("/api/shaders");
  if (!resp?.ok) return null;
  return resp.data?.shaders ?? null;
}

/**
 * Create a new shader in the scene-builder.
 * Returns the command ID. The shader ID should be pre-generated and passed in data.
 */
export async function createShader(data: {
  readonly id: string;
  readonly name: string;
  readonly fragmentSource: string;
  readonly vertexSource: string;
  readonly uniforms?: ReadonlyArray<Record<string, unknown>>;
  readonly objects?: ReadonlyArray<Record<string, unknown>>;
  readonly passes?: number;
}): Promise<WriteCommandResponse> {
  return sendCommand("/api/shaders", data);
}

/**
 * Update an existing shader by ID.
 */
export async function updateShader(
  id: string,
  data: Record<string, unknown>,
): Promise<WriteCommandResponse> {
  const url = `${getBaseUrl()}/api/shaders/${encodeURIComponent(id)}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(5000),
  });
  return (await resp.json()) as WriteCommandResponse;
}

/**
 * Remove a shader by ID.
 */
export async function removeShader(id: string): Promise<WriteCommandResponse> {
  const url = `${getBaseUrl()}/api/shaders/${encodeURIComponent(id)}`;
  const resp = await fetch(url, {
    method: "DELETE",
    signal: AbortSignal.timeout(5000),
  });
  return (await resp.json()) as WriteCommandResponse;
}

/**
 * Set a uniform value on a shader. This is the real-time knob for AI agents.
 */
export async function setUniform(
  shaderId: string,
  uniformName: string,
  value: number | boolean | number[],
): Promise<WriteCommandResponse> {
  const url = `${getBaseUrl()}/api/shaders/${encodeURIComponent(shaderId)}/uniforms`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uniformName, value }),
    signal: AbortSignal.timeout(5000),
  });
  return (await resp.json()) as WriteCommandResponse;
}
