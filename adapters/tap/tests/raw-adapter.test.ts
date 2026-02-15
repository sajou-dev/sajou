import { describe, it, expect, vi, beforeEach } from "vitest";
import { RawAdapter } from "../src/adapters/raw/raw-adapter.js";
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

describe("RawAdapter", () => {
  let adapter: RawAdapter;
  let transport: ReturnType<typeof createMockTransport>;

  beforeEach(async () => {
    transport = createMockTransport();
    adapter = new RawAdapter();
    await adapter.start(transport);
  });

  it("detects error patterns", () => {
    adapter.processLine("Error: something went wrong");
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.type).toBe("error");
  });

  it("detects Exception pattern", () => {
    adapter.processLine("RuntimeException: null pointer");
    expect(transport.sent[0]!.type).toBe("error");
  });

  it("detects FAILED pattern", () => {
    adapter.processLine("Test FAILED: assertions");
    expect(transport.sent[0]!.type).toBe("error");
  });

  it("detects tool_call patterns", () => {
    adapter.processLine("Calling tool: Bash");
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.type).toBe("tool_call");
    const payload = transport.sent[0]!.payload as { toolName: string };
    expect(payload.toolName).toBe("Bash");
  });

  it("detects Using: pattern", () => {
    adapter.processLine("Using: grep for search");
    expect(transport.sent[0]!.type).toBe("tool_call");
    const payload = transport.sent[0]!.payload as { toolName: string };
    expect(payload.toolName).toBe("grep");
  });

  it("detects tool_result patterns", () => {
    adapter.processLine("Result: 42 files found");
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.type).toBe("tool_result");
  });

  it("detects Output: pattern", () => {
    adapter.processLine("Output: success");
    expect(transport.sent[0]!.type).toBe("tool_result");
  });

  it("falls back to text_delta for unmatched lines", () => {
    adapter.processLine("Processing step 3 of 10...");
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.type).toBe("text_delta");
    const payload = transport.sent[0]!.payload as { content: string };
    expect(payload.content).toBe("Processing step 3 of 10...");
  });

  it("ignores empty lines", () => {
    adapter.processLine("");
    adapter.processLine("   ");
    expect(transport.sent).toHaveLength(0);
  });

  it("does nothing after stop", async () => {
    await adapter.stop();
    adapter.processLine("Error: should not send");
    expect(transport.sent).toHaveLength(0);
  });
});
