import { describe, it, expect } from "vitest";
import { simpleTask, errorRecovery, multiAgent, SCENARIOS } from "../src/scenarios/index.js";
import type { Scenario } from "../src/scenarios/types.js";

/** Validates that a scenario's steps have consistent structure. */
function validateScenario(scenario: Scenario): void {
  expect(scenario.name).toBeTruthy();
  expect(scenario.description).toBeTruthy();
  expect(scenario.steps.length).toBeGreaterThan(0);

  // First step should have delayMs 0 (starts immediately)
  expect(scenario.steps[0]!.delayMs).toBe(0);

  // All delays should be non-negative
  for (const step of scenario.steps) {
    expect(step.delayMs).toBeGreaterThanOrEqual(0);
  }

  // Should start with task_dispatch
  expect(scenario.steps[0]!.type).toBe("task_dispatch");

  // Should end with completion
  expect(scenario.steps[scenario.steps.length - 1]!.type).toBe("completion");
}

describe("simpleTask scenario", () => {
  it("has valid structure", () => {
    validateScenario(simpleTask);
  });

  it("has 14 steps", () => {
    expect(simpleTask.steps).toHaveLength(14);
  });

  it("uses exactly one agent", () => {
    const agentIds = new Set<string>();
    for (const step of simpleTask.steps) {
      const payload = step.payload as Record<string, unknown>;
      if (typeof payload["agentId"] === "string") {
        agentIds.add(payload["agentId"]);
      }
      if (step.type === "task_dispatch" && typeof payload["to"] === "string") {
        agentIds.add(payload["to"]);
      }
    }
    expect(agentIds.size).toBe(1);
  });

  it("calls exactly 2 tools", () => {
    const toolCalls = simpleTask.steps.filter((s) => s.type === "tool_call");
    expect(toolCalls).toHaveLength(2);
  });
});

describe("errorRecovery scenario", () => {
  it("has valid structure", () => {
    validateScenario(errorRecovery);
  });

  it("contains an error signal", () => {
    const errors = errorRecovery.steps.filter((s) => s.type === "error");
    expect(errors).toHaveLength(1);
  });

  it("has a failed tool_result followed by a retry", () => {
    const toolResults = errorRecovery.steps.filter((s) => s.type === "tool_result");
    expect(toolResults).toHaveLength(2);

    const first = toolResults[0]!.payload as { success: boolean };
    const second = toolResults[1]!.payload as { success: boolean };
    expect(first.success).toBe(false);
    expect(second.success).toBe(true);
  });
});

describe("multiAgent scenario", () => {
  it("has valid structure", () => {
    validateScenario(multiAgent);
  });

  it("dispatches to 2 different agents", () => {
    const dispatches = multiAgent.steps.filter((s) => s.type === "task_dispatch");
    const targets = new Set(dispatches.map((s) => (s.payload as { to: string }).to));
    expect(targets.size).toBe(2);
  });

  it("has 2 completion signals", () => {
    const completions = multiAgent.steps.filter((s) => s.type === "completion");
    expect(completions).toHaveLength(2);
  });
});

describe("SCENARIOS registry", () => {
  it("contains all 3 scenarios", () => {
    expect(SCENARIOS.size).toBe(3);
    expect(SCENARIOS.has("simple-task")).toBe(true);
    expect(SCENARIOS.has("error-recovery")).toBe(true);
    expect(SCENARIOS.has("multi-agent")).toBe(true);
  });
});
