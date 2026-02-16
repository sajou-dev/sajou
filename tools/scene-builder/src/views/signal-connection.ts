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
import { updateSource, getSignalSourcesState, setSignalSourcesState } from "../state/signal-source-state.js";
import { getSignalTimelineState } from "../state/signal-timeline-state.js";
import {
  parseMessage,
  parseOpenAIChunk,
  parseAnthropicEvent,
  parseOpenClawEvent,
} from "../simulator/signal-parser.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Connection status. */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/** Transport protocol. */
export type TransportProtocol = "websocket" | "sse" | "openai" | "anthropic" | "openclaw";

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

// Known signal types are managed in ../simulator/signal-parser.ts

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

/** Map of sourceId → OpenClaw keepalive interval timer. */
const openClawKeepaliveTimers = new Map<string, ReturnType<typeof setInterval>>();

/** Map of sourceId → OpenClaw reconnect state. */
const openClawReconnectState = new Map<string, { attempts: number; timer: ReturnType<typeof setTimeout> | null }>();

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
// Public API — timeline playback
// ---------------------------------------------------------------------------

/** Pending timeout IDs for a running timeline playback (so we can cancel). */
let playbackTimers: ReturnType<typeof setTimeout>[] = [];
let playbackDoneCallback: (() => void) | null = null;

/**
 * Emit all Signal Timeline steps sequentially via `dispatchSignal()`.
 *
 * Each step is scheduled with a cumulative delay based on `step.delayMs`.
 * The signals flow through the same internal bus that external sources use,
 * so the Choreographer picks them up in Run Mode.
 *
 * @param onDone — optional callback invoked when all steps have been emitted.
 * @returns a cancel function to abort remaining scheduled emissions.
 */
export function emitTimelineSignals(onDone?: () => void): () => void {
  // Cancel any running playback first
  cancelTimelinePlayback();

  const { steps } = getSignalTimelineState();
  if (steps.length === 0) {
    onDone?.();
    return () => {};
  }

  playbackDoneCallback = onDone ?? null;
  let emittedCount = 0;
  let cumulativeDelay = 0;

  for (const step of steps) {
    cumulativeDelay += step.delayMs;
    const delay = cumulativeDelay;

    const timer = setTimeout(() => {
      dispatchSignal({
        id: step.id + "-" + Date.now().toString(36),
        type: step.type,
        timestamp: Date.now(),
        source: "timeline",
        correlationId: step.correlationId,
        payload: step.payload as Record<string, unknown>,
        raw: JSON.stringify({ type: step.type, payload: step.payload }),
      });
      debug(`[timeline] Emitted ${step.type}`, "info", "timeline");

      emittedCount++;
      if (emittedCount >= steps.length) {
        playbackTimers = [];
        playbackDoneCallback?.();
        playbackDoneCallback = null;
      }
    }, delay);

    playbackTimers.push(timer);
  }

  return cancelTimelinePlayback;
}

/** Cancel any running timeline playback. */
export function cancelTimelinePlayback(): void {
  for (const t of playbackTimers) clearTimeout(t);
  playbackTimers = [];
  playbackDoneCallback = null;
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

  if (protocol === "openclaw") {
    connectOpenClaw(conn, url, apiKey);
  } else if (protocol === "websocket") {
    connectWebSocket(conn, url);
  } else if (protocol === "anthropic") {
    debug(`[${sourceId}] Probing for Anthropic API…`, "info", sourceId);
    const probeResult = await probeAnthropic(url, apiKey, sourceId);
    if (probeResult) {
      setSourceState(sourceId, {
        protocol: "anthropic",
        availableModels: probeResult.models,
        selectedModel: probeResult.models[0] ?? "",
        status: "connected",
        error: null,
      });
      debug(
        `[${sourceId}] Anthropic API detected. ${probeResult.models.length} model(s) available.`,
        "info",
        sourceId,
      );
    } else {
      debug(`[${sourceId}] Anthropic probe failed — falling back to SSE.`, "info", sourceId);
      connectSSE(conn, url, apiKey);
    }
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

  // Clean up OpenClaw keepalive + reconnect state
  clearOpenClawTimers(sourceId);

  connections.delete(sourceId);
  debug(`[${sourceId}] Disconnected.`, "info", sourceId);
  setSourceState(sourceId, {
    status: "disconnected",
    error: null,
    streaming: false,
  });
}

/** Send a prompt to a connected source (OpenAI or Anthropic) and stream the response. */
export async function sendPromptToSource(
  sourceId: string,
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
  protocol?: TransportProtocol,
): Promise<void> {
  if (protocol === "anthropic") {
    return sendAnthropicPrompt(sourceId, url, apiKey, model, prompt);
  }
  return sendOpenAIPrompt(sourceId, url, apiKey, model, prompt);
}

/** Send a prompt to an OpenAI-compatible source and stream the response. */
async function sendOpenAIPrompt(
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

/** Detect protocol from URL scheme (initial guess — probes refine it). */
function detectProtocol(url: string): TransportProtocol {
  const lower = url.trim().toLowerCase();
  if (lower.includes("18789") || lower.includes("openclaw")) return "openclaw";
  if (lower.startsWith("ws://") || lower.startsWith("wss://")) return "websocket";
  if (lower.includes("anthropic")) return "anthropic";
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
// OpenClaw WebSocket transport
// ---------------------------------------------------------------------------

/** Maximum reconnect attempts before giving up. */
const OPENCLAW_MAX_RECONNECT = 10;

/** Maximum backoff delay in ms (30s). */
const OPENCLAW_MAX_BACKOFF_MS = 30_000;

/** Default keepalive interval in ms when server doesn't specify one. */
const OPENCLAW_DEFAULT_TICK_MS = 15_000;

/**
 * Connect to an OpenClaw gateway via WebSocket.
 *
 * Implements the full OpenClaw handshake:
 * 1. Open WebSocket
 * 2. Receive `connect.challenge` with `{nonce, ts}`
 * 3. Send `connect` request with auth token
 * 4. Receive `{type:"res", ok:true}` → connected
 *
 * After connection: keepalive pings, signal parsing, exponential backoff reconnect.
 */
function connectOpenClaw(conn: SourceConnection, url: string, apiKey: string): void {
  // Clear any pending reconnect timer
  const reconnState = openClawReconnectState.get(conn.sourceId);
  if (reconnState?.timer) {
    clearTimeout(reconnState.timer);
    reconnState.timer = null;
  }

  try {
    conn.ws = new WebSocket(url);
  } catch (e) {
    const msg = `WebSocket creation failed: ${e instanceof Error ? e.message : String(e)}`;
    debug(`[${conn.sourceId}] ${msg}`, "error", conn.sourceId);
    setSourceState(conn.sourceId, { status: "error", error: msg });
    return;
  }

  let handshakeComplete = false;

  conn.ws.addEventListener("open", () => {
    debug(`[${conn.sourceId}] OpenClaw WebSocket opened — waiting for challenge…`, "info", conn.sourceId);
  });

  conn.ws.addEventListener("message", (event) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(event.data)) as Record<string, unknown>;
    } catch {
      debug(`[${conn.sourceId}] [openclaw] Unparseable message: ${String(event.data).slice(0, 100)}`, "warn", conn.sourceId);
      return;
    }

    // --- Phase 1: Handshake ---
    if (!handshakeComplete) {
      // Step 2: Receive challenge — may arrive as {type:"connect.challenge"} or
      // wrapped in envelope {type:"event", event:"connect.challenge", payload:{nonce,ts}}
      if (msg["type"] === "connect.challenge" || msg["event"] === "connect.challenge") {
        debug(`[${conn.sourceId}] Challenge received — sending auth…`, "info", conn.sourceId);
        const connectReq = {
          type: "req",
          id: crypto.randomUUID(),
          method: "connect",
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: "gateway-client",
              version: "0.1.0",
              platform: "web",
              mode: "backend",
            },
            role: "operator",
            scopes: ["operator.read"],
            caps: [],
            commands: [],
            permissions: {},
            auth: { token: apiKey },
            locale: "fr-CH",
            userAgent: "sajou/0.1.0",
          },
        };
        conn.ws?.send(JSON.stringify(connectReq));
        return;
      }

      // Step 4: Receive connect response
      if (msg["type"] === "res") {
        if (msg["ok"] === true) {
          handshakeComplete = true;

          // Reset reconnect state on successful connection
          openClawReconnectState.set(conn.sourceId, { attempts: 0, timer: null });

          // Extract tickIntervalMs for keepalive
          const result = msg["result"] as Record<string, unknown> | undefined;
          const tickMs = typeof result?.["tickIntervalMs"] === "number"
            ? result["tickIntervalMs"]
            : OPENCLAW_DEFAULT_TICK_MS;

          startOpenClawKeepalive(conn, tickMs as number);

          setSourceState(conn.sourceId, { status: "connected", error: null });
          debug(`[${conn.sourceId}] OpenClaw connected (keepalive ${tickMs}ms).`, "info", conn.sourceId);
        } else {
          const rawErr = msg["error"] ?? msg["message"] ?? "Authentication failed";
          const errMsg = typeof rawErr === "object" && rawErr !== null
            ? (rawErr as Record<string, unknown>)["message"] as string
              ?? JSON.stringify(rawErr)
            : String(rawErr);
          debug(`[${conn.sourceId}] OpenClaw handshake rejected: ${errMsg}`, "error", conn.sourceId);
          debug(`[${conn.sourceId}] [openclaw] Full response: ${JSON.stringify(msg).slice(0, 300)}`, "warn", conn.sourceId);
          setSourceState(conn.sourceId, { status: "error", error: errMsg });
          conn.ws?.close();
        }
        return;
      }

      // Unexpected message during handshake — log and ignore
      debug(`[${conn.sourceId}] [openclaw] Unexpected handshake message: ${JSON.stringify(msg).slice(0, 120)}`, "warn", conn.sourceId);
      return;
    }

    // --- Phase 2: Normal operation — parse events ---

    // Ignore responses to our keepalive pings/health checks
    if (msg["type"] === "pong" || msg["type"] === "res") {
      return;
    }

    const signal = parseOpenClawEvent(msg);
    if (signal) {
      dispatchSignal(
        { ...signal, type: signal.type as SignalType, raw: String(event.data) },
        conn.sourceId,
      );
    }
    // null = internal event (already logged in parser if needed)
  });

  conn.ws.addEventListener("error", () => {
    debug(`[${conn.sourceId}] OpenClaw WebSocket error.`, "error", conn.sourceId);
  });

  conn.ws.addEventListener("close", (event) => {
    conn.ws = null;
    clearOpenClawKeepalive(conn.sourceId);

    const existing = connections.get(conn.sourceId);
    if (!existing) return; // Already cleaned up by disconnectSource

    if (event.wasClean) {
      debug(`[${conn.sourceId}] OpenClaw disconnected cleanly.`, "info", conn.sourceId);
      setSourceState(conn.sourceId, { status: "disconnected", error: null });
      connections.delete(conn.sourceId);
    } else {
      // Attempt reconnect with exponential backoff
      const state = openClawReconnectState.get(conn.sourceId) ?? { attempts: 0, timer: null };
      state.attempts++;

      if (state.attempts > OPENCLAW_MAX_RECONNECT) {
        const msg = `Connection lost after ${OPENCLAW_MAX_RECONNECT} reconnect attempts.`;
        debug(`[${conn.sourceId}] ${msg}`, "error", conn.sourceId);
        setSourceState(conn.sourceId, { status: "error", error: msg });
        connections.delete(conn.sourceId);
        openClawReconnectState.delete(conn.sourceId);
        return;
      }

      const delay = Math.min(1000 * Math.pow(2, state.attempts - 1), OPENCLAW_MAX_BACKOFF_MS);
      debug(
        `[${conn.sourceId}] OpenClaw connection lost — reconnecting in ${delay}ms (attempt ${state.attempts}/${OPENCLAW_MAX_RECONNECT})…`,
        "warn",
        conn.sourceId,
      );
      setSourceState(conn.sourceId, { status: "connecting", error: `Reconnecting (attempt ${state.attempts})…` });

      state.timer = setTimeout(() => {
        state.timer = null;
        openClawReconnectState.set(conn.sourceId, state);
        // Re-establish connection using same conn handle
        connectOpenClaw(conn, url, apiKey);
      }, delay);

      openClawReconnectState.set(conn.sourceId, state);
    }
  });
}

/** Start the OpenClaw keepalive ping interval. */
function startOpenClawKeepalive(conn: SourceConnection, intervalMs: number): void {
  clearOpenClawKeepalive(conn.sourceId);
  const timer = setInterval(() => {
    if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify({ type: "req", id: crypto.randomUUID(), method: "health" }));
    }
  }, intervalMs);
  openClawKeepaliveTimers.set(conn.sourceId, timer);
}

/** Clear the OpenClaw keepalive interval for a source. */
function clearOpenClawKeepalive(sourceId: string): void {
  const timer = openClawKeepaliveTimers.get(sourceId);
  if (timer) {
    clearInterval(timer);
    openClawKeepaliveTimers.delete(sourceId);
  }
}

/** Clear all OpenClaw timers (keepalive + reconnect) for a source. */
function clearOpenClawTimers(sourceId: string): void {
  clearOpenClawKeepalive(sourceId);
  const reconnState = openClawReconnectState.get(sourceId);
  if (reconnState?.timer) {
    clearTimeout(reconnState.timer);
  }
  openClawReconnectState.delete(sourceId);
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
          const result = parseOpenAIChunk(chunk, model, correlationId, tokenCount);

          for (const signal of result.signals) {
            dispatchSignal({ ...signal, type: signal.type as SignalType, raw: payload }, conn.sourceId);
          }
          tokenCount = result.tokenCount;

          if (result.done) {
            debug(`[${conn.sourceId}] Generation finished — ${tokenCount} tokens.`, "info", conn.sourceId);
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
// Anthropic API
// ---------------------------------------------------------------------------

/** Default models to offer when Anthropic probe succeeds but no model list is available. */
const ANTHROPIC_DEFAULT_MODELS = [
  "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-6",
];

/** Probe an Anthropic API endpoint. Returns available models on success. */
async function probeAnthropic(
  baseUrl: string,
  apiKey: string,
  sourceId: string,
): Promise<{ models: string[] } | null> {
  if (!apiKey) {
    debug(`[${sourceId}] Anthropic probe requires an API key.`, "warn", sourceId);
    return null;
  }

  try {
    // Try listing models via the Anthropic models endpoint
    const modelsUrl = baseUrl.replace(/\/+$/, "") + "/v1/models";
    const resp = await fetch(proxyUrl(modelsUrl), {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (resp.ok) {
      const json = (await resp.json()) as Record<string, unknown>;
      const data = json["data"];
      if (Array.isArray(data)) {
        const models = data.map((m) => {
          const entry = m as Record<string, unknown>;
          return String(entry["id"] ?? "unknown");
        });
        if (models.length > 0) {
          debug(`[${sourceId}] Anthropic probe: found ${models.length} model(s).`, "info", sourceId);
          return { models };
        }
      }
    }

    // Fallback: if we got a 401/403 with a recognisable Anthropic error, the API is there
    if (resp.status === 401 || resp.status === 403) {
      debug(`[${sourceId}] Anthropic probe: auth error (${resp.status}) — API detected but key may be invalid.`, "warn", sourceId);
      return null;
    }

    // If the models endpoint doesn't exist (404) but the URL looks Anthropic, offer defaults
    if (resp.status === 404) {
      debug(`[${sourceId}] Anthropic probe: models endpoint not found — using defaults.`, "info", sourceId);
      return { models: ANTHROPIC_DEFAULT_MODELS };
    }

    debug(`[${sourceId}] Anthropic probe: HTTP ${resp.status} — using defaults.`, "info", sourceId);
    return { models: ANTHROPIC_DEFAULT_MODELS };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debug(`[${sourceId}] Anthropic probe error: ${msg}`, "warn", sourceId);
    return null;
  }
}

/** Send a prompt to an Anthropic source and stream the response as sajou signals. */
async function sendAnthropicPrompt(
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
  const endpoint = `${baseUrl}/v1/messages`;

  conn.sseAbort = new AbortController();
  setSourceState(sourceId, { streaming: true });

  debug(`[${sourceId}] Sending prompt to Anthropic ${model}…`, "info", sourceId);

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
    const resp = await fetch(proxyUrl(endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: true,
        max_tokens: 4096,
      }),
      signal: conn.sseAbort.signal,
    });

    if (!resp.ok) {
      const msg = `HTTP ${resp.status} ${resp.statusText}`;
      debug(`[${sourceId}] Anthropic request failed: ${msg}`, "error", sourceId);
      setSourceState(sourceId, { status: "error", error: msg, streaming: false });
      return;
    }

    if (!resp.body) {
      const msg = "Response has no streaming body.";
      debug(`[${sourceId}] ${msg}`, "error", sourceId);
      setSourceState(sourceId, { status: "error", error: msg, streaming: false });
      return;
    }

    await readAnthropicStream(conn, resp.body, correlationId, model);
  } catch (e) {
    if (conn.sseAbort?.signal.aborted) return; // User stopped
    const msg = e instanceof Error ? e.message : String(e);
    debug(`[${sourceId}] Anthropic stream error: ${msg}`, "error", sourceId);
    setSourceState(sourceId, { error: `Stream interrupted: ${msg}`, streaming: false });
  } finally {
    setSourceState(sourceId, { streaming: false });
  }
}

/**
 * Read an Anthropic SSE stream, translating events into sajou signals.
 *
 * Anthropic streaming events:
 * - `message_start` → agent_state_change (idle → acting)
 * - `content_block_delta` + `delta.type === "text_delta"` → text_delta signal
 * - `content_block_delta` + `delta.type === "thinking_delta"` → thinking signal
 * - `content_block_start` + `type === "tool_use"` → tool_call signal
 * - `message_delta` with usage → token_usage signal
 * - `message_stop` → completion signal
 */
async function readAnthropicStream(
  conn: SourceConnection,
  body: ReadableStream<Uint8Array>,
  correlationId: string,
  model: string,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let textChunkIndex = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEventType = "";

      for (const line of lines) {
        const trimmed = line.trim();

        // SSE event type line
        if (trimmed.startsWith("event:")) {
          currentEventType = trimmed.slice(6).trim();
          continue;
        }

        // SSE data line
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (!payload) continue;

        try {
          const event = JSON.parse(payload) as Record<string, unknown>;
          const result = parseAnthropicEvent(currentEventType, event, model, correlationId);

          if (result && "signal" in result) {
            dispatchSignal(
              { ...result.signal, type: result.signal.type as SignalType, raw: payload },
              conn.sourceId,
            );
            // Track text chunk count for debug log
            if (result.signal.type === "text_delta") textChunkIndex++;
            // Log lifecycle events
            if (result.signal.type === "completion") {
              debug(
                `[${conn.sourceId}] Anthropic stream complete — ${textChunkIndex} text chunks.`,
                "info",
                conn.sourceId,
              );
            }
            if (result.signal.type === "error") {
              debug(
                `[${conn.sourceId}] Anthropic API error: ${String(result.signal.payload["message"])}`,
                "error",
                conn.sourceId,
              );
            }
          }
        } catch {
          debug(`[${conn.sourceId}] [anthropic] Unparsed: ${payload.slice(0, 100)}`, "warn", conn.sourceId);
        }

        currentEventType = "";
      }
    }

    debug(`[${conn.sourceId}] Anthropic response stream ended.`, "info", conn.sourceId);
  } catch (e) {
    if (conn.sseAbort?.signal.aborted) return;
    const msg = e instanceof Error ? e.message : String(e);
    debug(`[${conn.sourceId}] Anthropic stream error: ${msg}`, "error", conn.sourceId);
    setSourceState(conn.sourceId, { error: `Stream interrupted: ${msg}` });
  }
}

// ---------------------------------------------------------------------------
// Shared message handling
// ---------------------------------------------------------------------------

/** Parse an incoming message and dispatch to signal listeners. */
function handleMessage(raw: string, sourceId: string): void {
  const result = parseMessage(raw);
  if (!result.ok) {
    dispatchSignal({
      id: crypto.randomUUID(),
      type: "error",
      timestamp: Date.now(),
      source: "raw",
      payload: { message: result.error },
      raw,
    }, sourceId);
    return;
  }
  if ("meta" in result) {
    debug(`[meta] ${result.key}: ${JSON.stringify(result.data)}`, "info", sourceId);
    return;
  }
  dispatchSignal({ ...result.signal, type: result.signal.type as SignalType, raw }, sourceId);
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

export function dispatchSignal(signal: ReceivedSignal, sourceId = ""): void {
  for (const fn of signalListeners) fn(signal, sourceId);
}

function notifyState(): void {
  for (const fn of stateListeners) fn();
}

// ---------------------------------------------------------------------------
// Local SSE auto-connect — listens to /__signals__/stream (tap signals)
// ---------------------------------------------------------------------------

let localSSE: EventSource | null = null;

/** Well-known source ID for the local SSE stream. */
const LOCAL_SOURCE_ID = "local";

/**
 * Ensure a "Local" source exists in the signal-source-state store,
 * always as the first entry so it appears first in the chip bar.
 * Returns its ID (always `"local"`).
 */
function ensureLocalSource(): string {
  const state = getSignalSourcesState();
  if (state.sources.some((s) => s.id === LOCAL_SOURCE_ID)) return LOCAL_SOURCE_ID;

  // Prepend a fully-formed SignalSource
  setSignalSourcesState({
    ...state,
    sources: [
      {
        id: LOCAL_SOURCE_ID,
        name: "Local",
        color: "#4EC9B0",
        protocol: "sse",
        url: "/__signals__/stream",
        apiKey: "",
        status: "connecting",
        error: null,
        eventsPerSecond: 0,
        availableModels: [],
        selectedModel: "",
        streaming: false,
      },
      ...state.sources,
    ],
  });

  return LOCAL_SOURCE_ID;
}

/**
 * Connect the local signal pipeline:
 * 1. Install Claude Code hooks via `POST /api/tap/connect`
 * 2. Open EventSource on `/__signals__/stream` to receive signals
 *
 * Creates a proper source entry so signals are visible in the raw log
 * and can be wired to the choreographer.
 *
 * Idempotent — calling multiple times is safe.
 */
export async function connectLocalSSE(): Promise<void> {
  if (localSSE) return;

  const sourceId = ensureLocalSource();
  updateSource(sourceId, { status: "connecting", error: null });

  // Install Claude Code hooks
  try {
    const resp = await fetch("/api/tap/connect", { method: "POST" });
    const body = await resp.json() as { ok: boolean; error?: string };
    if (!body.ok) {
      debug(`[local] Hook install failed: ${body.error ?? "unknown"}`, "error", sourceId);
      // Continue anyway — SSE stream still works for manual signals (curl, etc.)
    } else {
      debug("[local] Claude Code hooks installed.", "info", sourceId);
    }
  } catch (e) {
    debug(`[local] Hook install request failed: ${e instanceof Error ? e.message : String(e)}`, "warn", sourceId);
    // Continue — SSE still useful without hooks
  }

  // Open SSE stream
  try {
    localSSE = new EventSource("/__signals__/stream");
  } catch {
    debug("[local] Failed to create EventSource for /__signals__/stream", "warn", sourceId);
    updateSource(sourceId, { status: "error", error: "EventSource creation failed" });
    return;
  }

  localSSE.addEventListener("open", () => {
    updateSource(sourceId, { status: "connected", error: null });
    debug("[local] Connected to local signal stream.", "info", sourceId);
  });

  localSSE.addEventListener("message", (event) => {
    const raw = event.data as string;
    if (!raw) return;

    try {
      const envelope = JSON.parse(raw) as Record<string, unknown>;
      const signal: ReceivedSignal = {
        id: String(envelope["id"] ?? crypto.randomUUID()),
        type: String(envelope["type"] ?? "event") as SignalType,
        timestamp: typeof envelope["timestamp"] === "number" ? envelope["timestamp"] : Date.now(),
        source: String(envelope["source"] ?? "local"),
        correlationId: typeof envelope["correlationId"] === "string" ? envelope["correlationId"] : undefined,
        payload: (typeof envelope["payload"] === "object" && envelope["payload"] !== null
          ? envelope["payload"]
          : {}) as Record<string, unknown>,
        raw,
      };
      dispatchSignal(signal, sourceId);
    } catch {
      debug(`[local] Unparseable SSE message: ${raw.slice(0, 120)}`, "warn", sourceId);
    }
  });

  localSSE.addEventListener("error", () => {
    updateSource(sourceId, { status: "error", error: "SSE connection lost (auto-reconnecting)" });
    debug("[local] SSE connection error (will auto-reconnect).", "warn", sourceId);
  });
}

/**
 * Disconnect the local signal pipeline:
 * 1. Close the SSE stream
 * 2. Uninstall Claude Code hooks via `POST /api/tap/disconnect`
 *
 * The source stays in the store (cannot be removed).
 * Call `connectLocalSSE()` again to re-enable.
 */
export async function disconnectLocalSSE(): Promise<void> {
  if (localSSE) {
    localSSE.close();
    localSSE = null;
  }

  updateSource(LOCAL_SOURCE_ID, { status: "disconnected", error: null });

  // Uninstall Claude Code hooks
  try {
    const resp = await fetch("/api/tap/disconnect", { method: "POST" });
    const body = await resp.json() as { ok: boolean; error?: string };
    if (body.ok) {
      debug("[local] Claude Code hooks removed.", "info", LOCAL_SOURCE_ID);
    }
  } catch {
    // Best-effort — hooks will be cleaned up on server shutdown anyway
  }

  debug("[local] Local signal stream disconnected.", "info", LOCAL_SOURCE_ID);
}

/** Whether the local SSE stream is currently active. */
export function isLocalSSEConnected(): boolean {
  return localSSE !== null;
}
