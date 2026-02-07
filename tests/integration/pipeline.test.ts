/**
 * Integration test: Signal → Choreographer → Commands
 *
 * Proves the full Sajou pipeline works end-to-end:
 * 1. Signals created by @sajou/emitter (signal factory)
 * 2. Choreographies from @sajou/theme-citadel (Citadel theme)
 * 3. Choreographer runtime from @sajou/core interprets choreographies
 * 4. RecordingSink captures commands for assertion
 *
 * No rendering involved — this is pure data flow verification.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  Choreographer,
  TestClock,
  RecordingSink,
  resetPerformanceIdCounter,
} from "@sajou/core";
import type { PerformanceSignal } from "@sajou/core";
import { createSignal, resetCounter } from "@sajou/emitter";
import type { SignalEnvelope, SignalType } from "@sajou/schema";
import {
  citadelChoreographies,
  taskDispatchChoreography,
  errorChoreography,
  citadelManifest,
} from "@sajou/theme-citadel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Bridge a typed SignalEnvelope from the emitter to the PerformanceSignal
 * expected by the choreographer. Extracts type + payload; passes correlationId
 * separately as the choreographer API expects.
 */
function toPerformanceSignal(
  signal: SignalEnvelope<SignalType>,
): PerformanceSignal {
  return {
    type: signal.type,
    payload: signal.payload as Readonly<Record<string, unknown>>,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Integration: Signal → Choreographer → Commands", () => {
  let clock: TestClock;
  let sink: RecordingSink;
  let choreographer: Choreographer;

  beforeEach(() => {
    clock = new TestClock();
    sink = new RecordingSink();
    choreographer = new Choreographer({ clock, sink });
    resetPerformanceIdCounter();
    resetCounter();

    // Register all Citadel choreographies
    choreographer.registerAll(citadelChoreographies);
  });

  // =========================================================================
  // Sanity: Citadel provides valid choreographies
  // =========================================================================

  describe("Citadel theme provides choreographies", () => {
    it("exports choreographies for task_dispatch and error", () => {
      expect(citadelChoreographies.length).toBeGreaterThanOrEqual(2);

      const signalTypes = citadelChoreographies.map((c) => c.on);
      expect(signalTypes).toContain("task_dispatch");
      expect(signalTypes).toContain("error");
    });

    it("task_dispatch choreography uses Citadel entities", () => {
      const steps = taskDispatchChoreography.steps;
      const entityRefs = steps
        .filter((s) => "entity" in s)
        .map((s) => (s as { entity: string }).entity);

      expect(entityRefs).toContain("peon");
      expect(entityRefs).toContain("pigeon");
    });

    it("error choreography uses interrupts", () => {
      expect(errorChoreography.interrupts).toBe(true);
    });

    it("Citadel manifest declares entities used by choreographies", () => {
      const entityIds = Object.keys(citadelManifest.entities);
      expect(entityIds).toContain("peon");
      expect(entityIds).toContain("pigeon");
      expect(entityIds).toContain("explosion");
    });
  });

  // =========================================================================
  // task_dispatch: move → spawn → fly → onArrive(destroy → flash)
  // =========================================================================

  describe("task_dispatch signal → full Citadel choreography", () => {
    it("produces commands in the correct order: move → spawn → fly → destroy → flash", () => {
      const signal = createSignal("task_dispatch", {
        taskId: "task-integration-001",
        from: "orchestrator",
        to: "agent-solver",
        description: "Integration test task",
      }, { correlationId: "workflow-int-1" });

      choreographer.handleSignal(
        toPerformanceSignal(signal),
        signal.correlationId,
      );

      // Frame 1: move starts (peon walks to signal.to)
      clock.advance(16);
      expect(sink.starts).toHaveLength(1);
      expect(sink.starts[0]?.action).toBe("move");
      expect(sink.starts[0]?.entityRef).toBe("peon");
      expect(sink.starts[0]?.params).toEqual({ to: "agent-solver" });
      expect(sink.starts[0]?.easing).toBe("easeInOut");
      expect(sink.starts[0]?.duration).toBe(800);

      // Move completes at 800ms → spawn (instant) + fly starts
      clock.advance(800);

      expect(sink.completes).toHaveLength(1);
      expect(sink.completes[0]?.action).toBe("move");

      // Spawn pigeon at orchestrator
      expect(sink.executes).toHaveLength(1);
      expect(sink.executes[0]?.action).toBe("spawn");
      expect(sink.executes[0]?.entityRef).toBe("pigeon");
      expect(sink.executes[0]?.params).toEqual({ at: "orchestrator" });

      // Fly starts (pigeon flies to agent-solver with arc easing)
      expect(sink.starts).toHaveLength(2);
      expect(sink.starts[1]?.action).toBe("fly");
      expect(sink.starts[1]?.entityRef).toBe("pigeon");
      expect(sink.starts[1]?.params).toEqual({ to: "agent-solver" });
      expect(sink.starts[1]?.easing).toBe("arc");
      expect(sink.starts[1]?.duration).toBe(1200);

      // Fly progresses — verify updates are emitted with arc easing
      clock.advance(600);
      const flyUpdates = sink.updates.filter(
        (u) => u.action === "fly",
      );
      expect(flyUpdates.length).toBeGreaterThan(0);
      const midProgress = flyUpdates[flyUpdates.length - 1]?.progress;
      // Arc easing at 50% → 4*0.5*(1-0.5) = 1.0 (peak of parabola)
      expect(midProgress).toBeCloseTo(1.0, 1);

      // Fly completes at 800 + 1200 = 2000ms
      clock.advance(600);
      expect(sink.completes).toHaveLength(2);
      expect(sink.completes[1]?.action).toBe("fly");

      // onArrive: destroy pigeon (instant) + flash starts
      expect(sink.executes).toHaveLength(2);
      expect(sink.executes[1]?.action).toBe("destroy");
      expect(sink.executes[1]?.entityRef).toBe("pigeon");

      expect(sink.starts).toHaveLength(3);
      expect(sink.starts[2]?.action).toBe("flash");
      expect(sink.starts[2]?.entityRef).toBe("agent-solver");
      expect(sink.starts[2]?.params).toEqual({
        color: "#ffd700",
      });
      expect(sink.starts[2]?.duration).toBe(300);

      // Flash completes
      clock.advance(300);
      expect(sink.completes).toHaveLength(3);
      expect(sink.completes[2]?.action).toBe("flash");

      // Performance is done
      expect(choreographer.activePerformanceCount).toBe(0);
    });

    it("resolves signal.* references from the emitter signal payload", () => {
      const signal = createSignal("task_dispatch", {
        taskId: "task-resolve-test",
        from: "oracle",
        to: "forge",
      });

      choreographer.handleSignal(toPerformanceSignal(signal));

      clock.advance(16);

      // move resolves signal.to → "forge"
      expect(sink.starts[0]?.params).toEqual({ to: "forge" });

      clock.advance(800);

      // spawn resolves signal.from → "oracle"
      expect(sink.executes[0]?.params).toEqual({ at: "oracle" });
      // fly resolves signal.to → "forge"
      expect(sink.starts[1]?.params).toEqual({ to: "forge" });
    });

    it("total command sequence is: 3 starts, 3 completes, 2 executes", () => {
      const signal = createSignal("task_dispatch", {
        taskId: "t-count",
        from: "a",
        to: "b",
      });

      choreographer.handleSignal(toPerformanceSignal(signal));

      // Run through the entire choreography
      clock.advance(16);   // move starts
      clock.advance(800);  // move done, spawn, fly starts
      clock.advance(1200); // fly done, destroy, flash starts
      clock.advance(300);  // flash done

      // 3 animated actions: move, fly, flash
      expect(sink.starts).toHaveLength(3);
      expect(sink.completes).toHaveLength(3);

      // 2 instant actions: spawn, destroy
      expect(sink.executes).toHaveLength(2);

      // Verify order in the unified `all` stream
      const actionSequence = sink.all
        .filter((r) => r.kind === "start" || r.kind === "execute")
        .map((r) => {
          if (r.kind === "start") return `start:${r.command.action}`;
          return `exec:${r.command.action}`;
        });

      expect(actionSequence).toEqual([
        "start:move",
        "exec:spawn",
        "start:fly",
        "exec:destroy",
        "start:flash",
      ]);
    });
  });

  // =========================================================================
  // error: interrupts + spawn(explosion) → flash(red) → playSound
  // =========================================================================

  describe("error signal → Citadel error choreography", () => {
    it("produces spawn(explosion) → flash(red) → playSound", () => {
      const signal = createSignal("error", {
        message: "Tool web_search timed out",
        severity: "error" as const,
        agentId: "agent-worker",
        code: "TOOL_TIMEOUT",
      });

      choreographer.handleSignal(toPerformanceSignal(signal));

      clock.advance(16);

      // spawn explosion (instant)
      expect(sink.executes).toHaveLength(1);
      expect(sink.executes[0]?.action).toBe("spawn");
      expect(sink.executes[0]?.entityRef).toBe("explosion");
      expect(sink.executes[0]?.params).toEqual({ at: "agent-worker" });

      // flash starts (animated, 400ms)
      expect(sink.starts).toHaveLength(1);
      expect(sink.starts[0]?.action).toBe("flash");
      expect(sink.starts[0]?.entityRef).toBe("agent-worker");
      expect(sink.starts[0]?.params).toEqual({ color: "#ff3300" });
      expect(sink.starts[0]?.duration).toBe(400);

      // flash completes → playSound (instant)
      clock.advance(400);
      expect(sink.completes).toHaveLength(1);
      expect(sink.completes[0]?.action).toBe("flash");

      expect(sink.executes).toHaveLength(2);
      expect(sink.executes[1]?.action).toBe("playSound");
      expect(sink.executes[1]?.params).toEqual({ sound: "sfx/explosion.ogg" });

      expect(choreographer.activePerformanceCount).toBe(0);
    });

    it("interrupts a running task_dispatch choreography", () => {
      const correlationId = "workflow-interrupt-test";

      // Start task_dispatch (long-running: 800ms move + 1200ms fly + ...)
      const taskSignal = createSignal("task_dispatch", {
        taskId: "task-will-be-interrupted",
        from: "orchestrator",
        to: "agent-worker",
      }, { correlationId });

      choreographer.handleSignal(
        toPerformanceSignal(taskSignal),
        taskSignal.correlationId,
      );

      clock.advance(16);   // move starts
      clock.advance(400);  // mid-move

      expect(sink.starts).toHaveLength(1);
      expect(sink.starts[0]?.action).toBe("move");

      // Error arrives on same correlationId → should interrupt
      const errorSignal = createSignal("error", {
        message: "Agent crashed",
        severity: "critical" as const,
        agentId: "agent-worker",
      }, { correlationId });

      choreographer.handleSignal(
        toPerformanceSignal(errorSignal),
        errorSignal.correlationId,
      );

      clock.advance(16);

      // Interrupt command was emitted for the task_dispatch performance
      expect(sink.interrupts).toHaveLength(1);
      expect(sink.interrupts[0]?.correlationId).toBe(correlationId);
      expect(sink.interrupts[0]?.interruptedBy).toBe("error");

      // Error choreography's spawn+flash also started
      const explosionSpawn = sink.executes.find(
        (e) => e.action === "spawn" && e.entityRef === "explosion",
      );
      expect(explosionSpawn).toBeDefined();

      const flashStart = sink.starts.find(
        (s) => s.action === "flash" && s.entityRef === "agent-worker",
      );
      expect(flashStart).toBeDefined();
    });

    it("does not interrupt unrelated performances", () => {
      // Two workflows running in parallel
      const sig1 = createSignal("task_dispatch", {
        taskId: "task-A",
        from: "orch",
        to: "agent-A",
      }, { correlationId: "workflow-A" });

      const sig2 = createSignal("task_dispatch", {
        taskId: "task-B",
        from: "orch",
        to: "agent-B",
      }, { correlationId: "workflow-B" });

      choreographer.handleSignal(toPerformanceSignal(sig1), sig1.correlationId);
      choreographer.handleSignal(toPerformanceSignal(sig2), sig2.correlationId);

      clock.advance(16);
      // Both performances running
      expect(sink.starts).toHaveLength(2);

      // Error only targets workflow-A
      const err = createSignal("error", {
        message: "fail A",
        severity: "error" as const,
        agentId: "agent-A",
      }, { correlationId: "workflow-A" });

      choreographer.handleSignal(toPerformanceSignal(err), err.correlationId);
      clock.advance(16);

      // Only workflow-A interrupted
      expect(sink.interrupts).toHaveLength(1);
      expect(sink.interrupts[0]?.correlationId).toBe("workflow-A");

      // workflow-B still running (its move still active)
      // +2 for task_dispatch moves, +1 for error's flash = 3 starts total
      // The task_dispatch for B should still be advancing
      const bUpdates = sink.updates.filter(
        (u) => u.entityRef === "peon" && u.performanceId !== sink.interrupts[0]?.performanceId,
      );
      expect(bUpdates.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Full emitter scenario signals through the pipeline
  // =========================================================================

  describe("emitter signal factory compatibility", () => {
    it("createSignal output is accepted by choreographer.handleSignal", () => {
      // All 7 signal types from the schema — at minimum, no runtime errors
      const signals = [
        createSignal("task_dispatch", {
          taskId: "t1", from: "o", to: "a",
        }),
        createSignal("tool_call", {
          toolName: "search", agentId: "a1",
        }),
        createSignal("tool_result", {
          toolName: "search", agentId: "a1", success: true,
        }),
        createSignal("token_usage", {
          agentId: "a1", promptTokens: 100, completionTokens: 50,
        }),
        createSignal("agent_state_change", {
          agentId: "a1", from: "idle", to: "thinking",
        }),
        createSignal("error", {
          message: "oops", severity: "warning" as const,
        }),
        createSignal("completion", {
          taskId: "t1", success: true,
        }),
      ];

      // None of these should throw
      for (const signal of signals) {
        choreographer.handleSignal(toPerformanceSignal(signal));
      }

      clock.advance(16);

      // task_dispatch and error have registered choreographies → commands emitted
      expect(sink.all.length).toBeGreaterThan(0);

      // token_usage has a choreography too (gold coins)
      const goldSpawn = sink.executes.find(
        (e) => e.action === "spawn" && e.entityRef === "gold-coins",
      );
      expect(goldSpawn).toBeDefined();
    });
  });
});
