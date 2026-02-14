/**
 * Step commands — undo-able mutations for choreography steps.
 *
 * Extracted from node-detail-inline.ts to be shared across
 * the step chain renderer, step popover, and legacy detail panel.
 */

import type {
  SignalType,
  ChoreographyDef,
  ChoreographyStepDef,
  UndoableCommand,
} from "../types.js";
import { STRUCTURAL_ACTIONS } from "../types.js";
import {
  getChoreographyState,
  updateChoreographyState,
} from "../state/choreography-state.js";
import { executeCommand } from "../state/undo.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SIGNAL_TYPES: SignalType[] = [
  "task_dispatch", "tool_call", "tool_result",
  "token_usage", "agent_state_change", "error", "completion", "event",
];

/** Signal type badge colors. */
export const SIGNAL_TYPE_COLORS: Record<string, string> = {
  task_dispatch: "#E8A851",
  tool_call: "#5B8DEF",
  tool_result: "#4EC9B0",
  token_usage: "#C586C0",
  agent_state_change: "#6A9955",
  error: "#F44747",
  completion: "#4EC9B0",
  event: "#8E8EA0",
};

/** Short display labels for signal types. */
export const SIGNAL_TYPE_LABELS: Record<string, string> = {
  task_dispatch: "task",
  tool_call: "tool\u2197",
  tool_result: "tool\u2199",
  token_usage: "tokens",
  agent_state_change: "state",
  error: "error",
  completion: "done",
  event: "event",
};

export const ACTION_COLORS: Record<string, string> = {
  move: "#5B8DEF", spawn: "#4EC9B0", destroy: "#F44747",
  fly: "#E8A851", flash: "#C586C0", wait: "#6A9955",
  playSound: "#D4A56A", setAnimation: "#56B6C2", followRoute: "#D4A56A",
  parallel: "#888899", onArrive: "#56B6C2", onInterrupt: "#F44747",
};

export const ACTION_TYPES: string[] = [
  "move", "spawn", "destroy", "fly", "flash", "wait", "playSound",
  "setAnimation", "followRoute", "parallel", "onArrive", "onInterrupt",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a short unique ID for steps. */
export function generateId(): string {
  return "ch-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

/** Deep-clone a step array (preserves children). */
export function cloneSteps(steps: ChoreographyStepDef[]): ChoreographyStepDef[] {
  return steps.map((s) => ({
    ...s,
    params: { ...s.params },
    children: s.children ? cloneSteps(s.children) : undefined,
  }));
}

/** Flatten a step tree into a flat list (depth-first). */
export function flattenSteps(steps: ChoreographyStepDef[]): ChoreographyStepDef[] {
  const result: ChoreographyStepDef[] = [];
  for (const step of steps) {
    result.push(step);
    if (step.children) result.push(...flattenSteps(step.children));
  }
  return result;
}

/** Create a default step for a given action type. */
export function createDefaultStep(action: string): ChoreographyStepDef {
  const base: ChoreographyStepDef = { id: generateId(), action, params: {} };
  switch (action) {
    case "move": return { ...base, entity: "agent", duration: 800, easing: "easeInOut", params: { to: "" } };
    case "spawn": return { ...base, entity: "pigeon", params: { at: "" } };
    case "destroy": return { ...base, entity: "pigeon", params: {} };
    case "fly": return { ...base, entity: "pigeon", duration: 1200, easing: "arc", params: { to: "" } };
    case "flash": return { ...base, target: "signal.to", duration: 300, params: { color: "#E8A851" } };
    case "wait": return { ...base, duration: 500, params: {} };
    case "playSound": return { ...base, params: { sound: "" } };
    case "setAnimation": return { ...base, entity: "", params: { state: "" } };
    case "followRoute": return { ...base, entity: "", duration: 2000, easing: "easeInOut", params: { route: "", reverse: false, animationDuring: "walk", animationOnArrival: "idle" } };
    case "parallel": case "onArrive": case "onInterrupt":
      return { ...base, params: {}, children: [] };
    default: return base;
  }
}

/** Summarize a step as a short label (for pills and previews). */
export function summarizeStep(step: ChoreographyStepDef): string {
  const entity = step.entity ?? step.target ?? "";
  const to = step.params["to"] ? ` → ${step.params["to"]}` : "";
  const dur = step.duration ? ` ${step.duration}ms` : "";
  if (STRUCTURAL_ACTIONS.includes(step.action)) {
    const count = step.children?.length ?? 0;
    return `${count} step${count !== 1 ? "s" : ""}`;
  }
  return `${entity}${to}${dur}`.trim() || step.action;
}

// ---------------------------------------------------------------------------
// Undo commands
// ---------------------------------------------------------------------------

/** Update choreography-level fields (on, when, interrupts, defaultTargetEntityId). */
export function updateChoreographyCmd(
  id: string,
  updates: Partial<Pick<ChoreographyDef, "on" | "when" | "interrupts" | "defaultTargetEntityId">>,
): void {
  const { choreographies } = getChoreographyState();
  const snapshot = choreographies.map((c) => ({ ...c, steps: cloneSteps(c.steps) }));
  const updated = choreographies.map((c) => c.id === id ? { ...c, ...updates } : c);
  const cmd: UndoableCommand = {
    execute() { updateChoreographyState({ choreographies: updated }); },
    undo() { updateChoreographyState({ choreographies: snapshot }); },
    description: "Update choreography",
  };
  executeCommand(cmd);
}

/** Add a step to a choreography (optionally as child of a structural step). */
export function addStepCmd(choreoId: string, step: ChoreographyStepDef, parentStepId?: string): void {
  const { choreographies } = getChoreographyState();
  const snapshot = choreographies.map((c) => ({ ...c, steps: cloneSteps(c.steps) }));
  function insertStep(steps: ChoreographyStepDef[]): ChoreographyStepDef[] {
    if (!parentStepId) return [...steps, step];
    return steps.map((s) => {
      if (s.id === parentStepId && s.children) return { ...s, children: [...s.children, step] };
      if (s.children) return { ...s, children: insertStep(s.children) };
      return s;
    });
  }
  const updated = choreographies.map((c) => c.id === choreoId ? { ...c, steps: insertStep(c.steps) } : c);
  const cmd: UndoableCommand = {
    execute() { updateChoreographyState({ choreographies: updated, selectedStepId: step.id }); },
    undo() { updateChoreographyState({ choreographies: snapshot, selectedStepId: null }); },
    description: `Add ${step.action} step`,
  };
  executeCommand(cmd);
}

/** Remove a step by ID from a choreography. */
export function removeStepCmd(choreoId: string, stepId: string): void {
  const { choreographies } = getChoreographyState();
  const snapshot = choreographies.map((c) => ({ ...c, steps: cloneSteps(c.steps) }));
  function filterStep(steps: ChoreographyStepDef[]): ChoreographyStepDef[] {
    return steps
      .filter((s) => s.id !== stepId)
      .map((s) => s.children ? { ...s, children: filterStep(s.children) } : s);
  }
  const updated = choreographies.map((c) => c.id === choreoId ? { ...c, steps: filterStep(c.steps) } : c);
  const cmd: UndoableCommand = {
    execute() { updateChoreographyState({ choreographies: updated, selectedStepId: null }); },
    undo() { updateChoreographyState({ choreographies: snapshot }); },
    description: "Remove step",
  };
  executeCommand(cmd);
}

/** Move a step up or down within its sibling list. */
export function moveStepCmd(choreoId: string, stepId: string, direction: -1 | 1): void {
  const { choreographies } = getChoreographyState();
  const snapshot = choreographies.map((c) => ({ ...c, steps: cloneSteps(c.steps) }));
  function swapInList(steps: ChoreographyStepDef[]): ChoreographyStepDef[] {
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx >= 0) {
      const swapIdx = idx + direction;
      if (swapIdx >= 0 && swapIdx < steps.length) {
        const copy = [...steps];
        const tmp = copy[idx]!;
        copy[idx] = copy[swapIdx]!;
        copy[swapIdx] = tmp;
        return copy;
      }
      return steps;
    }
    return steps.map((s) => s.children ? { ...s, children: swapInList(s.children) } : s);
  }
  const updated = choreographies.map((c) => c.id === choreoId ? { ...c, steps: swapInList(c.steps) } : c);
  const cmd: UndoableCommand = {
    execute() { updateChoreographyState({ choreographies: updated }); },
    undo() { updateChoreographyState({ choreographies: snapshot }); },
    description: "Reorder step",
  };
  executeCommand(cmd);
}

/** Update fields of a specific step within a choreography. */
export function updateStepCmd(choreoId: string, stepId: string, updates: Partial<ChoreographyStepDef>): void {
  const { choreographies } = getChoreographyState();
  const snapshot = choreographies.map((c) => ({ ...c, steps: cloneSteps(c.steps) }));
  function patchStep(steps: ChoreographyStepDef[]): ChoreographyStepDef[] {
    return steps.map((s) => {
      if (s.id === stepId) return { ...s, ...updates };
      if (s.children) return { ...s, children: patchStep(s.children) };
      return s;
    });
  }
  const updated = choreographies.map((c) => c.id === choreoId ? { ...c, steps: patchStep(c.steps) } : c);
  const cmd: UndoableCommand = {
    execute() { updateChoreographyState({ choreographies: updated }); },
    undo() { updateChoreographyState({ choreographies: snapshot }); },
    description: "Update step",
  };
  executeCommand(cmd);
}
