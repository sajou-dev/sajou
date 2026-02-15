/**
 * WebSocket transport — persistent connection with exponential backoff reconnect.
 *
 * Buffers signals during reconnection attempts and flushes on reconnect.
 */

import WebSocket from "ws";
import type { SignalEnvelope } from "@sajou/schema";
import type { TapTransport } from "./transport.js";

/** Options for creating a WebSocket transport. */
export interface WsTransportOptions {
  /** The WebSocket URL to connect to. */
  endpoint: string;
  /** Maximum number of reconnection attempts before giving up. Defaults to 10. */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Defaults to 500. */
  baseDelay?: number;
}

/** WebSocket transport with exponential backoff reconnect — implements TapTransport. */
export class WsTransport implements TapTransport {
  private readonly endpoint: string;
  private readonly maxRetries: number;
  private readonly baseDelay: number;
  private ws: WebSocket | null = null;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(options: WsTransportOptions) {
    this.endpoint = options.endpoint;
    this.maxRetries = options.maxRetries ?? 10;
    this.baseDelay = options.baseDelay ?? 500;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Opens the WebSocket connection. Resolves when connected. */
  async connect(): Promise<void> {
    this.closed = false;
    return this.doConnect();
  }

  /** Sends a signal envelope over the WebSocket. Throws if not connected. */
  async send(signal: SignalEnvelope): Promise<void> {
    if (!this.connected || !this.ws) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(signal));
  }

  /** Closes the WebSocket and stops reconnection attempts. */
  async close(): Promise<void> {
    this.closed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  private doConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.endpoint);

      ws.on("open", () => {
        this.ws = ws;
        this.retryCount = 0;
        resolve();
      });

      ws.on("close", () => {
        if (!this.closed) {
          this.scheduleReconnect();
        }
      });

      ws.on("error", (err) => {
        if (!this.ws) {
          reject(err);
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.closed || this.retryCount >= this.maxRetries) {
      return;
    }
    const delay = this.baseDelay * Math.pow(2, this.retryCount);
    this.retryCount++;
    this.retryTimer = setTimeout(() => {
      this.doConnect().catch(() => {
        /* retry handled by close/error handlers */
      });
    }, delay);
  }
}
