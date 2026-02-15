/**
 * Mini WebSocket server for transport tests.
 *
 * Collects received messages and provides helpers for assertions.
 */

import { WebSocketServer } from "ws";
import type { SignalEnvelope } from "@sajou/schema";

/** A lightweight WS server that records received signals. */
export class MockWsServer {
  private wss: WebSocketServer | null = null;
  private _messages: SignalEnvelope[] = [];
  private _port = 0;

  /** The port the server is listening on. */
  get port(): number {
    return this._port;
  }

  /** The WebSocket URL clients should connect to. */
  get url(): string {
    return `ws://localhost:${String(this._port)}`;
  }

  /** All signal envelopes received since the server started. */
  get messages(): readonly SignalEnvelope[] {
    return this._messages;
  }

  /** Starts the server on a random available port. */
  async start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wss = new WebSocketServer({ port: 0 }, () => {
        const addr = this.wss!.address();
        if (typeof addr === "object") {
          this._port = addr.port;
        }
        resolve();
      });

      this.wss.on("connection", (ws) => {
        ws.on("message", (data) => {
          const parsed = JSON.parse(data.toString()) as SignalEnvelope;
          this._messages.push(parsed);
        });
      });
    });
  }

  /** Stops the server and clears received messages. */
  async stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      this._messages = [];
      if (this.wss) {
        this.wss.close(() => {
          this.wss = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /** Forcefully closes all connected clients (useful for reconnect tests). */
  disconnectAll(): void {
    if (this.wss) {
      for (const client of this.wss.clients) {
        client.close();
      }
    }
  }
}
