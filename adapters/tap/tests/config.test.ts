import { describe, it, expect } from "vitest";
import { parseConfig } from "../src/config/config.js";

describe("parseConfig", () => {
  it("parses claude mode", () => {
    const config = parseConfig(["node", "cli.js", "claude"]);
    expect(config.mode).toBe("claude");
    expect(config.command).toBeUndefined();
  });

  it("parses process wrap with -- separator", () => {
    const config = parseConfig([
      "node",
      "cli.js",
      "--",
      "node",
      "my-agent.js",
    ]);
    expect(config.mode).toBe("jsonl");
    expect(config.command).toEqual(["node", "my-agent.js"]);
  });

  it("parses --raw flag", () => {
    const config = parseConfig([
      "node",
      "cli.js",
      "--raw",
      "--",
      "python",
      "crew.py",
    ]);
    expect(config.mode).toBe("raw");
    expect(config.command).toEqual(["python", "crew.py"]);
  });

  it("parses --endpoint option", () => {
    const config = parseConfig([
      "node",
      "cli.js",
      "--endpoint",
      "ws://remote:9100",
      "--",
      "node",
      "app.js",
    ]);
    expect(config.endpoint).toBe("ws://remote:9100");
  });

  it("parses --source and --correlation-id", () => {
    const config = parseConfig([
      "node",
      "cli.js",
      "--source",
      "my-agent",
      "--correlation-id",
      "sess-1",
      "claude",
    ]);
    expect(config.source).toBe("my-agent");
    expect(config.correlationId).toBe("sess-1");
  });

  it("uses default HTTP endpoint when none specified", () => {
    const config = parseConfig(["node", "cli.js", "claude"]);
    expect(config.endpoint).toBe("http://localhost:5175/api/signal");
  });

  it("returns undefined command when none given", () => {
    const config = parseConfig(["node", "cli.js"]);
    expect(config.command).toBeUndefined();
  });
});
