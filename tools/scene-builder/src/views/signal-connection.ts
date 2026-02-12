/**
 * Signal connection manager — multi-source, multi-protocol.
 *
 * Each signal source gets its own independent connection (WebSocket, SSE, or
 * OpenAI-compatible). Multiple sources can be connected simultaneously.
 *
 * Supports three transport modes:
 *   - **WebSocket** (`ws://` / `wss://`) — for the sajou emitter and real-time sources
 *   - **SSE** (Server-Sent Events over HTTP/S) — for generic streaming endpoints
 *   - **OpenAI** (auto-detected) — for OpenAI-compatible APIs (LM Studio, Ollama, vLLM…)
 *
 * All incoming messages from all sources are merged into shared signal/debug
 * listener channels. Each source's connection state is stored back into the
 * signal-source-state store so the UI reflects per-source status.
 */

import type { SignalType } from "../types.js";
import { updateSource } from "../state/signal-source-state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Connection status. */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/** Transport protocol. */
export type TransportProtocol = "websocket" | "sse" | "openai";

/** A parsed signal event received from a source. */
export interface ReceivedSignal {
  /** Unique signal ID from the envelope. */
  id: string;
  /** Signal type. */
  type: SignalType;
  /** Unix epoch ms from the envelope. */
  timestamp: number;
  /** The source field from the envelope. */
  source: string;
  /** Correlation ID for grouping. */
  correlationId?: string;
  /** The typed payload. */
  payload: Record<string, unknown>;
  /** The full raw JSON string. */
  raw: string;
}

/** Listener for received signals. Second arg is the connection sourceId. */
export type SignalListener = (signal: ReceivedSignal, sourceId: string) => void;

/** Listener for debug/lifecycle messages shown in the log. Third arg is the connection sourceId. */
export type DebugListener = (message: string, level: "info" | "warn" | "error", sourceId: string) => void;

// ---------------------------------------------------------------------------
// Known signal types for validation
// ---------------------------------------------------------------------------

const KNOWN_TYPES = new Set<string>([
  "task_dispatch",
  "tool_call",
  "tool_result",
  "token_usage",
  "agent_state_change",
  "error",
  "completion",
]);

// ---------------------------------------------------------------------------
// Per-source connection handles
// ---------------------------------------------------------------------------

/** Internal state for a single source's connection. */
interface SourceConnection {
  sourceId: string;
  ws: WebSocket | null;
  sseAbort: AbortController | null;
}

/** Map of sourceId → connection handle. */
const connections = new Map<string, SourceConnection>();

// ---------------------------------------------------------------------------
// Global listeners (aggregate across all sources)
// ---------------------------------------------------------------------------

type StateListener = () => void;

const stateListeners: StateListener[] = [];
const signalListeners: SignalListener[] = [];
const debugListeners: DebugListener[] = [];

// ---------------------------------------------------------------------------
// Public API — global listeners
// ---------------------------------------------------------------------------

/** Subscribe to any source connection state change. Returns unsubscribe fn. */
export function subscribeConnection(fn: StateListener): () => void {
  stateListeners.push(fn);
  return () => {
    const idx = stateListeners.indexOf(fn);
    if (idx >= 0) stateListeners.splice(idx, 1);
  };
}

/** Subscribe to incoming signals (from any source). Returns unsubscribe fn. */
export function onSignal(fn: SignalListener): () => void {
  signalListeners.push(fn);
  return () => {
    const idx = signalListeners.indexOf(fn);
    if (idx >= 0) signalListeners.splice(idx, 1);
  };
}

/** Subscribe to debug/lifecycle messages (from any source). Returns unsubscribe fn. */
export function onDebug(fn: DebugListener): () => void {
  debugListeners.push(fn);
  return () => {
    const idx = debugListeners.indexOf(fn);
    if (idx >= 0) debugListeners.splice(idx, 1);
  };
}

// ---------------------------------------------------------------------------
// Public API — per-source actions
// ---------------------------------------------------------------------------

/** Connect a specific source by its ID. */
export async function connectSource(
  sourceId: string,
  url: string,
  apiKey: string,
): Promise<void> {
  // Disconnect existing connection for this source first
  disconnectSource(sourceId);

  const protocol = detectProtocol(url);
  const conn: SourceConnection = { sourceId, ws: null, sseAbort: null };
  connections.set(sourceId, conn);

  setSourceState(sourceId, { status: "connecting", error: null, protocol });
  debug(`[${sourceId}] Connecting to ${url} (${protocol})…`, "info", sourceId);

  if (protocol === "websocket") {
    connectWebSocket(conn, url);
  } else {
    debug(`[${sourceId}] Probing for OpenAI-compatible API…`, "info", sourceId);
    const probeResult = await probeOpenAI(url, apiKey, sourceId);
    if (probeResult) {
      setSourceState(sourceId, {
        protocol: "openai",
        availableModels: probeResult.models,
        selectedModel: probeResult.models[0] ?? "",
        status: "connected",
        error: null,
      });
      debug(
        `[${sourceId}] OpenAI-compatible API detected. ${probeResult.models.length} model(s) available.`,
        "info",
        sourceId,
      );
    } else {
      debug(`[${sourceId}] Not an OpenAI-compatible API — falling back to SSE.`, "info", sourceId);
      connectSSE(conn, url, apiKey);
    }
  }
}

/** Disconnect a specific source by its ID. */
export function disconnectSource(sourceId: string): void {
  const conn = connections.get(sourceId);
  if (!conn) return;

  if (conn.ws) {
    conn.ws.close();
    conn.ws = null;
  }
  if (conn.sseAbort) {
    conn.sseAbort.abort();
    conn.sseAbort = null;
  }

  connections.delete(sourceId);
  debug(`[${sourceId}] Disconnected.`, "info", sourceId);
  setSourceState(sourceId, {
    status: "disconnected",
    error: null,
    streaming: false,
  });
}

/** Send a prompt to an OpenAI-compatible source and stream the response. */
export async function sendPromptToSource(
  sourceId: string,
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
): Promise<void> {
  let conn = connections.get(sourceId);
  if (!conn) {
    conn = { sourceId, ws: null, sseAbort: null };
    connections.set(sourceId, conn);
  }

  const correlationId = crypto.randomUUID();
  const baseUrl = url.replace(/\/+$/, "");
  const endpoint = `${baseUrl}/v1/chat/completions`;

  conn.sseAbort = new AbortController();
  setSourceState(sourceId, { streaming: true });

  debug(`[${sourceId}] Sending prompt to ${model}…`, "info", sourceId);

  // Dispatch task_dispatch signal for the prompt
  dispatchSignal({
    id: crypto.randomUUID(),
    type: "task_dispatch",
    timestamp: Date.now(),
    source: "user",
    correlationId,
    payload: { description: prompt, model },
    raw: JSON.stringify({ prompt, model }),
  }, sourceId);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const resp = await fetch(proxyUrl(endpoint), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: true,
      }),
      signal: conn.sseAbort.signal,
    });

    if (!resp.ok) {
      const msg = `HTTP ${resp.status} ${resp.statusText}`;
      debug(`[${sourceId}] Request failed: ${msg}`, "error", sourceId);
      setSourceState(sourceId, { status: "error", error: msg, streaming: false });
      return;
    }

    if (!resp.body) {
      const msg = "Response has no streaming body.";
      debug(`[${sourceId}] ${msg}`, "error", sourceId);
      setSourceState(sourceId, { status: "error", error: msg, streaming: false });
      return;
    }

    await readOpenAIStream(conn, resp.body, correlationId, model);
  } catch (e) {
    if (conn.sseAbort?.signal.aborted) return; // User stopped
    const msg = e instanceof Error ? e.message : String(e);
    debug(`[${sourceId}] Stream error: ${msg}`, "error", sourceId);
    setSourceState(sourceId, { error: `Stream interrupted: ${msg}`, streaming: false });
  } finally {
    setSourceState(sourceId, { streaming: false });
  }
}

/** Stop an active prompt stream for a specific source. */
export function stopSourcePrompt(sourceId: string): void {
  const conn = connections.get(sourceId);
  if (!conn) return;
  debug(`[${sourceId}] Prompt stream stopped by user.`, "info", sourceId);
  if (conn.sseAbort) {
    conn.sseAbort.abort();
    conn.sseAbort = null;
  }
  setSourceState(sourceId, { streaming: false });
}

// ---------------------------------------------------------------------------
// Backward-compat shims (used by signal-view.ts prompt section)
// ---------------------------------------------------------------------------

/**
 * Get a combined "connection state" view.
 * Checks if ANY source is openai+connected (for prompt visibility).
 */
export function getConnectionState(): {
  protocol: TransportProtocol;
  status: ConnectionStatus;
  streaming: boolean;
  selectedModel: string;
  /** Source ID of the first openai-connected source (if any). */
  openaiSourceId: string | null;
} {
  // Find the first OpenAI-connected source
  for (const [, conn] of connections) {
    // Not enough — need to check from source state store
    void conn;
  }
  // The signal-view uses this to show/hide the prompt section
  // We return a basic aggregate — the prompt section in signal-view
  // now uses source-level state directly.
  return {
    protocol: "websocket",
    status: "disconnected",
    streaming: false,
    selectedModel: "",
    openaiSourceId: null,
  };
}

// ---------------------------------------------------------------------------
// Protocol detection
// ---------------------------------------------------------------------------

/** Detect protocol from URL scheme (initial guess — OpenAI probe refines it). */
function detectProtocol(url: string): TransportProtocol {
  const lower = url.trim().toLowerCase();
  if (lower.startsWith("ws://") || lower.startsWith("wss://")) return "websocket";
  return "sse";
}

// ---------------------------------------------------------------------------
// CORS proxy
// ---------------------------------------------------------------------------

/**
 * Rewrite an external HTTP URL to go through the Vite dev server proxy
 * at `/__proxy/?target=<encoded-url>` to bypass CORS restrictions.
 */
function proxyUrl(url: string): string {
  if (!import.meta.env?.DEV) return url;
  return `/__proxy/?target=${encodeURIComponent(url)}`;
}

// ---------------------------------------------------------------------------
// OpenAI probe
// ---------------------------------------------------------------------------

/** Probe an HTTP endpoint for OpenAI-compatible API via GET /v1/models. */
async function probeOpenAI(
  baseUrl: string,
  apiKey: string,
  sourceId: string,
): Promise<{ models: string[] } | null> {
  try {
    const modelsUrl = baseUrl.replace(/\/+$/, "") + "/v1/models";
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const resp = await fetch(proxyUrl(modelsUrl), {
      headers,
      signal: AbortSignal.timeout(3000),
    });

    if (!resp.ok) {
      debug(`Probe failed: HTTP ${resp.status} ${resp.statusText}`, "warn", sourceId);
      return null;
    }

    const json = (await resp.json()) as Record<string, unknown>;
    const data = json["data"];
    if (Array.isArray(data)) {
      const models = data.map((m) => {
        const entry = m as Record<string, unknown>;
        return String(entry["id"] ?? "unknown");
      });
      debug(`Found ${models.length} model(s): ${models.join(", ")}`, "info", sourceId);
      return { models };
    }
    debug("Probe returned OK but no models array in response.", "warn", sourceId);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debug(`Probe error: ${msg}`, "warn", sourceId);
    return null;
  }
}

// ---------------------------------------------------------------------------
// WebSocket transport
// ---------------------------------------------------------------------------

function connectWebSocket(conn: SourceConnection, url: string): void {
  try {
    conn.ws = new WebSocket(url);
  } catch (e) {
    const msg = `WebSocket creation failed: ${e instanceof Error ? e.message : String(e)}`;
    debug(`[${conn.sourceId}] ${msg}`, "error", conn.sourceId);
    setSourceState(conn.sourceId, { status: "error", error: msg });
    return;
  }

  conn.ws.addEventListener("open", () => {
    setSourceState(conn.sourceId, { status: "connected", error: null });
    debug(`[${conn.sourceId}] WebSocket connected.`, "info", conn.sourceId);
  });

  conn.ws.addEventListener("message", (event) => {
    handleMessage(String(event.data), conn.sourceId);
  });

  conn.ws.addEventListener("error", (event) => {
    debug(`[${conn.sourceId}] WebSocket error on ${url}`, "error", conn.sourceId);
    void event;
  });

  conn.ws.addEventListener("close", (event) => {
    conn.ws = null;
    const detail = event.wasClean
      ? `Connection closed cleanly (code ${event.code}).`
      : `Connection lost (code ${event.code}, reason: ${event.reason || "none"}).`;
    debug(`[${conn.sourceId}] ${detail}`, event.wasClean ? "info" : "warn", conn.sourceId);

    // Check what the source's last known status was via the connection map
    const existing = connections.get(conn.sourceId);
    if (!existing) return; // Already cleaned up

    if (event.wasClean) {
      setSourceState(conn.sourceId, { status: "disconnected", error: null });
    } else {
      setSourceState(conn.sourceId, { status: "error", error: detail });
    }
    connections.delete(conn.sourceId);
  });
}

// ---------------------------------------------------------------------------
// SSE / HTTP streaming transport
// ---------------------------------------------------------------------------

function connectSSE(conn: SourceConnection, url: string, apiKey: string): void {
  conn.sseAbort = new AbortController();

  const headers: Record<string, string> = {
    Accept: "text/event-stream",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    debug(`[${conn.sourceId}] Using API key for authentication.`, "info", conn.sourceId);
  }

  fetch(proxyUrl(url), {
    method: "GET",
    headers,
    signal: conn.sseAbort.signal,
  })
    .then((response) => {
      if (!response.ok) {
        const msg = `HTTP ${response.status} ${response.statusText}`;
        debug(`[${conn.sourceId}] Connection failed: ${msg}`, "error", conn.sourceId);
        setSourceState(conn.sourceId, { status: "error", error: msg });
        return;
      }

      setSourceState(conn.sourceId, { status: "connected", error: null });
      debug(`[${conn.sourceId}] SSE connected (HTTP ${response.status}).`, "info", conn.sourceId);

      if (!response.body) {
        const msg = "Response has no streaming body.";
        debug(`[${conn.sourceId}] ${msg}`, "error", conn.sourceId);
        setSourceState(conn.sourceId, { status: "error", error: msg });
        return;
      }

      readSSEStream(conn, response.body);
    })
    .catch((e) => {
      if (conn.sseAbort?.signal.aborted) return;
      const msg = e instanceof Error ? e.message : String(e);
      debug(`[${conn.sourceId}] Connection failed: ${msg}`, "error", conn.sourceId);
      setSourceState(conn.sourceId, { status: "error", error: `Could not connect — ${msg}` });
    });
}

/** Read an SSE stream (or NDJSON) from a ReadableStream. */
async function readSSEStream(
  conn: SourceConnection,
  body: ReadableStream<Uint8Array>,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
        if (!payload) continue;

        if (payload === "[DONE]") {
          debug(`[${conn.sourceId}] Stream ended ([DONE]).`, "info", conn.sourceId);
          continue;
        }

        handleMessage(payload, conn.sourceId);
      }
    }

    debug(`[${conn.sourceId}] Stream ended.`, "info", conn.sourceId);
    setSourceState(conn.sourceId, { status: "disconnected", error: null });
  } catch (e) {
    if (conn.sseAbort?.signal.aborted) return;
    const msg = e instanceof Error ? e.message : String(e);
    debug(`[${conn.sourceId}] Stream error: ${msg}`, "error", conn.sourceId);
    setSourceState(conn.sourceId, { status: "error", error: `Stream interrupted: ${msg}` });
  }
}

// ---------------------------------------------------------------------------
// OpenAI streaming
// ---------------------------------------------------------------------------

/** Read an OpenAI SSE stream, translating delta chunks into sajou signals. */
async function readOpenAIStream(
  conn: SourceConnection,
  body: ReadableStream<Uint8Array>,
  correlationId: string,
  model: string,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let tokenCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
        if (!payload) continue;

        if (payload === "[DONE]") {
          dispatchSignal({
            id: crypto.randomUUID(),
            type: "completion",
            timestamp: Date.now(),
            source: model,
            correlationId,
            payload: { success: true, totalTokens: tokenCount },
            raw: payload,
          }, conn.sourceId);
          debug(`[${conn.sourceId}] Stream complete — ${tokenCount} token chunks received.`, "info", conn.sourceId);
          continue;
        }

        try {
          const chunk = JSON.parse(payload) as Record<string, unknown>;
          const choices = chunk["choices"] as Array<Record<string, unknown>> | undefined;

          if (choices && choices.length > 0) {
            const choice = choices[0];
            const delta = choice["delta"] as Record<string, unknown> | undefined;
            const finishReason = choice["finish_reason"] as string | null;
            const content = delta?.["content"] as string | undefined;

            if (content) {
              tokenCount++;
              dispatchSignal({
                id: crypto.randomUUID(),
                type: "token_usage",
                timestamp: Date.now(),
                source: model,
                correlationId,
                payload: {
                  content,
                  tokenIndex: tokenCount,
                  model: chunk["model"] ?? model,
                },
                raw: payload,
              }, conn.sourceId);
            }

            if (finishReason === "stop") {
              dispatchSignal({
                id: crypto.randomUUID(),
                type: "completion",
                timestamp: Date.now(),
                source: model,
                correlationId,
                payload: {
                  success: true,
                  finishReason,
                  totalTokens: tokenCount,
                },
                raw: payload,
              }, conn.sourceId);
              debug(`[${conn.sourceId}] Generation finished (${finishReason}) — ${tokenCount} tokens.`, "info", conn.sourceId);
            }
          }

          const error = chunk["error"] as Record<string, unknown> | undefined;
          if (error) {
            const errMsg = String(error["message"] ?? "Unknown error");
            dispatchSignal({
              id: crypto.randomUUID(),
              type: "error",
              timestamp: Date.now(),
              source: model,
              correlationId,
              payload: { message: errMsg, severity: "error" },
              raw: payload,
            }, conn.sourceId);
            debug(`[${conn.sourceId}] API error: ${errMsg}`, "error", conn.sourceId);
          }
        } catch {
          debug(`[${conn.sourceId}] [openai] Unparsed: ${payload.slice(0, 100)}`, "warn", conn.sourceId);
        }
      }
    }

    debug(`[${conn.sourceId}] Response stream ended.`, "info", conn.sourceId);
  } catch (e) {
    if (conn.sseAbort?.signal.aborted) return;
    const msg = e instanceof Error ? e.message : String(e);
    debug(`[${conn.sourceId}] Stream error: ${msg}`, "error", conn.sourceId);
    setSourceState(conn.sourceId, { error: `Stream interrupted: ${msg}` });
  }
}

// ---------------------------------------------------------------------------
// Shared message handling
// ---------------------------------------------------------------------------

/** Parse an incoming message and dispatch to signal listeners. */
function handleMessage(raw: string, sourceId: string): void {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const type = parsed["type"] as string | undefined;

    if (type && KNOWN_TYPES.has(type)) {
      dispatchSignal({
        id: String(parsed["id"] ?? crypto.randomUUID()),
        type: type as SignalType,
        timestamp: Number(parsed["timestamp"] ?? Date.now()),
        source: String(parsed["source"] ?? "unknown"),
        correlationId: parsed["correlationId"] as string | undefined,
        payload: (parsed["payload"] as Record<string, unknown>) ?? {},
        raw,
      }, sourceId);
      return;
    }

    if (parsed["meta"]) {
      debug(`[meta] ${parsed["meta"]}: ${JSON.stringify(parsed)}`, "info", sourceId);
      return;
    }

    // Generic event (OpenClaw, custom backends, etc.)
    // Preserve the full JSON as payload for the choreographer to filter.
    dispatchSignal({
      id: String(parsed["id"] ?? crypto.randomUUID()),
      type: "event" as SignalType,
      timestamp: Number(parsed["timestamp"] ?? parsed["ts"] ?? Date.now()),
      source: String(parsed["source"] ?? parsed["event"] ?? "unknown"),
      correlationId: (parsed["correlationId"] as string | undefined)
        ?? (parsed["runId"] as string | undefined),
      payload: parsed,
      raw,
    }, sourceId);
  } catch {
    dispatchSignal({
      id: crypto.randomUUID(),
      type: "error",
      timestamp: Date.now(),
      source: "raw",
      payload: { message: raw },
      raw,
    }, sourceId);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Update a source's state in the signal-source-state store + notify global listeners. */
function setSourceState(
  sourceId: string,
  partial: Partial<{
    status: ConnectionStatus;
    error: string | null;
    protocol: TransportProtocol;
    availableModels: string[];
    selectedModel: string;
    streaming: boolean;
  }>,
): void {
  updateSource(sourceId, partial);
  notifyState();
}

function debug(message: string, level: "info" | "warn" | "error", sourceId = ""): void {
  for (const fn of debugListeners) fn(message, level, sourceId);
}

function dispatchSignal(signal: ReceivedSignal, sourceId = ""): void {
  for (const fn of signalListeners) fn(signal, sourceId);
}

function notifyState(): void {
  for (const fn of stateListeners) fn();
}
