import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpTransport } from "../src/client/http-client.js";
import { createTapSignal } from "../src/signal/signal-factory.js";

describe("HttpTransport", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("is not connected before connect()", () => {
    const transport = new HttpTransport();
    expect(transport.connected).toBe(false);
  });

  it("marks connected after connect()", async () => {
    const transport = new HttpTransport();
    await transport.connect();
    expect(transport.connected).toBe(true);
  });

  it("marks disconnected after close()", async () => {
    const transport = new HttpTransport();
    await transport.connect();
    await transport.close();
    expect(transport.connected).toBe(false);
  });

  it("sends signal as JSON POST to default endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(""),
    });
    globalThis.fetch = mockFetch;

    const transport = new HttpTransport();
    await transport.connect();

    const signal = createTapSignal("tool_call", {
      toolName: "Bash",
      agentId: "claude",
      callId: "c-1",
    });

    await transport.send(signal);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:5175/api/signal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signal),
      },
    );
  });

  it("sends to custom endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(""),
    });
    globalThis.fetch = mockFetch;

    const transport = new HttpTransport({
      endpoint: "http://remote:8080/api/signal",
    });
    await transport.connect();

    const signal = createTapSignal("error", {
      message: "test",
      severity: "warning",
    });

    await transport.send(signal);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://remote:8080/api/signal",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on HTTP error response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });
    globalThis.fetch = mockFetch;

    const transport = new HttpTransport();
    await transport.connect();

    const signal = createTapSignal("tool_call", {
      toolName: "Bash",
      agentId: "claude",
    });

    await expect(transport.send(signal)).rejects.toThrow(
      "HTTP 500: Internal Server Error",
    );
  });
});
