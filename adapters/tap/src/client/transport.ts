/**
 * Transport abstraction for sending signals to a sajou endpoint.
 *
 * Implementations handle the specifics of HTTP POST or WebSocket delivery.
 */

import type { SignalEnvelope } from "@sajou/schema";

/** Transport interface for pushing signals to a sajou endpoint. */
export interface TapTransport {
  /** Establishes the connection (no-op for stateless transports like HTTP). */
  connect(): Promise<void>;
  /** Sends a signal envelope to the endpoint. */
  send(signal: SignalEnvelope): Promise<void>;
  /** Closes the connection and releases resources. */
  close(): Promise<void>;
  /** Whether the transport is currently connected and ready to send. */
  readonly connected: boolean;
}
