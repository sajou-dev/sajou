/**
 * Server connection state — single source of truth for server connectivity.
 *
 * Tracks whether the scene-builder is connected to the sajou MCP server,
 * handles reconnection with exponential backoff, and maintains a log of
 * connection events for the UI status indicator.
 *
 * This module replaces the inline probe + sync/commands init that was
 * scattered in workspace.ts. It owns the full lifecycle:
 *   probe → restore → start sync/commands → monitor → reconnect
 */

import { probeServer, getServerBaseUrl, setServerBaseUrl } from "./server-config.js";
import { initStateSync } from "./state-sync.js";
import { initCommandConsumer, stopCommandConsumer } from "./command-consumer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServerConnectionStatus = "connected" | "local" | "reconnecting";

export interface ConnectionLogEntry {
  time: number;
  message: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const MAX_LOG_ENTRIES = 20;

/** Backoff schedule in milliseconds. */
const BACKOFF_STEPS = [5_000, 10_000, 20_000, 40_000, 60_000];

let status: ServerConnectionStatus = "local";
let lastContactAt: number | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let log: ConnectionLogEntry[] = [];
let syncStarted = false;

/** Callback from workspace to apply server state on reconnect. */
let restoreCallback: ((data: Record<string, unknown>) => void) | null = null;

/** Subscriber callbacks. */
const subscribers: Array<() => void> = [];

// ---------------------------------------------------------------------------
// Pub/sub
// ---------------------------------------------------------------------------

function notify(): void {
  for (const fn of subscribers) fn();
}

/** Subscribe to connection state changes. Returns unsubscribe function. */
export function subscribeConnection(fn: () => void): () => void {
  subscribers.push(fn);
  return () => {
    const idx = subscribers.indexOf(fn);
    if (idx >= 0) subscribers.splice(idx, 1);
  };
}

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

/** Current connection status. */
export function getConnectionStatus(): ServerConnectionStatus {
  return status;
}

/** Timestamp of last successful server exchange, or null. */
export function getLastContactAt(): number | null {
  return lastContactAt;
}

/** Connection event log (most recent last). */
export function getConnectionLog(): readonly ConnectionLogEntry[] {
  return log;
}

/** Number of reconnect attempts since last disconnect. */
export function getReconnectAttempts(): number {
  return reconnectAttempts;
}

// ---------------------------------------------------------------------------
// Log helper
// ---------------------------------------------------------------------------

function addLog(message: string): void {
  log.push({ time: Date.now(), message });
  if (log.length > MAX_LOG_ENTRIES) {
    log = log.slice(-MAX_LOG_ENTRIES);
  }
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

function setConnected(): void {
  const wasReconnecting = status === "reconnecting";
  status = "connected";
  lastContactAt = Date.now();
  reconnectAttempts = 0;

  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (wasReconnecting) {
    addLog("Reconnected to server");
  } else {
    addLog("Connected to server");
  }
  notify();
}

function setLocal(): void {
  status = "local";
  addLog("Server not available — working offline");
  notify();
}

function setReconnecting(): void {
  if (status !== "reconnecting") {
    status = "reconnecting";
    addLog("Connection lost — reconnecting…");
    notify();
  }
}

// ---------------------------------------------------------------------------
// Reconnect logic
// ---------------------------------------------------------------------------

function scheduleReconnect(): void {
  if (reconnectTimer !== null) return;

  const delay = BACKOFF_STEPS[Math.min(reconnectAttempts, BACKOFF_STEPS.length - 1)];
  reconnectAttempts++;

  addLog(`Retry in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts})`);
  notify();

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await attemptReconnect();
  }, delay);
}

async function attemptReconnect(): Promise<void> {
  try {
    const probe = await probeServer();
    if (!probe.available) {
      scheduleReconnect();
      return;
    }

    // Server is back — restore state if it has any
    if (probe.hasState && probe.data && restoreCallback) {
      restoreCallback(probe.data);
    }

    // Start sync/commands if not already running
    if (!syncStarted) {
      initStateSync();
      initCommandConsumer();
      syncStarted = true;
    }

    setConnected();
  } catch {
    scheduleReconnect();
  }
}

// ---------------------------------------------------------------------------
// Public API — called by state-sync.ts and command-consumer.ts
// ---------------------------------------------------------------------------

/** Call on every successful server exchange (push, SSE open, etc.). */
export function notifyServerContact(): void {
  lastContactAt = Date.now();
  if (status === "reconnecting") {
    setConnected();
  }
}

/** Call when a server exchange fails (push error, SSE disconnect, etc.). */
export function notifyServerLost(): void {
  if (status !== "connected") return; // Only trigger from connected state
  setReconnecting();
  stopCommandConsumer();
  syncStarted = false;
  scheduleReconnect();
}

// ---------------------------------------------------------------------------
// Server URL switch
// ---------------------------------------------------------------------------

/** Re-export for the popover UI. */
export { getServerBaseUrl } from "./server-config.js";

/**
 * Switch to a different server URL. Disconnects, updates the base URL,
 * and re-probes the new server. Pass empty string to reset to Vite proxy.
 */
export async function switchServer(newUrl: string): Promise<void> {
  // Stop current connection
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (syncStarted) {
    stopCommandConsumer();
    syncStarted = false;
  }

  setServerBaseUrl(newUrl);
  reconnectAttempts = 0;

  const label = newUrl || "proxy (default)";
  addLog(`Switching to ${label}…`);
  status = "reconnecting";
  notify();

  await attemptReconnect();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Initialize server connection — probes the server and starts sync/commands.
 *
 * Replaces the scattered probe + initStateSync + initCommandConsumer calls
 * in workspace.ts. Call ONCE during workspace init (after restoreState).
 *
 * @param onServerState - Callback to apply server state to local stores.
 *                        Called on initial probe and on reconnect if server has state.
 */
export async function initServerConnection(
  onServerState?: (data: Record<string, unknown>) => void,
): Promise<void> {
  restoreCallback = onServerState ?? null;

  addLog("Probing server…");
  notify();

  const probe = await probeServer();

  if (!probe.available) {
    setLocal();
    // Start reconnect attempts even from local — server might start later
    scheduleReconnect();
    return;
  }

  // Server available — restore state if present
  if (probe.hasState && probe.data && restoreCallback) {
    restoreCallback(probe.data);
  }

  // Start sync + commands
  initStateSync();
  initCommandConsumer();
  syncStarted = true;

  setConnected();
}
