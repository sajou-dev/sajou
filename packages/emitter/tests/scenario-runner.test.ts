import { describe, it, expect, beforeEach } from "vitest";
import type { SignalEvent } from "@sajou/schema";
import type { Scenario } from "../src/scenarios/types.js";
import { runScenario } from "../src/scenario-runner.js";
import { resetCounter } from "../src/signal-factory.js";

const miniScenario: Scenario = {
  name: "mini",
  description: "Minimal test scenario",
  steps: [
    {
      delayMs: 0,
      type: "task_dispatch",
      correlationId: "test-001",
      payload: { taskId: "t-1", from: "o", to: "a" },
    },
    {
      delayMs: 50,
      type: "agent_state_change",
      correlationId: "test-001",
      payload: { agentId: "a", from: "idle", to: "thinking" },
    },
    {
      delayMs: 50,
      type: "completion",
      correlationId: "test-001",
      payload: { taskId: "t-1", success: true },
    },
  ],
};

describe("runScenario", () => {
  beforeEach(() => {
    resetCounter();
  });

  it("emits all signals in order", async () => {
    const received: SignalEvent[] = [];
    const handle = runScenario(miniScenario, (s) => received.push(s));

    await handle.done;

    expect(received).toHaveLength(3);
    expect(received[0]!.type).toBe("task_dispatch");
    expect(received[1]!.type).toBe("agent_state_change");
    expect(received[2]!.type).toBe("completion");
  });

  it("respects delay ordering (timestamps increase)", async () => {
    const received: SignalEvent[] = [];
    const handle = runScenario(miniScenario, (s) => received.push(s));

    await handle.done;

    for (let i = 1; i < received.length; i++) {
      expect(received[i]!.timestamp).toBeGreaterThanOrEqual(received[i - 1]!.timestamp);
    }
  });

  it("preserves correlationId from scenario steps", async () => {
    const received: SignalEvent[] = [];
    const handle = runScenario(miniScenario, (s) => received.push(s));

    await handle.done;

    for (const signal of received) {
      expect(signal.correlationId).toBe("test-001");
    }
  });

  it("can be stopped mid-playback", async () => {
    const slowScenario: Scenario = {
      name: "slow",
      description: "Slow scenario for stop testing",
      steps: [
        { delayMs: 0, type: "task_dispatch", payload: { taskId: "t-1", from: "o", to: "a" } },
        { delayMs: 5000, type: "completion", payload: { taskId: "t-1", success: true } },
      ],
    };

    const received: SignalEvent[] = [];
    const handle = runScenario(slowScenario, (s) => received.push(s));

    // Wait a bit, then stop before second signal
    await new Promise((r) => setTimeout(r, 50));
    handle.stop();
    await handle.done;

    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe("task_dispatch");
  });

  it("loops when loop option is true", async () => {
    const received: SignalEvent[] = [];
    const handle = runScenario(
      miniScenario,
      (s) => received.push(s),
      { loop: true, loopGapMs: 50, speed: 50 },
    );

    // Let it loop at least once
    await new Promise((r) => setTimeout(r, 200));
    handle.stop();
    await handle.done;

    // Should have more than one iteration (3 signals each)
    expect(received.length).toBeGreaterThan(3);
  });

  it("respects speed multiplier", async () => {
    const start = Date.now();
    const received: SignalEvent[] = [];
    const handle = runScenario(miniScenario, (s) => received.push(s), { speed: 10 });

    await handle.done;
    const elapsed = Date.now() - start;

    // At 10x speed, 100ms of delays should take ~10ms
    expect(elapsed).toBeLessThan(100);
    expect(received).toHaveLength(3);
  });
});
