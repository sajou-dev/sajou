import { describe, it, expect, beforeEach } from "vitest";
import {
  Choreographer,
  TestClock,
  RecordingSink,
  resetPerformanceIdCounter,
} from "../src/choreographer/index.js";
import type {
  ChoreographyDefinition,
  PerformanceSignal,
} from "../src/choreographer/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignal(
  type: string,
  payload: Record<string, unknown>,
): PerformanceSignal {
  return { type, payload };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Choreographer", () => {
  let clock: TestClock;
  let sink: RecordingSink;
  let choreographer: Choreographer;

  beforeEach(() => {
    clock = new TestClock();
    sink = new RecordingSink();
    choreographer = new Choreographer({ clock, sink });
    resetPerformanceIdCounter();
  });

  // =========================================================================
  // Basic animated action
  // =========================================================================

  describe("single animated action", () => {
    const definition: ChoreographyDefinition = {
      on: "task_dispatch",
      steps: [
        { action: "move", entity: "agent", to: "signal.to", duration: 1000, easing: "linear" },
      ],
    };

    it("emits start on first frame", () => {
      choreographer.register(definition);
      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "orch", to: "solver" }),
      );

      clock.advance(16);

      expect(sink.starts).toHaveLength(1);
      expect(sink.starts[0]?.action).toBe("move");
      expect(sink.starts[0]?.entityRef).toBe("agent");
      expect(sink.starts[0]?.duration).toBe(1000);
      expect(sink.starts[0]?.easing).toBe("linear");
      expect(sink.starts[0]?.params).toEqual({ to: "solver" });
    });

    it("emits updates with progress during animation", () => {
      choreographer.register(definition);
      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "orch", to: "solver" }),
      );

      clock.advance(16); // first frame: action starts (startTime = 16)
      clock.advance(500); // second frame at 516ms: progress ≈ 500/1000

      expect(sink.updates.length).toBeGreaterThan(0);
      const lastUpdate = sink.updates[sink.updates.length - 1];
      expect(lastUpdate?.progress).toBeCloseTo(0.5, 1);
    });

    it("emits complete when duration elapses", () => {
      choreographer.register(definition);
      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "orch", to: "solver" }),
      );

      clock.advance(16); // action starts
      clock.advance(1000); // duration elapses

      expect(sink.completes).toHaveLength(1);
      expect(sink.completes[0]?.action).toBe("move");
    });

    it("stops frame loop after completion", () => {
      choreographer.register(definition);
      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "orch", to: "solver" }),
      );

      clock.advance(16); // action starts
      clock.advance(1000); // completes

      expect(choreographer.activePerformanceCount).toBe(0);
      expect(clock.pendingCount).toBe(0);
    });
  });

  // =========================================================================
  // Instant actions
  // =========================================================================

  describe("instant actions", () => {
    it("emits execute for spawn", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [
          { action: "spawn", entity: "pigeon", at: "signal.from" },
        ],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "base", to: "forge" }),
      );

      clock.advance(16);

      expect(sink.executes).toHaveLength(1);
      expect(sink.executes[0]?.action).toBe("spawn");
      expect(sink.executes[0]?.entityRef).toBe("pigeon");
      expect(sink.executes[0]?.params).toEqual({ at: "base" });
    });

    it("emits execute for destroy", () => {
      choreographer.register({
        on: "completion",
        steps: [
          { action: "destroy", entity: "pigeon" },
        ],
      });

      choreographer.handleSignal(
        makeSignal("completion", { taskId: "t-1", success: true }),
      );

      clock.advance(16);

      expect(sink.executes).toHaveLength(1);
      expect(sink.executes[0]?.action).toBe("destroy");
      expect(sink.executes[0]?.entityRef).toBe("pigeon");
    });
  });

  // =========================================================================
  // Sequential steps
  // =========================================================================

  describe("sequential steps", () => {
    it("executes steps in order", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [
          { action: "spawn", entity: "pigeon", at: "signal.from" },
          { action: "fly", entity: "pigeon", to: "signal.to", duration: 1000, easing: "arc" },
          { action: "destroy", entity: "pigeon" },
        ],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "base", to: "forge" }),
      );

      // First tick: spawn (instant) executes, then fly starts
      clock.advance(16);
      expect(sink.executes).toHaveLength(1);
      expect(sink.executes[0]?.action).toBe("spawn");
      expect(sink.starts).toHaveLength(1);
      expect(sink.starts[0]?.action).toBe("fly");

      // Mid-animation
      clock.advance(500);
      expect(sink.updates.length).toBeGreaterThan(0);
      expect(sink.completes).toHaveLength(0);

      // Complete fly
      clock.advance(500);
      expect(sink.completes).toHaveLength(1);
      expect(sink.completes[0]?.action).toBe("fly");
      // destroy fires on same tick as fly completes
      expect(sink.executes).toHaveLength(2);
      expect(sink.executes[1]?.action).toBe("destroy");
    });
  });

  // =========================================================================
  // Wait action
  // =========================================================================

  describe("wait action", () => {
    it("pauses the sequence without emitting commands", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [
          { action: "spawn", entity: "agent" },
          { action: "wait", duration: 500 },
          { action: "destroy", entity: "agent" },
        ],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "a", to: "b" }),
      );

      clock.advance(16);
      expect(sink.executes).toHaveLength(1);
      expect(sink.executes[0]?.action).toBe("spawn");

      // During wait — no new commands
      clock.advance(200);
      expect(sink.executes).toHaveLength(1);

      // After wait
      clock.advance(300);
      expect(sink.executes).toHaveLength(2);
      expect(sink.executes[1]?.action).toBe("destroy");
    });
  });

  // =========================================================================
  // Parallel steps
  // =========================================================================

  describe("parallel steps", () => {
    it("runs grouped steps concurrently", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [
          {
            action: "parallel",
            steps: [
              { action: "move", entity: "agent", to: "signal.to", duration: 800 },
              { action: "flash", target: "signal.to", color: "gold", duration: 400 },
            ],
          },
        ],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "a", to: "forge" }),
      );

      clock.advance(16);

      // Both start on first frame
      expect(sink.starts).toHaveLength(2);
      const actions = sink.starts.map((s) => s.action).sort();
      expect(actions).toEqual(["flash", "move"]);

      // Flash completes at 400ms
      clock.advance(400);
      expect(sink.completes).toHaveLength(1);
      expect(sink.completes[0]?.action).toBe("flash");

      // Move still running, completes at 800ms
      clock.advance(400);
      expect(sink.completes).toHaveLength(2);
    });

    it("advances to next step after all parallel children complete", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [
          {
            action: "parallel",
            steps: [
              { action: "move", entity: "agent", to: "signal.to", duration: 500 },
              { action: "flash", target: "signal.to", color: "gold", duration: 300 },
            ],
          },
          { action: "spawn", entity: "flag" },
        ],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "a", to: "b" }),
      );

      clock.advance(16);
      clock.advance(300); // flash done
      expect(sink.executes).toHaveLength(0); // spawn not yet

      clock.advance(200); // move done → parallel done → spawn fires
      expect(sink.executes).toHaveLength(1);
      expect(sink.executes[0]?.action).toBe("spawn");
    });
  });

  // =========================================================================
  // onArrive continuation
  // =========================================================================

  describe("onArrive", () => {
    it("flattens continuation steps after the preceding action completes", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [
          { action: "fly", entity: "pigeon", to: "signal.to", duration: 1000, easing: "arc" },
          {
            action: "onArrive",
            steps: [
              { action: "destroy", entity: "pigeon" },
              { action: "flash", target: "signal.to", color: "gold", duration: 300 },
            ],
          },
        ],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "base", to: "forge" }),
      );

      clock.advance(16);
      expect(sink.starts).toHaveLength(1);
      expect(sink.starts[0]?.action).toBe("fly");

      // Complete fly
      clock.advance(1000);
      expect(sink.completes).toHaveLength(1);
      expect(sink.completes[0]?.action).toBe("fly");

      // onArrive steps execute: destroy (instant) then flash (animated, starts)
      expect(sink.executes).toHaveLength(1);
      expect(sink.executes[0]?.action).toBe("destroy");
      expect(sink.starts).toHaveLength(2);
      expect(sink.starts[1]?.action).toBe("flash");

      // Complete flash
      clock.advance(300);
      expect(sink.completes).toHaveLength(2);
      expect(sink.completes[1]?.action).toBe("flash");
    });
  });

  // =========================================================================
  // Signal reference resolution
  // =========================================================================

  describe("signal reference resolution", () => {
    it("resolves signal.* references in entity and params", () => {
      choreographer.register({
        on: "tool_call",
        steps: [
          { action: "flash", target: "signal.agentId", color: "blue", duration: 200 },
        ],
      });

      choreographer.handleSignal(
        makeSignal("tool_call", { toolName: "search", agentId: "agent-42" }),
      );

      clock.advance(16);

      expect(sink.starts).toHaveLength(1);
      expect(sink.starts[0]?.entityRef).toBe("agent-42");
    });

    it("resolves nested signal references in params", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [
          { action: "move", entity: "signal.to", to: "signal.from", duration: 500 },
        ],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "base", to: "forge" }),
      );

      clock.advance(16);

      expect(sink.starts).toHaveLength(1);
      expect(sink.starts[0]?.entityRef).toBe("forge");
      expect(sink.starts[0]?.params).toEqual({ to: "base" });
    });
  });

  // =========================================================================
  // Easing
  // =========================================================================

  describe("easing", () => {
    it("applies easeInOut easing", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [
          { action: "move", entity: "agent", to: "forge", duration: 1000, easing: "easeInOut" },
        ],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "a", to: "b" }),
      );

      clock.advance(16); // start
      clock.advance(484); // now at 500ms = 50% raw progress

      const lastUpdate = sink.updates[sink.updates.length - 1];
      // easeInOut at 0.5 should be exactly 0.5 (S-curve midpoint)
      expect(lastUpdate?.progress).toBeCloseTo(0.5, 1);
    });

    it("defaults to linear easing when not specified", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [
          { action: "move", entity: "agent", to: "forge", duration: 1000 },
        ],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "a", to: "b" }),
      );

      clock.advance(16); // start
      clock.advance(484); // 500ms total

      const lastUpdate = sink.updates[sink.updates.length - 1];
      // Linear: progress should equal raw progress
      expect(lastUpdate?.progress).toBeCloseTo(0.5, 1);
    });
  });

  // =========================================================================
  // Concurrent performances
  // =========================================================================

  describe("concurrent performances", () => {
    it("runs multiple performances independently", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [
          { action: "move", entity: "signal.to", to: "forge", duration: 1000 },
        ],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "a", to: "agent-1" }),
      );
      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-2", from: "a", to: "agent-2" }),
      );

      clock.advance(16);

      // Both performances started
      expect(sink.starts).toHaveLength(2);
      expect(sink.starts[0]?.entityRef).toBe("agent-1");
      expect(sink.starts[1]?.entityRef).toBe("agent-2");

      // Both complete
      clock.advance(1000);
      expect(sink.completes).toHaveLength(2);
    });

    it("multiple choreographies can trigger on the same signal type", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [{ action: "move", entity: "agent", to: "forge", duration: 500 }],
      });
      choreographer.register({
        on: "task_dispatch",
        steps: [{ action: "flash", target: "forge", color: "gold", duration: 300 }],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "a", to: "b" }),
      );

      clock.advance(16);

      expect(sink.starts).toHaveLength(2);
      const actions = sink.starts.map((s) => s.action).sort();
      expect(actions).toEqual(["flash", "move"]);
    });
  });

  // =========================================================================
  // Interruptions
  // =========================================================================

  describe("interruptions", () => {
    it("interrupts active performances by correlationId", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [
          { action: "move", entity: "agent", to: "forge", duration: 2000 },
        ],
      });
      choreographer.register({
        on: "error",
        interrupts: true,
        steps: [
          { action: "flash", target: "signal.agentId", color: "red", duration: 300 },
        ],
      });

      // Start a task choreography with correlationId
      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "a", to: "b" }),
        "workflow-1",
      );

      clock.advance(16); // move starts
      expect(sink.starts).toHaveLength(1);
      expect(sink.starts[0]?.action).toBe("move");

      clock.advance(500); // mid-animation

      // Error arrives with same correlationId
      choreographer.handleSignal(
        makeSignal("error", { message: "boom", severity: "error", agentId: "agent-1" }),
        "workflow-1",
      );

      clock.advance(16);

      // Interrupt command emitted
      expect(sink.interrupts).toHaveLength(1);
      expect(sink.interrupts[0]?.correlationId).toBe("workflow-1");
      expect(sink.interrupts[0]?.interruptedBy).toBe("error");

      // Error choreography's flash starts
      const flashStart = sink.starts.find((s) => s.action === "flash");
      expect(flashStart).toBeDefined();
      expect(flashStart?.entityRef).toBe("agent-1");
    });

    it("does not interrupt performances with different correlationId", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [{ action: "move", entity: "agent", to: "forge", duration: 2000 }],
      });
      choreographer.register({
        on: "error",
        interrupts: true,
        steps: [{ action: "flash", target: "agent", color: "red", duration: 300 }],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "a", to: "b" }),
        "workflow-1",
      );

      clock.advance(16);

      // Error on a different correlationId
      choreographer.handleSignal(
        makeSignal("error", { message: "boom", severity: "error" }),
        "workflow-2",
      );

      clock.advance(16);

      // No interruption
      expect(sink.interrupts).toHaveLength(0);
    });

    it("runs onInterrupt handler steps when interrupted", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [
          { action: "fly", entity: "pigeon", to: "signal.to", duration: 2000, easing: "arc" },
          {
            action: "onInterrupt",
            steps: [
              { action: "destroy", entity: "pigeon" },
              { action: "flash", target: "signal.from", color: "red", duration: 200 },
            ],
          },
        ],
      });
      choreographer.register({
        on: "error",
        interrupts: true,
        steps: [],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "base", to: "forge" }),
        "wf-1",
      );

      clock.advance(16); // fly starts
      clock.advance(500); // mid-flight

      // Interrupt
      choreographer.handleSignal(
        makeSignal("error", { message: "fail", severity: "critical" }),
        "wf-1",
      );

      clock.advance(16);

      // onInterrupt handler steps execute
      expect(sink.executes.some((e) => e.action === "destroy" && e.entityRef === "pigeon")).toBe(true);
      expect(sink.starts.some((s) => s.action === "flash")).toBe(true);
    });
  });

  // =========================================================================
  // Manifesto example — full task_dispatch choreography
  // =========================================================================

  describe("manifesto example: task_dispatch → peon walks, pigeon flies", () => {
    it("executes the full sequence from the manifesto", () => {
      const citadelChoreography: ChoreographyDefinition = {
        on: "task_dispatch",
        steps: [
          { action: "move", entity: "agent", to: "signal.to", duration: 800, easing: "easeInOut" },
          { action: "spawn", entity: "pigeon", at: "signal.from" },
          { action: "fly", entity: "pigeon", to: "signal.to", duration: 1200, easing: "arc" },
          {
            action: "onArrive",
            steps: [
              { action: "destroy", entity: "pigeon" },
              { action: "flash", target: "signal.to", color: "gold", duration: 300 },
            ],
          },
        ],
      };

      choreographer.register(citadelChoreography);
      choreographer.handleSignal(
        makeSignal("task_dispatch", {
          taskId: "t-42",
          from: "orchestrator",
          to: "agent-solver",
        }),
      );

      // Frame 1: move starts
      clock.advance(16);
      expect(sink.starts[0]?.action).toBe("move");
      expect(sink.starts[0]?.entityRef).toBe("agent");
      expect(sink.starts[0]?.params).toEqual({ to: "agent-solver" });

      // Move completes at 800ms
      clock.advance(800);
      expect(sink.completes[0]?.action).toBe("move");

      // Spawn (instant) fires on same tick, then fly starts
      expect(sink.executes[0]?.action).toBe("spawn");
      expect(sink.executes[0]?.entityRef).toBe("pigeon");
      expect(sink.executes[0]?.params).toEqual({ at: "orchestrator" });

      expect(sink.starts[1]?.action).toBe("fly");
      expect(sink.starts[1]?.entityRef).toBe("pigeon");
      expect(sink.starts[1]?.easing).toBe("arc");

      // Fly completes at 800 + 1200 = 2000ms
      clock.advance(1200);
      expect(sink.completes[1]?.action).toBe("fly");

      // onArrive: destroy pigeon, flash
      expect(sink.executes[1]?.action).toBe("destroy");
      expect(sink.executes[1]?.entityRef).toBe("pigeon");
      expect(sink.starts[2]?.action).toBe("flash");
      expect(sink.starts[2]?.entityRef).toBe("agent-solver");

      // Flash completes at 2000 + 300 = 2300ms
      clock.advance(300);
      expect(sink.completes[2]?.action).toBe("flash");

      // Everything done
      expect(choreographer.activePerformanceCount).toBe(0);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe("edge cases", () => {
    it("handles empty choreography steps", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "a", to: "b" }),
      );

      clock.advance(16);
      expect(sink.all).toHaveLength(0);
      expect(choreographer.activePerformanceCount).toBe(0);
    });

    it("handles zero duration animated actions", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [
          { action: "flash", target: "agent", color: "gold", duration: 0 },
        ],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "a", to: "b" }),
      );

      clock.advance(16);

      // Should start and immediately complete
      expect(sink.starts).toHaveLength(1);
      expect(sink.completes).toHaveLength(1);
    });

    it("handles signal with no matching choreographies", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [{ action: "spawn", entity: "agent" }],
      });

      // Send a signal that doesn't match
      choreographer.handleSignal(
        makeSignal("error", { message: "oops", severity: "warning" }),
      );

      clock.advance(16);
      expect(sink.all).toHaveLength(0);
    });

    it("dispose stops all performances", () => {
      choreographer.register({
        on: "task_dispatch",
        steps: [{ action: "move", entity: "agent", to: "forge", duration: 5000 }],
      });

      choreographer.handleSignal(
        makeSignal("task_dispatch", { taskId: "t-1", from: "a", to: "b" }),
      );

      clock.advance(16);
      expect(sink.starts).toHaveLength(1);

      choreographer.dispose();
      expect(choreographer.activePerformanceCount).toBe(0);

      // No more updates after dispose
      const updateCount = sink.updates.length;
      clock.advance(1000);
      expect(sink.updates.length).toBe(updateCount);
    });
  });
});
