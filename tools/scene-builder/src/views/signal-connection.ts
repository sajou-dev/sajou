/**
 * Signal connection manager — multi-protocol.
 *
 * Supports three transport modes:
 *   - **WebSocket** (`ws://` / `wss://`) — for the sajou emitter and real-time sources
 *   - **SSE** (Server-Sent Events over HTTP/S) — for generic streaming endpoints
 *   - **OpenAI** (auto-detected) — for OpenAI-compatible APIs (LM Studio, Ollama, vLLM…)
 *
 * The protocol is auto-detected:
 *   - `ws://` / `wss://` → WebSocket
 *   - `http://` / `https://` → probes `/v1/models`; if OpenAI-compatible → OpenAI, else → SSE
 *
 * An optional API key can be provided for authenticated endpoints.
 *
 * All incoming messages are parsed and dispatched to registered signal listeners.
 * Connection lifecycle events are logged to the raw log via a dedicated debug channel.
 */

import type { SignalType } from "../types.js";

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

/** Listener for received signals. */
export type SignalListener = (signal: ReceivedSignal) => void;

/** Listener for debug/lifecycle messages shown in the log. */
export type DebugListener = (message: string, level: "info" | "warn" | "error") => void;

/** Connection state snapshot. */
export interface SignalConnectionState {
  url: string;
  protocol: TransportProtocol;
  apiKey: string;
  status: ConnectionStatus;
  error: string | null;
  /** Available models (OpenAI mode only). */
  availableModels: string[];
  /** Currently selected model (OpenAI mode only). */
  selectedModel: string;
  /** Whether a prompt stream is currently active (OpenAI mode only). */
  streaming: boolean;
}

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
// State
// ---------------------------------------------------------------------------

type StateListener = () => void;

let state: SignalConnectionState = {
  url: "ws://localhost:9100",
  protocol: "websocket",
  apiKey: "",
  status: "disconnected",
  error: null,
  availableModels: [],
  selectedModel: "",
  streaming: false,
};

let ws: WebSocket | null = null;
let sseAbort: AbortController | null = null;

const stateListeners: StateListener[] = [];
const signalListeners: SignalListener[] = [];
const debugListeners: DebugListener[] = [];

// ---------------------------------------------------------------------------
// Public API — state
// ---------------------------------------------------------------------------

/** Get the current connection state (read-only snapshot). */
export function getConnectionState(): SignalConnectionState {
  return state;
}

/** Update the URL and auto-detect protocol. */
export function setConnectionUrl(url: string): void {
  const protocol = detectProtocol(url);
  state = { ...state, url, protocol };
  notifyState();
}

/** Update the API key. */
export function setApiKey(key: string): void {
  state = { ...state, apiKey: key };
  notifyState();
}

/** Update the selected model (OpenAI mode). */
export function setSelectedModel(model: string): void {
  state = { ...state, selectedModel: model };
  notifyState();
}

/** Subscribe to connection state changes. Returns unsubscribe function. */
export function subscribeConnection(fn: StateListener): () => void {
  stateListeners.push(fn);
  return () => {
    const idx = stateListeners.indexOf(fn);
    if (idx >= 0) stateListeners.splice(idx, 1);
  };
}

/** Subscribe to incoming signals. Returns unsubscribe function. */
export function onSignal(fn: SignalListener): () => void {
  signalListeners.push(fn);
  return () => {
    const idx = signalListeners.indexOf(fn);
    if (idx >= 0) signalListeners.splice(idx, 1);
  };
}

/** Subscribe to debug/lifecycle messages. Returns unsubscribe function. */
export function onDebug(fn: DebugListener): () => void {
  debugListeners.push(fn);
  return () => {
    const idx = debugListeners.indexOf(fn);
    if (idx >= 0) debugListeners.splice(idx, 1);
  };
}

// ---------------------------------------------------------------------------
// Public API — actions
// ---------------------------------------------------------------------------

/** Connect to the signal source. Protocol is auto-detected from URL. */
export async function connect(url?: string): Promise<void> {
  // Disconnect existing connection first
  disconnectInternal();

  const targetUrl = url ?? state.url;
  const protocol = detectProtocol(targetUrl);
  state = { ...state, url: targetUrl, protocol, status: "connecting", error: null };
  notifyState();
  debug(`Connecting to ${targetUrl} (${protocol})…`, "info");

  if (protocol === "websocket") {
    connectWebSocket(targetUrl);
  } else {
    // HTTP URL — probe for OpenAI-compatible API first
    debug("Probing for OpenAI-compatible API…", "info");
    const isOpenAI = await probeOpenAI(targetUrl);
    if (isOpenAI) {
      state = { ...state, protocol: "openai" };
      connectOpenAI();
    } else {
      debug("Not an OpenAI-compatible API — falling back to SSE.", "info");
      connectSSE(targetUrl);
    }
  }
}

/** Disconnect from the signal source. */
export function disconnect(): void {
  debug("Disconnected by user.", "info");
  disconnectInternal();
  state = {
    ...state,
    status: "disconnected",
    error: null,
    streaming: false,
    availableModels: [],
    selectedModel: "",
  };
  notifyState();
}

/** Send a prompt to an OpenAI-compatible endpoint and stream the response. */
export async function sendPrompt(prompt: string): Promise<void> {
  if (state.protocol !== "openai" || state.status !== "connected") return;
  if (state.streaming) return; // Already streaming

  const correlationId = crypto.randomUUID();
  const baseUrl = state.url.replace(/\/+$/, "");
  const endpoint = `${baseUrl}/v1/chat/completions`;

  sseAbort = new AbortController();
  state = { ...state, streaming: true };
  notifyState();

  debug(`Sending prompt to ${state.selectedModel}…`, "info");

  // Dispatch task_dispatch signal for the prompt
  dispatchSignal({
    id: crypto.randomUUID(),
    type: "task_dispatch",
    timestamp: Date.now(),
    source: "user",
    correlationId,
    payload: { description: prompt, model: state.selectedModel },
    raw: JSON.stringify({ prompt, model: state.selectedModel }),
  });

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (state.apiKey) {
      headers["Authorization"] = `Bearer ${state.apiKey}`;
    }

    const resp = await fetch(proxyUrl(endpoint), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: state.selectedModel,
        messages: [{ role: "user", content: prompt }],
        stream: true,
      }),
      signal: sseAbort.signal,
    });

    if (!resp.ok) {
      const msg = `HTTP ${resp.status} ${resp.statusText}`;
      debug(`Request failed: ${msg}`, "error");
      setError(msg);
      return;
    }

    if (!resp.body) {
      const msg = "Response has no streaming body.";
      debug(msg, "error");
      setError(msg);
      return;
    }

    await readOpenAIStream(resp.body, correlationId);
  } catch (e) {
    if (sseAbort?.signal.aborted) return; // User stopped
    const msg = e instanceof Error ? e.message : String(e);
    debug(`Stream error: ${msg}`, "error");
    setError(`Stream interrupted: ${msg}`);
  } finally {
    state = { ...state, streaming: false };
    notifyState();
  }
}

/** Stop an active prompt stream (OpenAI mode). */
export function stopPrompt(): void {
  if (!state.streaming) return;
  debug("Prompt stream stopped by user.", "info");
  if (sseAbort) {
    sseAbort.abort();
    sseAbort = null;
  }
  state = { ...state, streaming: false };
  notifyState();
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
 *
 * In production builds the URL is returned as-is (no proxy available).
 */
function proxyUrl(url: string): string {
  // Only proxy in dev mode (Vite injects import.meta.env)
  if (!import.meta.env?.DEV) return url;
  return `/__proxy/?target=${encodeURIComponent(url)}`;
}

// ---------------------------------------------------------------------------
// OpenAI probe
// ---------------------------------------------------------------------------

/** Probe an HTTP endpoint for OpenAI-compatible API via GET /v1/models. */
async function probeOpenAI(baseUrl: string): Promise<boolean> {
  try {
    const modelsUrl = baseUrl.replace(/\/+$/, "") + "/v1/models";
    const headers: Record<string, string> = {};
    if (state.apiKey) {
      headers["Authorization"] = `Bearer ${state.apiKey}`;
    }

    const resp = await fetch(proxyUrl(modelsUrl), {
      headers,
      signal: AbortSignal.timeout(3000),
    });

    if (!resp.ok) {
      debug(`Probe failed: HTTP ${resp.status} ${resp.statusText}`, "warn");
      return false;
    }

    const json = (await resp.json()) as Record<string, unknown>;
    const data = json["data"];
    if (Array.isArray(data)) {
      const models = data.map((m) => {
        const entry = m as Record<string, unknown>;
        return String(entry["id"] ?? "unknown");
      });
      state = {
        ...state,
        availableModels: models,
        selectedModel: models[0] ?? "",
      };
      debug(`Found ${models.length} model(s): ${models.join(", ")}`, "info");
      return true;
    }
    debug("Probe returned OK but no models array in response.", "warn");
    return false;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debug(`Probe error: ${msg}`, "warn");
    return false;
  }
}

// ---------------------------------------------------------------------------
// WebSocket transport
// ---------------------------------------------------------------------------

function connectWebSocket(url: string): void {
  try {
    ws = new WebSocket(url);
  } catch (e) {
    const msg = `WebSocket creation failed: ${e instanceof Error ? e.message : String(e)}`;
    debug(msg, "error");
    setError(msg);
    return;
  }

  ws.addEventListener("open", () => {
    state = { ...state, status: "connected", error: null };
    notifyState();
    debug("WebSocket connected.", "info");
  });

  ws.addEventListener("message", (event) => {
    handleMessage(String(event.data));
  });

  ws.addEventListener("error", (event) => {
    // WebSocket error event doesn't carry detail — the close event will follow
    const msg = `WebSocket error on ${url}`;
    debug(msg, "error");
    // Don't set error here — wait for close event which has the code
    void event;
  });

  ws.addEventListener("close", (event) => {
    ws = null;
    const detail = event.wasClean
      ? `Connection closed cleanly (code ${event.code}).`
      : `Connection lost (code ${event.code}, reason: ${event.reason || "none"}).`;
    debug(detail, event.wasClean ? "info" : "warn");

    if (state.status === "connecting") {
      // Never connected — probably wrong URL/port
      setError(`Could not connect to ${state.url} — is the server running?`);
    } else if (!event.wasClean && state.status !== "disconnected") {
      setError(detail);
    } else if (state.status !== "disconnected") {
      state = { ...state, status: "disconnected", error: null };
      notifyState();
    }
  });
}

// ---------------------------------------------------------------------------
// SSE / HTTP streaming transport
// ---------------------------------------------------------------------------

function connectSSE(url: string): void {
  sseAbort = new AbortController();

  const headers: Record<string, string> = {
    Accept: "text/event-stream",
  };

  if (state.apiKey) {
    headers["Authorization"] = `Bearer ${state.apiKey}`;
    debug("Using API key for authentication.", "info");
  }

  fetch(proxyUrl(url), {
    method: "GET",
    headers,
    signal: sseAbort.signal,
  })
    .then((response) => {
      if (!response.ok) {
        const msg = `HTTP ${response.status} ${response.statusText}`;
        debug(`Connection failed: ${msg}`, "error");
        setError(msg);
        return;
      }

      state = { ...state, status: "connected", error: null };
      notifyState();
      debug(`SSE connected (HTTP ${response.status}).`, "info");

      const contentType = response.headers.get("content-type") ?? "";
      debug(`Content-Type: ${contentType}`, "info");

      if (!response.body) {
        const msg = "Response has no streaming body.";
        debug(msg, "error");
        setError(msg);
        return;
      }

      readSSEStream(response.body);
    })
    .catch((e) => {
      if (sseAbort?.signal.aborted) return; // User disconnected
      const msg = e instanceof Error ? e.message : String(e);
      debug(`Connection failed: ${msg}`, "error");
      setError(`Could not connect to ${url} — ${msg}`);
    });
}

/** Read an SSE stream (or NDJSON) from a ReadableStream. */
async function readSSEStream(body: ReadableStream<Uint8Array>): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines (SSE format: "data: {...}\n\n" or NDJSON: "{...}\n")
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // Keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue; // SSE comment or empty

        // Strip "data: " prefix if present (SSE format)
        const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
        if (!payload) continue;

        // Handle SSE "[DONE]" sentinel
        if (payload === "[DONE]") {
          debug("Stream ended ([DONE]).", "info");
          continue;
        }

        handleMessage(payload);
      }
    }

    debug("Stream ended.", "info");
    if (state.status === "connected") {
      state = { ...state, status: "disconnected", error: null };
      notifyState();
    }
  } catch (e) {
    if (sseAbort?.signal.aborted) return;
    const msg = e instanceof Error ? e.message : String(e);
    debug(`Stream error: ${msg}`, "error");
    setError(`Stream interrupted: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible transport
// ---------------------------------------------------------------------------

/** Mark as connected for OpenAI mode (streaming is on-demand via sendPrompt). */
function connectOpenAI(): void {
  const models = state.availableModels;
  state = { ...state, status: "connected", error: null };
  notifyState();
  debug(
    `OpenAI-compatible API detected. ${models.length} model(s) available.`,
    "info",
  );
}

/** Read an OpenAI SSE stream, translating delta chunks into sajou signals. */
async function readOpenAIStream(
  body: ReadableStream<Uint8Array>,
  correlationId: string,
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

        // End sentinel
        if (payload === "[DONE]") {
          dispatchSignal({
            id: crypto.randomUUID(),
            type: "completion",
            timestamp: Date.now(),
            source: state.selectedModel,
            correlationId,
            payload: { success: true, totalTokens: tokenCount },
            raw: payload,
          });
          debug(`Stream complete — ${tokenCount} token chunks received.`, "info");
          continue;
        }

        // Parse OpenAI chunk
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
                source: state.selectedModel,
                correlationId,
                payload: {
                  content,
                  tokenIndex: tokenCount,
                  model: chunk["model"] ?? state.selectedModel,
                },
                raw: payload,
              });
            }

            if (finishReason === "stop") {
              dispatchSignal({
                id: crypto.randomUUID(),
                type: "completion",
                timestamp: Date.now(),
                source: state.selectedModel,
                correlationId,
                payload: {
                  success: true,
                  finishReason,
                  totalTokens: tokenCount,
                },
                raw: payload,
              });
              debug(`Generation finished (${finishReason}) — ${tokenCount} tokens.`, "info");
            }
          }

          // Handle error chunks
          const error = chunk["error"] as Record<string, unknown> | undefined;
          if (error) {
            const errMsg = String(error["message"] ?? "Unknown error");
            dispatchSignal({
              id: crypto.randomUUID(),
              type: "error",
              timestamp: Date.now(),
              source: state.selectedModel,
              correlationId,
              payload: { message: errMsg, severity: "error" },
              raw: payload,
            });
            debug(`API error: ${errMsg}`, "error");
          }
        } catch {
          // Non-JSON line — log as debug
          debug(`[openai] Unparsed: ${payload.slice(0, 100)}`, "warn");
        }
      }
    }

    debug("Response stream ended.", "info");
  } catch (e) {
    if (sseAbort?.signal.aborted) return;
    const msg = e instanceof Error ? e.message : String(e);
    debug(`Stream error: ${msg}`, "error");
    setError(`Stream interrupted: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Shared message handling
// ---------------------------------------------------------------------------

/** Parse an incoming message and dispatch to signal listeners. */
function handleMessage(raw: string): void {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // Check if it's a sajou signal envelope
    const type = parsed["type"] as string | undefined;

    if (type && KNOWN_TYPES.has(type)) {
      // Standard sajou signal
      dispatchSignal({
        id: String(parsed["id"] ?? crypto.randomUUID()),
        type: type as SignalType,
        timestamp: Number(parsed["timestamp"] ?? Date.now()),
        source: String(parsed["source"] ?? "unknown"),
        correlationId: parsed["correlationId"] as string | undefined,
        payload: (parsed["payload"] as Record<string, unknown>) ?? {},
        raw,
      });
      return;
    }

    // Meta messages from the emitter (not signals, but useful debug)
    if (parsed["meta"]) {
      debug(`[meta] ${parsed["meta"]}: ${JSON.stringify(parsed)}`, "info");
      return;
    }

    // Generic JSON — dispatch as best-effort signal
    dispatchSignal({
      id: String(parsed["id"] ?? crypto.randomUUID()),
      type: (type ?? "error") as SignalType,
      timestamp: Number(parsed["timestamp"] ?? Date.now()),
      source: String(parsed["source"] ?? "unknown"),
      correlationId: parsed["correlationId"] as string | undefined,
      payload: parsed,
      raw,
    });
  } catch {
    // Not valid JSON — dispatch as raw text
    dispatchSignal({
      id: crypto.randomUUID(),
      type: "error",
      timestamp: Date.now(),
      source: "raw",
      payload: { message: raw },
      raw,
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function disconnectInternal(): void {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (sseAbort) {
    sseAbort.abort();
    sseAbort = null;
  }
}

function setError(msg: string): void {
  state = { ...state, status: "error", error: msg };
  notifyState();
}

function debug(message: string, level: "info" | "warn" | "error"): void {
  for (const fn of debugListeners) fn(message, level);
}

function dispatchSignal(signal: ReceivedSignal): void {
  for (const fn of signalListeners) fn(signal);
}

function notifyState(): void {
  for (const fn of stateListeners) fn();
}
