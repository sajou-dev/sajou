import { describe, it, expect, vi, beforeEach } from "vitest";
import { JsonlAdapter } from "../src/adapters/jsonl/jsonl-adapter.js";
import type { TapTransport } from "../src/client/transport.js";
import type { SignalEnvelope } from "@sajou/schema";

function createMockTransport(): TapTransport & {
  sent: SignalEnvelope[];
} {
  const sent: SignalEnvelope[] = [];
  return {
    sent,
    connected: true,
    connect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockImplementation(async (signal: SignalEnvelope) => {
      sent.push(signal);
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe("JsonlAdapter", () => {
  let adapter: JsonlAdapter;
  let transport: ReturnType<typeof createMockTransport>;

  beforeEach(async () => {
    transport = createMockTransport();
    adapter = new JsonlAdapter();
    await adapter.start(transport);
  });

  it("parses valid JSON with known type", () => {
    adapter.processLine(
      JSON.stringify({
        type: "tool_call",
        toolName: "Bash",
        agentId: "claude",
      }),
    );

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.type).toBe("tool_call");
    expect(transport.sent[0]!.payload).toMatchObject({
      toolName: "Bash",
      agentId: "claude",
    });
  });

  it("wraps JSON with unknown type as text_delta", () => {
    adapter.processLine(
      JSON.stringify({
        type: "custom_event",
        data: "hello",
      }),
    );

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.type).toBe("text_delta");
    expect(transport.sent[0]!.metadata).toMatchObject({
      originalType: "custom_event",
    });
  });

  it("wraps JSON without type as text_delta", () => {
    adapter.processLine(JSON.stringify({ message: "hello" }));

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.type).toBe("text_delta");
  });

  it("silently ignores non-JSON lines", () => {
    adapter.processLine("This is just plain text");
    adapter.processLine("--- separator ---");
    adapter.processLine("");

    expect(transport.sent).toHaveLength(0);
  });

  it("ignores malformed JSON", () => {
    adapter.processLine("{invalid json");
    expect(transport.sent).toHaveLength(0);
  });

  it("uses custom source when provided", async () => {
    const custom = new JsonlAdapter({ source: "my-agent" });
    await custom.start(transport);

    custom.processLine(
      JSON.stringify({ type: "tool_call", toolName: "X", agentId: "a" }),
    );

    expect(transport.sent[0]!.source).toBe("my-agent");
  });

  it("sets correlationId when provided", async () => {
    const custom = new JsonlAdapter({ correlationId: "sess-1" });
    await custom.start(transport);

    custom.processLine(
      JSON.stringify({ type: "error", message: "boom", severity: "error" }),
    );

    expect(transport.sent[0]!.correlationId).toBe("sess-1");
  });

  it("does nothing after stop", async () => {
    await adapter.stop();
    adapter.processLine(
      JSON.stringify({ type: "tool_call", toolName: "X", agentId: "a" }),
    );
    expect(transport.sent).toHaveLength(0);
  });
});
