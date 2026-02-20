import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WsTransport } from "../src/client/ws-client.js";
import { createTapSignal } from "../src/signal/signal-factory.js";
import { MockWsServer } from "./helpers/mock-server.js";

describe("WsTransport", () => {
  const server = new MockWsServer();

  beforeEach(async () => {
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it("connects to a WebSocket server", async () => {
    const transport = new WsTransport({ endpoint: server.url });
    expect(transport.connected).toBe(false);

    await transport.connect();
    expect(transport.connected).toBe(true);

    await transport.close();
    expect(transport.connected).toBe(false);
  });

  it("sends signal envelopes as JSON", async () => {
    const transport = new WsTransport({ endpoint: server.url });
    await transport.connect();

    const signal = createTapSignal("tool_call", {
      toolName: "Bash",
      agentId: "claude",
      callId: "c-1",
    });
    await transport.send(signal);

    // Give the server a moment to receive
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(server.messages).toHaveLength(1);
    expect(server.messages[0]!.type).toBe("tool_call");
    expect(server.messages[0]!.id).toBe(signal.id);

    await transport.close();
  });

  it("throws when sending while disconnected", async () => {
    const transport = new WsTransport({ endpoint: server.url });
    const signal = createTapSignal("error", {
      message: "boom",
      severity: "error",
    });

    await expect(transport.send(signal)).rejects.toThrow(
      "WebSocket is not connected",
    );
  });

  it("rejects connect when server is unreachable", async () => {
    const transport = new WsTransport({
      endpoint: "ws://localhost:1",
      maxRetries: 0,
    });

    await expect(transport.connect()).rejects.toThrow();
  });

  it("attempts reconnection after disconnect", async () => {
    const transport = new WsTransport({
      endpoint: server.url,
      baseDelay: 50,
      maxRetries: 3,
    });
    await transport.connect();
    expect(transport.connected).toBe(true);

    // Force disconnect
    server.disconnectAll();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(transport.connected).toBe(false);

    // Wait for reconnect
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(transport.connected).toBe(true);

    await transport.close();
  });
});
