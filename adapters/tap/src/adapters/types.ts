/**
 * Adapter interface for connecting different agent types to sajou via tap.
 *
 * Each adapter knows how to intercept events from a specific agent type
 * and translate them into sajou signals.
 */

import type { TapTransport } from "../client/transport.js";

/** Lifecycle contract for a tap adapter. */
export interface TapAdapter {
  /** Human-readable adapter name (e.g., "claude-code", "jsonl"). */
  readonly name: string;
  /** The source identifier used in signals (e.g., "adapter:tap:claude"). */
  readonly source: string;
  /** Starts the adapter — installs hooks, begins capturing, etc. */
  start(transport: TapTransport): Promise<void>;
  /** Stops the adapter — removes hooks, restores state, releases resources. */
  stop(): Promise<void>;
}
