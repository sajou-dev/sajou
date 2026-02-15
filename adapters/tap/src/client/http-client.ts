/**
 * HTTP transport — sends signals via POST to a sajou endpoint.
 *
 * Stateless, fire-and-forget. Each signal is an independent HTTP request.
 * Default target is the scene-builder's `POST /api/signal` endpoint.
 */

import type { SignalEnvelope } from "@sajou/schema";
import type { TapTransport } from "./transport.js";

/** Default endpoint for the scene-builder signal API. */
const DEFAULT_ENDPOINT = "http://localhost:5175/api/signal";

/** Options for creating an HTTP transport. */
export interface HttpTransportOptions {
  /** The URL to POST signals to. */
  endpoint?: string;
}

/** HTTP POST transport — implements TapTransport. */
export class HttpTransport implements TapTransport {
  private readonly endpoint: string;
  private isConnected = false;

  constructor(options?: HttpTransportOptions) {
    this.endpoint = options?.endpoint ?? DEFAULT_ENDPOINT;
  }

  get connected(): boolean {
    return this.isConnected;
  }

  /** Marks transport as ready (HTTP is stateless, no real connection). */
  async connect(): Promise<void> {
    this.isConnected = true;
  }

  /** Sends a signal envelope via HTTP POST. */
  async send(signal: SignalEnvelope): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signal),
    });
    if (!response.ok) {
      throw new Error(
        `HTTP ${String(response.status)}: ${await response.text()}`,
      );
    }
  }

  /** Marks transport as disconnected. */
  async close(): Promise<void> {
    this.isConnected = false;
  }
}
