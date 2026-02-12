/**
 * Node detail inline — step editor rendered under the selected node.
 *
 * Displays: signal type selector, interrupts toggle, step list, step detail.
 * Integrated into the canvas (pans/zooms with nodes).
 *
 * Reuses undo commands and rendering patterns from the original
 * choreography-view.ts, extracted into this module.
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
  selectChoreographyStep,
} from "../state/choreography-state.js";
import {
  getWiringState,
  removeWire,
} from "../state/wiring-state.js";
import {
  getChoreoInputInfo,
  getSourcesForChoreo,
} from "../state/wiring-queries.js";
import { getSignalSourcesState } from "../state/signal-source-state.js";
import { executeCommand } from "../state/undo.js";
import { getActionSchema } from "../choreography/action-inputs.js";
import { createInputControl } from "../choreography/input-controls.js";
import type { OnInputChange } from "../choreography/input-controls.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIGNAL_TYPES: SignalType[] = [
  "task_dispatch", "tool_call", "tool_result",
  "token_usage", "agent_state_change", "error", "completion",
];

/** Signal type badge colors. */
const SIGNAL_TYPE_COLORS: Record<string, string> = {
  task_dispatch: "#E8A851",
  tool_call: "#5B8DEF",
  tool_result: "#4EC9B0",
  token_usage: "#C586C0",
  agent_state_change: "#6A9955",
  error: "#F44747",
  completion: "#4EC9B0",
};

const ACTION_COLORS: Record<string, string> = {
  move: "#5B8DEF", spawn: "#4EC9B0", destroy: "#F44747",
  fly: "#E8A851", flash: "#C586C0", wait: "#6A9955",
  playSound: "#D4A56A", parallel: "#888899",
  onArrive: "#56B6C2", onInterrupt: "#F44747",
};

const ACTION_TYPES: string[] = [
  "move", "spawn", "destroy", "fly", "flash", "wait", "playSound",
  "parallel", "onArrive", "onInterrupt",
];

// ---------------------------------------------------------------------------
// Lucide SVG helpers
// ---------------------------------------------------------------------------

function lucide(inner: string, size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

const ICON_PLUS = lucide('<path d="M5 12h14"/><path d="M12 5v14"/>');
const ICON_TRASH = lucide('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>');
const ICON_CHEVRON_UP = lucide('<path d="m18 15-6-6-6 6"/>');
const ICON_CHEVRON_DOWN = lucide('<path d="m6 9 6 6 6-6"/>');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return "ch-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

function cloneSteps(steps: ChoreographyStepDef[]): ChoreographyStepDef[] {
  return steps.map((s) => ({
    ...s,
    params: { ...s.params },
    children: s.children ? cloneSteps(s.children) : undefined,
  }));
}

function flattenSteps(steps: ChoreographyStepDef[]): ChoreographyStepDef[] {
  const result: ChoreographyStepDef[] = [];
  for (const step of steps) {
    result.push(step);
    if (step.children) result.push(...flattenSteps(step.children));
  }
  return result;
}

function createDefaultStep(action: string): ChoreographyStepDef {
  const base: ChoreographyStepDef = { id: generateId(), action, params: {} };
  switch (action) {
    case "move": return { ...base, entity: "agent", duration: 800, easing: "easeInOut", params: { to: "" } };
    case "spawn": return { ...base, entity: "pigeon", params: { at: "" } };
    case "destroy": return { ...base, entity: "pigeon", params: {} };
    case "fly": return { ...base, entity: "pigeon", duration: 1200, easing: "arc", params: { to: "" } };
    case "flash": return { ...base, target: "signal.to", duration: 300, params: { color: "#E8A851" } };
    case "wait": return { ...base, duration: 500, params: {} };
    case "playSound": return { ...base, params: { sound: "" } };
    case "parallel": case "onArrive": case "onInterrupt":
      return { ...base, params: {}, children: [] };
    default: return base;
  }
}

// ---------------------------------------------------------------------------
// Undo commands
// ---------------------------------------------------------------------------

function updateChoreographyCmd(
  id: string,
  updates: Partial<Pick<ChoreographyDef, "on" | "when" | "interrupts">>,
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

function addStepCmd(choreoId: string, step: ChoreographyStepDef, parentStepId?: string): void {
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

function removeStepCmd(choreoId: string, stepId: string): void {
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

function moveStepCmd(choreoId: string, stepId: string, direction: -1 | 1): void {
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

function updateStepCmd(choreoId: string, stepId: string, updates: Partial<ChoreographyStepDef>): void {
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

// ---------------------------------------------------------------------------
// Track last-used action
// ---------------------------------------------------------------------------

let lastUsedAction = "move";

// ---------------------------------------------------------------------------
// Render: inline detail
// ---------------------------------------------------------------------------

/** Render the inline detail panel for a choreography node. */
export function renderNodeDetail(choreo: ChoreographyDef): HTMLElement {
  const detail = document.createElement("div");
  detail.className = "nc-node-detail";

  // Prevent node drag when interacting with detail
  detail.addEventListener("mousedown", (e) => e.stopPropagation());

  // ── Header: inputs + interrupts ──
  const headerSection = document.createElement("div");
  headerSection.className = "nc-detail-section";

  // Signal type inputs (wire-driven or fallback)
  const inputInfo = getChoreoInputInfo(choreo.id);

  if (inputInfo.hasWires) {
    // Wire-driven mode: show wired input badges with detach buttons
    const inputsLabel = document.createElement("div");
    inputsLabel.className = "nc-detail-label";
    inputsLabel.textContent = "inputs";
    headerSection.appendChild(inputsLabel);

    const inputsContainer = document.createElement("div");
    inputsContainer.className = "nc-detail-inputs";

    for (const signalType of inputInfo.wiredTypes) {
      const color = SIGNAL_TYPE_COLORS[signalType] ?? "#6E6E8A";
      const badge = document.createElement("span");
      badge.className = "nc-detail-input-badge";
      badge.style.background = color + "22";
      badge.style.color = color;

      const labelText = document.createElement("span");
      labelText.textContent = signalType.replace(/_/g, " ");
      badge.appendChild(labelText);

      // Detach button
      const detach = document.createElement("span");
      detach.className = "nc-detail-detach";
      detach.textContent = "\u00D7";
      detach.title = `Detach ${signalType}`;
      detach.addEventListener("click", (e) => {
        e.stopPropagation();
        // Find and remove the wire
        const { wires } = getWiringState();
        const wire = wires.find(
          (w) => w.fromZone === "signal-type" && w.fromId === signalType
            && w.toZone === "choreographer" && w.toId === choreo.id,
        );
        if (wire) removeWire(wire.id);
      });
      badge.appendChild(detach);

      inputsContainer.appendChild(badge);
    }

    headerSection.appendChild(inputsContainer);

    // Source provenance
    const provenance = getSourcesForChoreo(choreo.id);
    if (provenance.length > 0) {
      const srcEl = document.createElement("div");
      srcEl.className = "nc-detail-sources";
      const { sources } = getSignalSourcesState();
      const names = provenance.map((p) => {
        const src = sources.find((s) => s.id === p.sourceId);
        return `${src?.name ?? p.sourceId.slice(0, 8)} → ${p.signalType.replace(/_/g, " ")}`;
      });
      srcEl.textContent = names.join(" · ");
      headerSection.appendChild(srcEl);
    }

    const hint = document.createElement("div");
    hint.className = "nc-detail-hint";
    hint.textContent = "Drag signal-type → node to add inputs";
    headerSection.appendChild(hint);
  } else {
    // Fallback mode: show select dropdown for on field
    const onRow = document.createElement("div");
    onRow.className = "nc-detail-row";
    const onLabel = document.createElement("span");
    onLabel.className = "nc-detail-label";
    onLabel.textContent = "on";
    onRow.appendChild(onLabel);

    const onSelect = document.createElement("select");
    onSelect.className = "nc-detail-select";
    for (const st of SIGNAL_TYPES) {
      const opt = document.createElement("option");
      opt.value = st;
      opt.textContent = st;
      if (st === choreo.on) opt.selected = true;
      onSelect.appendChild(opt);
    }
    onSelect.addEventListener("change", () => {
      updateChoreographyCmd(choreo.id, { on: onSelect.value });
    });
    onRow.appendChild(onSelect);
    headerSection.appendChild(onRow);

    const hint = document.createElement("div");
    hint.className = "nc-detail-hint";
    hint.textContent = "Wire a signal-type to override";
    headerSection.appendChild(hint);
  }

  // Interrupts row
  const intRow = document.createElement("div");
  intRow.className = "nc-detail-row";
  const intLabel = document.createElement("span");
  intLabel.className = "nc-detail-label";
  intLabel.textContent = "interrupts";
  intRow.appendChild(intLabel);
  const intCb = document.createElement("input");
  intCb.type = "checkbox";
  intCb.checked = choreo.interrupts;
  intCb.addEventListener("change", () => {
    updateChoreographyCmd(choreo.id, { interrupts: intCb.checked });
  });
  intRow.appendChild(intCb);
  headerSection.appendChild(intRow);

  detail.appendChild(headerSection);

  // ── Separator ──
  const sep = document.createElement("div");
  sep.className = "nc-detail-separator";
  detail.appendChild(sep);

  // ── Step list ──
  const stepsSection = document.createElement("div");
  stepsSection.className = "nc-detail-section";

  const stepsTitle = document.createElement("div");
  stepsTitle.className = "nc-detail-title";
  stepsTitle.textContent = "Steps";
  stepsSection.appendChild(stepsTitle);

  if (choreo.steps.length === 0) {
    const empty = document.createElement("div");
    empty.className = "nc-detail-empty";
    empty.textContent = "No steps yet.";
    stepsSection.appendChild(empty);
  } else {
    let stepCounter = 0;
    renderStepRows(stepsSection, choreo.id, choreo.steps, 0, stepCounter);
  }

  // Add step buttons
  const addRow = document.createElement("div");
  addRow.className = "nc-detail-add-row";

  const addActionBtn = document.createElement("button");
  addActionBtn.className = "nc-detail-btn";
  addActionBtn.innerHTML = `${ICON_PLUS} Action`;
  addActionBtn.addEventListener("click", () => {
    addStepCmd(choreo.id, createDefaultStep(lastUsedAction));
  });
  addRow.appendChild(addActionBtn);

  const addGroupBtn = document.createElement("button");
  addGroupBtn.className = "nc-detail-btn";
  addGroupBtn.innerHTML = `${ICON_PLUS} Group`;
  addGroupBtn.addEventListener("click", () => {
    addStepCmd(choreo.id, createDefaultStep("parallel"));
  });
  addRow.appendChild(addGroupBtn);

  stepsSection.appendChild(addRow);
  detail.appendChild(stepsSection);

  // ── Step detail (if a step is selected) ──
  const { selectedStepId } = getChoreographyState();
  if (selectedStepId) {
    const allSteps = flattenSteps(choreo.steps);
    const step = allSteps.find((s) => s.id === selectedStepId);
    if (step) {
      const sep2 = document.createElement("div");
      sep2.className = "nc-detail-separator";
      detail.appendChild(sep2);
      detail.appendChild(renderStepDetailSection(choreo, step));
    }
  }

  return detail;
}

// ---------------------------------------------------------------------------
// Render: step rows
// ---------------------------------------------------------------------------

let globalStepCounter = 0;

function renderStepRows(
  container: HTMLElement,
  choreoId: string,
  steps: ChoreographyStepDef[],
  depth: number,
  _counter: number,
): void {
  const { selectedStepId } = getChoreographyState();

  for (const step of steps) {
    globalStepCounter++;
    const row = document.createElement("div");
    row.className = "nc-step" +
      (step.id === selectedStepId ? " nc-step--selected" : "");

    if (depth > 0) {
      row.style.paddingLeft = `${4 + depth * 16}px`;
    }

    // Step number
    const num = document.createElement("span");
    num.className = "nc-step-num";
    num.textContent = String(globalStepCounter);
    row.appendChild(num);

    // Action badge
    const badge = document.createElement("span");
    badge.className = "nc-step-badge";
    const color = ACTION_COLORS[step.action] ?? "#888899";
    badge.style.background = color + "22";
    badge.style.color = color;
    badge.textContent = step.action;
    row.appendChild(badge);

    // Summary
    const summary = document.createElement("span");
    summary.className = "nc-step-summary";
    summary.textContent = summarizeStep(step);
    row.appendChild(summary);

    // Action buttons
    const actions = document.createElement("span");
    actions.className = "nc-step-actions";

    const upBtn = document.createElement("button");
    upBtn.innerHTML = ICON_CHEVRON_UP;
    upBtn.title = "Move up";
    upBtn.addEventListener("click", (e) => { e.stopPropagation(); moveStepCmd(choreoId, step.id, -1); });
    actions.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.innerHTML = ICON_CHEVRON_DOWN;
    downBtn.title = "Move down";
    downBtn.addEventListener("click", (e) => { e.stopPropagation(); moveStepCmd(choreoId, step.id, 1); });
    actions.appendChild(downBtn);

    const delBtn = document.createElement("button");
    delBtn.innerHTML = ICON_TRASH;
    delBtn.title = "Delete";
    delBtn.addEventListener("click", (e) => { e.stopPropagation(); removeStepCmd(choreoId, step.id); });
    actions.appendChild(delBtn);

    row.appendChild(actions);

    // Click to select
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      selectChoreographyStep(step.id === selectedStepId ? null : step.id);
    });

    container.appendChild(row);

    // Structural children
    if (STRUCTURAL_ACTIONS.includes(step.action) && step.children) {
      if (step.children.length > 0) {
        renderStepRows(container, choreoId, step.children, depth + 1, globalStepCounter);
      }
      const addChildBtn = document.createElement("button");
      addChildBtn.className = "nc-detail-btn nc-detail-btn--child";
      addChildBtn.style.paddingLeft = `${4 + (depth + 1) * 16}px`;
      addChildBtn.innerHTML = `${ICON_PLUS} Add to ${step.action}`;
      addChildBtn.addEventListener("click", () => {
        addStepCmd(choreoId, createDefaultStep("move"), step.id);
      });
      container.appendChild(addChildBtn);
    }
  }
}

// ---------------------------------------------------------------------------
// Render: step detail (ISF inputs)
// ---------------------------------------------------------------------------

function renderStepDetailSection(choreo: ChoreographyDef, step: ChoreographyStepDef): HTMLElement {
  lastUsedAction = STRUCTURAL_ACTIONS.includes(step.action) ? "move" : step.action;

  const section = document.createElement("div");
  section.className = "nc-detail-section";

  const title = document.createElement("div");
  title.className = "nc-detail-title";
  title.textContent = "Detail";
  section.appendChild(title);

  // Action dropdown
  const actionSelect = document.createElement("select");
  actionSelect.className = "nc-detail-select";
  for (const a of ACTION_TYPES) {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    if (a === step.action) opt.selected = true;
    actionSelect.appendChild(opt);
  }
  section.appendChild(detailRow("action", actionSelect));

  // Pending updates accumulator
  const pending: Record<string, unknown> = {};

  const onChange: OnInputChange = (key: string, value: unknown) => {
    pending[key] = value;
  };

  // ISF inputs from action schema
  const schema = getActionSchema(step.action);
  if (schema) {
    // Common inputs (entity, duration, easing)
    for (const decl of schema.common) {
      let currentValue: unknown;
      if (decl.key === "entity") currentValue = step.entity;
      else if (decl.key === "target") currentValue = step.target;
      else if (decl.key === "duration") currentValue = step.duration;
      else if (decl.key === "easing") currentValue = step.easing;
      const control = createInputControl(decl, currentValue, onChange);
      section.appendChild(control);
    }

    // Action-specific param inputs
    if (schema.params.length > 0) {
      const paramTitle = document.createElement("div");
      paramTitle.className = "nc-detail-subtitle";
      paramTitle.textContent = "Parameters";
      section.appendChild(paramTitle);

      for (const decl of schema.params) {
        const currentValue = step.params[decl.key];
        const control = createInputControl(decl, currentValue, onChange);
        section.appendChild(control);
      }
    }
  }

  // Fallback: raw params textarea if no schema
  if (!schema) {
    const textarea = document.createElement("textarea");
    textarea.className = "nc-detail-textarea";
    textarea.value = JSON.stringify(step.params, null, 2);
    textarea.rows = 4;
    textarea.addEventListener("change", () => {
      try {
        const parsed = JSON.parse(textarea.value) as Record<string, unknown>;
        pending["__raw_params"] = parsed;
      } catch { /* ignore invalid JSON */ }
    });
    section.appendChild(detailRow("params", textarea));
  }

  // Apply button
  const applyBtn = document.createElement("button");
  applyBtn.className = "nc-detail-apply";
  applyBtn.textContent = "Apply";
  applyBtn.addEventListener("click", () => {
    const newAction = actionSelect.value;
    const updates: Partial<ChoreographyStepDef> = {};

    if (newAction !== step.action) {
      updates.action = newAction;
      if (STRUCTURAL_ACTIONS.includes(newAction) && !step.children) {
        updates.children = [];
      }
      if (!STRUCTURAL_ACTIONS.includes(newAction) && step.children) {
        updates.children = undefined;
      }
    }

    // Apply ISF pending changes
    for (const [key, value] of Object.entries(pending)) {
      if (key === "__raw_params") {
        updates.params = value as Record<string, unknown>;
        continue;
      }
      if (key === "entity") { updates.entity = value as string; continue; }
      if (key === "target") { updates.target = value as string; continue; }
      if (key === "duration") { updates.duration = value as number; continue; }
      if (key === "easing") { updates.easing = value as string; continue; }
      updates.params = { ...(updates.params ?? step.params), [key]: value };
    }

    if (Object.keys(updates).length > 0) {
      updateStepCmd(choreo.id, step.id, updates);
    }
  });
  section.appendChild(applyBtn);

  return section;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detailRow(label: string, input: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "nc-detail-row";
  const lbl = document.createElement("span");
  lbl.className = "nc-detail-label";
  lbl.textContent = label;
  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}

function summarizeStep(step: ChoreographyStepDef): string {
  const entity = step.entity ?? step.target ?? "";
  const to = step.params["to"] ? ` → ${step.params["to"]}` : "";
  const dur = step.duration ? ` ${step.duration}ms` : "";
  if (STRUCTURAL_ACTIONS.includes(step.action)) {
    const count = step.children?.length ?? 0;
    return `${count} step${count !== 1 ? "s" : ""}`;
  }
  return `${entity}${to}${dur}`.trim() || step.action;
}
