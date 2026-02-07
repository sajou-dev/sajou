import { describe, it, expect } from "vitest";
import {
  isSignalRef,
  resolveSignalRef,
  resolveParams,
  resolveEntityRef,
} from "../src/choreographer/resolver.js";
import type { PerformanceSignal } from "../src/choreographer/types.js";

const signal: PerformanceSignal = {
  type: "task_dispatch",
  payload: {
    taskId: "t-42",
    from: "orchestrator",
    to: "agent-solver",
    description: "Solve the equation",
  },
};

describe("isSignalRef", () => {
  it("returns true for signal.* strings", () => {
    expect(isSignalRef("signal.from")).toBe(true);
    expect(isSignalRef("signal.to")).toBe(true);
    expect(isSignalRef("signal.agentId")).toBe(true);
  });

  it("returns false for non-signal strings", () => {
    expect(isSignalRef("agent")).toBe(false);
    expect(isSignalRef("forge")).toBe(false);
    expect(isSignalRef("")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isSignalRef(42)).toBe(false);
    expect(isSignalRef(null)).toBe(false);
    expect(isSignalRef(undefined)).toBe(false);
    expect(isSignalRef({})).toBe(false);
  });
});

describe("resolveSignalRef", () => {
  it("resolves payload fields", () => {
    expect(resolveSignalRef("signal.from", signal)).toBe("orchestrator");
    expect(resolveSignalRef("signal.to", signal)).toBe("agent-solver");
    expect(resolveSignalRef("signal.taskId", signal)).toBe("t-42");
  });

  it("resolves signal.type to the envelope type", () => {
    expect(resolveSignalRef("signal.type", signal)).toBe("task_dispatch");
  });

  it("returns undefined for missing paths", () => {
    expect(resolveSignalRef("signal.nonexistent", signal)).toBeUndefined();
  });
});

describe("resolveParams", () => {
  it("resolves signal refs and passes through literals", () => {
    const params = {
      to: "signal.to",
      color: "gold",
      count: 3,
    };

    const resolved = resolveParams(params, signal);
    expect(resolved).toEqual({
      to: "agent-solver",
      color: "gold",
      count: 3,
    });
  });
});

describe("resolveEntityRef", () => {
  it("resolves signal refs", () => {
    expect(resolveEntityRef("signal.to", signal)).toBe("agent-solver");
  });

  it("passes through literal entity names", () => {
    expect(resolveEntityRef("pigeon", signal)).toBe("pigeon");
    expect(resolveEntityRef("agent", signal)).toBe("agent");
  });

  it("returns empty string for undefined", () => {
    expect(resolveEntityRef(undefined, signal)).toBe("");
  });
});
