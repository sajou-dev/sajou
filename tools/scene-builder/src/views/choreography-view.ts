/**
 * Choreography view — the Orchestrator tab.
 *
 * Visual editor for composing ChoreographyDefinition objects (the JSON format
 * interpreted by the @sajou/core Choreographer runtime).
 *
 * Layout:
 *   .ch-sidebar (left, 280px)
 *     ├── Choreography list section (list + add button)
 *     └── Import / Export section
 *   .ch-main (right, flex:1)
 *     ├── Header section (on, interrupts, when clause)
 *     ├── Step list section (ordered steps with nesting)
 *     └── Step detail section (form for selected step)
 */

import {
  getChoreographyState,
  updateChoreographyState,
  selectChoreography,
  selectChoreographyStep,
  subscribeChoreography,
} from "../state/choreography-state.js";
import { executeCommand } from "../state/undo.js";
import type {
  SignalType,
  ChoreographyDef,
  ChoreographyStepDef,
  WhenOperatorDef,
  WhenConditionDef,
  WhenClauseDef,
  UndoableCommand,
} from "../types.js";
import { STRUCTURAL_ACTIONS } from "../types.js";
import { getActionSchema } from "../choreography/action-inputs.js";
import { createInputControl } from "../choreography/input-controls.js";
import type { OnInputChange } from "../choreography/input-controls.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All known signal types for the "on" dropdown. */
const SIGNAL_TYPES: SignalType[] = [
  "task_dispatch", "tool_call", "tool_result",
  "token_usage", "agent_state_change", "error", "completion",
];

/** Signal type badge colors (shared with signal-timeline-panel). */
const SIGNAL_TYPE_COLORS: Record<string, string> = {
  task_dispatch: "#E8A851",
  tool_call: "#5B8DEF",
  tool_result: "#4EC9B0",
  token_usage: "#C586C0",
  agent_state_change: "#6A9955",
  error: "#F44747",
  completion: "#4EC9B0",
};

/** Action type badge colors. */
const ACTION_COLORS: Record<string, string> = {
  move: "#5B8DEF", spawn: "#4EC9B0", destroy: "#F44747",
  fly: "#E8A851", flash: "#C586C0", wait: "#6A9955",
  playSound: "#D4A56A", parallel: "#888899",
  onArrive: "#56B6C2", onInterrupt: "#F44747",
};

/** Known action types for the dropdown. */
const ACTION_TYPES: string[] = [
  "move", "spawn", "destroy", "fly", "flash", "wait", "playSound",
  "parallel", "onArrive", "onInterrupt",
];

/* Easing names moved to choreography/input-controls.ts (ISF system). */

/** Operator names for the when-clause editor. */
const OPERATOR_NAMES: string[] = [
  "equals", "contains", "matches", "gt", "lt", "exists",
];

// ---------------------------------------------------------------------------
// Lucide SVG helpers
// ---------------------------------------------------------------------------

function lucide(inner: string, size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

const ICON_CHEVRON_UP = lucide('<path d="m18 15-6-6-6 6"/>');
const ICON_CHEVRON_DOWN = lucide('<path d="m6 9 6 6 6-6"/>');
const ICON_TRASH = lucide('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>');
const ICON_PLUS = lucide('<path d="M5 12h14"/><path d="M12 5v14"/>');
const ICON_X = lucide('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateId(): string {
  return "ch-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the currently selected choreography, or null. */
function getSelectedChoreography(): ChoreographyDef | null {
  const { choreographies, selectedChoreographyId } = getChoreographyState();
  if (!selectedChoreographyId) return null;
  return choreographies.find((c) => c.id === selectedChoreographyId) ?? null;
}

/** Flatten all steps (including children) into a flat list for ID lookup. */
function flattenSteps(steps: ChoreographyStepDef[]): ChoreographyStepDef[] {
  const result: ChoreographyStepDef[] = [];
  for (const step of steps) {
    result.push(step);
    if (step.children) {
      result.push(...flattenSteps(step.children));
    }
  }
  return result;
}

/** Deep-clone a step array. */
function cloneSteps(steps: ChoreographyStepDef[]): ChoreographyStepDef[] {
  return steps.map((s) => ({
    ...s,
    params: { ...s.params },
    children: s.children ? cloneSteps(s.children) : undefined,
  }));
}

/** Summarize a step for display in the list. */
function summarizeStep(step: ChoreographyStepDef): string {
  const entity = step.entity ?? step.target ?? "";
  const to = step.params["to"] ? ` → ${step.params["to"]}` : "";
  const at = step.params["at"] ? ` @ ${step.params["at"]}` : "";
  const color = step.params["color"] ? ` ${step.params["color"]}` : "";
  const dur = step.duration ? ` ${step.duration}ms` : "";

  if (STRUCTURAL_ACTIONS.includes(step.action)) {
    const count = step.children?.length ?? 0;
    return `${count} step${count !== 1 ? "s" : ""}`;
  }
  return `${entity}${to}${at}${color}${dur}`.trim() || step.action;
}

/** Summarize a when clause for display in the sidebar. */
function summarizeWhen(when: WhenClauseDef | undefined): string {
  if (!when) return "";
  if (Array.isArray(when)) {
    return when.length > 0 ? `${when.length} OR groups` : "";
  }
  const keys = Object.keys(when);
  if (keys.length === 0) return "";
  if (keys.length === 1) {
    const path = keys[0]!;
    const op = when[path]!;
    const opName = Object.keys(op)[0] ?? "?";
    return `${path.replace("signal.", "")} ${opName}`;
  }
  return `${keys.length} conditions`;
}

/** Create a default step for a given action. */
function createDefaultStep(action: string): ChoreographyStepDef {
  const base: ChoreographyStepDef = {
    id: generateId(),
    action,
    params: {},
  };

  switch (action) {
    case "move":
      return { ...base, entity: "agent", duration: 800, easing: "easeInOut", params: { to: "" } };
    case "spawn":
      return { ...base, entity: "pigeon", params: { at: "" } };
    case "destroy":
      return { ...base, entity: "pigeon", params: {} };
    case "fly":
      return { ...base, entity: "pigeon", duration: 1200, easing: "arc", params: { to: "" } };
    case "flash":
      return { ...base, target: "signal.to", duration: 300, params: { color: "#E8A851" } };
    case "wait":
      return { ...base, duration: 500, params: {} };
    case "playSound":
      return { ...base, params: { sound: "" } };
    case "parallel":
    case "onArrive":
    case "onInterrupt":
      return { ...base, params: {}, children: [] };
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// Undo commands
// ---------------------------------------------------------------------------

/** Add a new choreography and select it. */
function addChoreographyCmd(def: ChoreographyDef): void {
  const cmd: UndoableCommand = {
    execute() {
      const { choreographies } = getChoreographyState();
      updateChoreographyState({
        choreographies: [...choreographies, def],
        selectedChoreographyId: def.id,
        selectedStepId: null,
      });
    },
    undo() {
      const { choreographies } = getChoreographyState();
      updateChoreographyState({
        choreographies: choreographies.filter((c) => c.id !== def.id),
        selectedChoreographyId: null,
        selectedStepId: null,
      });
    },
    description: `Add choreography (${def.on})`,
  };
  executeCommand(cmd);
}

/** Remove a choreography. */
function removeChoreographyCmd(id: string): void {
  const { choreographies } = getChoreographyState();
  const snapshot = choreographies.map((c) => ({ ...c, steps: cloneSteps(c.steps) }));
  const cmd: UndoableCommand = {
    execute() {
      const cur = getChoreographyState().choreographies;
      updateChoreographyState({
        choreographies: cur.filter((c) => c.id !== id),
        selectedChoreographyId: null,
        selectedStepId: null,
      });
    },
    undo() {
      updateChoreographyState({ choreographies: snapshot });
    },
    description: "Remove choreography",
  };
  executeCommand(cmd);
}

/** Update choreography metadata (on, when, interrupts). */
function updateChoreographyCmd(
  id: string,
  updates: Partial<Pick<ChoreographyDef, "on" | "when" | "interrupts">>,
): void {
  const { choreographies } = getChoreographyState();
  const snapshot = choreographies.map((c) => ({ ...c, steps: cloneSteps(c.steps) }));
  const updated = choreographies.map((c) =>
    c.id === id ? { ...c, ...updates } : c,
  );
  const cmd: UndoableCommand = {
    execute() { updateChoreographyState({ choreographies: updated }); },
    undo() { updateChoreographyState({ choreographies: snapshot }); },
    description: "Update choreography",
  };
  executeCommand(cmd);
}

/** Add a step to a choreography (at top level or as child of a structural step). */
function addStepCmd(
  choreoId: string,
  step: ChoreographyStepDef,
  parentStepId?: string,
): void {
  const { choreographies } = getChoreographyState();
  const snapshot = choreographies.map((c) => ({ ...c, steps: cloneSteps(c.steps) }));

  function insertStep(steps: ChoreographyStepDef[]): ChoreographyStepDef[] {
    if (!parentStepId) return [...steps, step];
    return steps.map((s) => {
      if (s.id === parentStepId && s.children) {
        return { ...s, children: [...s.children, step] };
      }
      if (s.children) {
        return { ...s, children: insertStep(s.children) };
      }
      return s;
    });
  }

  const updated = choreographies.map((c) =>
    c.id === choreoId ? { ...c, steps: insertStep(c.steps) } : c,
  );
  const cmd: UndoableCommand = {
    execute() {
      updateChoreographyState({ choreographies: updated, selectedStepId: step.id });
    },
    undo() {
      updateChoreographyState({ choreographies: snapshot, selectedStepId: null });
    },
    description: `Add ${step.action} step`,
  };
  executeCommand(cmd);
}

/** Remove a step from a choreography (recursively searches children). */
function removeStepCmd(choreoId: string, stepId: string): void {
  const { choreographies } = getChoreographyState();
  const snapshot = choreographies.map((c) => ({ ...c, steps: cloneSteps(c.steps) }));

  function filterStep(steps: ChoreographyStepDef[]): ChoreographyStepDef[] {
    return steps
      .filter((s) => s.id !== stepId)
      .map((s) => s.children ? { ...s, children: filterStep(s.children) } : s);
  }

  const updated = choreographies.map((c) =>
    c.id === choreoId ? { ...c, steps: filterStep(c.steps) } : c,
  );
  const cmd: UndoableCommand = {
    execute() { updateChoreographyState({ choreographies: updated, selectedStepId: null }); },
    undo() { updateChoreographyState({ choreographies: snapshot }); },
    description: "Remove step",
  };
  executeCommand(cmd);
}

/** Move a step up/down within its parent list. */
function moveStepCmd(
  choreoId: string,
  stepId: string,
  direction: -1 | 1,
): void {
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
    return steps.map((s) =>
      s.children ? { ...s, children: swapInList(s.children) } : s,
    );
  }

  const updated = choreographies.map((c) =>
    c.id === choreoId ? { ...c, steps: swapInList(c.steps) } : c,
  );
  const cmd: UndoableCommand = {
    execute() { updateChoreographyState({ choreographies: updated }); },
    undo() { updateChoreographyState({ choreographies: snapshot }); },
    description: "Reorder step",
  };
  executeCommand(cmd);
}

/** Update a step's fields. */
function updateStepCmd(
  choreoId: string,
  stepId: string,
  updates: Partial<ChoreographyStepDef>,
): void {
  const { choreographies } = getChoreographyState();
  const snapshot = choreographies.map((c) => ({ ...c, steps: cloneSteps(c.steps) }));

  function patchStep(steps: ChoreographyStepDef[]): ChoreographyStepDef[] {
    return steps.map((s) => {
      if (s.id === stepId) return { ...s, ...updates };
      if (s.children) return { ...s, children: patchStep(s.children) };
      return s;
    });
  }

  const updated = choreographies.map((c) =>
    c.id === choreoId ? { ...c, steps: patchStep(c.steps) } : c,
  );
  const cmd: UndoableCommand = {
    execute() { updateChoreographyState({ choreographies: updated }); },
    undo() { updateChoreographyState({ choreographies: snapshot }); },
    description: "Update step",
  };
  executeCommand(cmd);
}

// ---------------------------------------------------------------------------
// Import / Export
// ---------------------------------------------------------------------------

/** Convert editor step to export format (strip id, merge params, recurse children). */
function stepToExport(step: ChoreographyStepDef): Record<string, unknown> {
  const out: Record<string, unknown> = { action: step.action };
  if (step.entity) out["entity"] = step.entity;
  if (step.target) out["target"] = step.target;
  if (step.duration !== undefined) out["duration"] = step.duration;
  if (step.easing) out["easing"] = step.easing;
  // Merge extra params
  for (const [k, v] of Object.entries(step.params)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  // Children → steps
  if (step.children && step.children.length > 0) {
    out["steps"] = step.children.map(stepToExport);
  }
  return out;
}

/** Convert editor def to export format. */
function defToExport(def: ChoreographyDef): Record<string, unknown> {
  const out: Record<string, unknown> = { on: def.on };
  if (def.when) out["when"] = def.when;
  if (def.interrupts) out["interrupts"] = true;
  out["steps"] = def.steps.map(stepToExport);
  return out;
}

/** Export all choreographies as JSON file. */
function exportChoreographies(): void {
  const { choreographies } = getChoreographyState();
  const exported = choreographies.map(defToExport);
  const json = JSON.stringify(exported, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "choreographies.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Known step fields that are NOT extra params. */
const KNOWN_STEP_FIELDS = new Set([
  "action", "entity", "target", "duration", "easing", "steps",
]);

/** Convert a raw JSON step to editor format. */
function stepFromImport(raw: Record<string, unknown>): ChoreographyStepDef {
  const action = String(raw["action"] ?? "move");
  const params: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!KNOWN_STEP_FIELDS.has(k) && v !== undefined) params[k] = v;
  }

  const step: ChoreographyStepDef = {
    id: generateId(),
    action,
    params,
  };

  if (typeof raw["entity"] === "string") step.entity = raw["entity"];
  if (typeof raw["target"] === "string") step.target = raw["target"];
  if (typeof raw["duration"] === "number") step.duration = raw["duration"];
  if (typeof raw["easing"] === "string") step.easing = raw["easing"];

  // Nested steps → children
  if (Array.isArray(raw["steps"])) {
    step.children = (raw["steps"] as Record<string, unknown>[]).map(stepFromImport);
  }

  return step;
}

/** Import choreographies from JSON file. */
function importChoreographies(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as unknown;
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const choreographies: ChoreographyDef[] = (arr as Record<string, unknown>[])
          .filter((d) => typeof d["on"] === "string")
          .map((d) => ({
            id: generateId(),
            on: String(d["on"]),
            when: d["when"] as WhenClauseDef | undefined,
            interrupts: Boolean(d["interrupts"]),
            steps: Array.isArray(d["steps"])
              ? (d["steps"] as Record<string, unknown>[]).map(stepFromImport)
              : [],
          }));
        updateChoreographyState({
          choreographies,
          selectedChoreographyId: null,
          selectedStepId: null,
        });
      } catch {
        console.warn("[choreography-view] Failed to parse choreography JSON");
      }
    };
    reader.readAsText(file);
  });
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

// ---------------------------------------------------------------------------
// Render: Sidebar
// ---------------------------------------------------------------------------

function renderSidebar(): HTMLElement {
  const sidebar = document.createElement("div");
  sidebar.className = "ch-sidebar";

  // ── Choreography list section ──
  const listSection = document.createElement("div");
  listSection.className = "ch-section";

  const listTitle = document.createElement("div");
  listTitle.className = "ch-section-title";
  listTitle.textContent = "Choreographies";
  listSection.appendChild(listTitle);

  const { choreographies, selectedChoreographyId } = getChoreographyState();

  if (choreographies.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ch-empty";
    empty.textContent = "No choreographies yet.";
    listSection.appendChild(empty);
  } else {
    const list = document.createElement("div");
    list.className = "ch-choreo-list";

    for (const choreo of choreographies) {
      const item = document.createElement("div");
      item.className = "ch-choreo-item" + (choreo.id === selectedChoreographyId ? " ch-choreo-item--selected" : "");

      // Signal type badge
      const badge = document.createElement("span");
      badge.className = "ch-choreo-badge";
      const color = SIGNAL_TYPE_COLORS[choreo.on] ?? "#888899";
      badge.style.background = color + "22";
      badge.style.color = color;
      badge.textContent = choreo.on;
      item.appendChild(badge);

      // Summary / indicators
      const info = document.createElement("span");
      info.className = "ch-choreo-info";
      const parts: string[] = [];
      if (choreo.interrupts) parts.push("interrupts");
      const whenSummary = summarizeWhen(choreo.when);
      if (whenSummary) parts.push(whenSummary);
      if (parts.length === 0) parts.push(`${choreo.steps.length} steps`);
      info.textContent = parts.join(" · ");
      item.appendChild(info);

      // Delete button
      const delBtn = document.createElement("button");
      delBtn.className = "ch-choreo-del";
      delBtn.innerHTML = ICON_TRASH;
      delBtn.title = "Delete choreography";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeChoreographyCmd(choreo.id);
      });
      item.appendChild(delBtn);

      // Select on click
      item.addEventListener("click", () => {
        selectChoreography(choreo.id === selectedChoreographyId ? null : choreo.id);
      });

      list.appendChild(item);
    }
    listSection.appendChild(list);
  }

  // Add button
  const addBtn = document.createElement("button");
  addBtn.className = "ch-add-btn";
  addBtn.innerHTML = `${ICON_PLUS} <span>Add Choreography</span>`;
  addBtn.addEventListener("click", () => {
    addChoreographyCmd({
      id: generateId(),
      on: "task_dispatch",
      interrupts: false,
      steps: [],
    });
  });
  listSection.appendChild(addBtn);
  sidebar.appendChild(listSection);

  // ── Import / Export section ──
  const ioSection = document.createElement("div");
  ioSection.className = "ch-section";

  const ioTitle = document.createElement("div");
  ioTitle.className = "ch-section-title";
  ioTitle.textContent = "Import / Export";
  ioSection.appendChild(ioTitle);

  const ioRow = document.createElement("div");
  ioRow.className = "ch-io-row";

  const importBtn = document.createElement("button");
  importBtn.className = "ch-io-btn";
  importBtn.textContent = "Import";
  importBtn.addEventListener("click", importChoreographies);

  const exportBtn = document.createElement("button");
  exportBtn.className = "ch-io-btn";
  exportBtn.textContent = "Export";
  exportBtn.addEventListener("click", exportChoreographies);

  ioRow.appendChild(importBtn);
  ioRow.appendChild(exportBtn);
  ioSection.appendChild(ioRow);
  sidebar.appendChild(ioSection);

  return sidebar;
}

// ---------------------------------------------------------------------------
// Render: Header (on / interrupts / when)
// ---------------------------------------------------------------------------

function renderHeader(choreo: ChoreographyDef): HTMLElement {
  const header = document.createElement("div");
  header.className = "ch-header";

  // ── Signal type (on) ──
  const onRow = document.createElement("div");
  onRow.className = "ch-header-row";

  const onLabel = document.createElement("span");
  onLabel.className = "ch-header-label";
  onLabel.textContent = "on";
  onRow.appendChild(onLabel);

  const onSelect = document.createElement("select");
  onSelect.className = "ch-header-select";
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
  header.appendChild(onRow);

  // ── Interrupts ──
  const intRow = document.createElement("div");
  intRow.className = "ch-header-row";

  const intLabel = document.createElement("span");
  intLabel.className = "ch-header-label";
  intLabel.textContent = "interrupts";
  intRow.appendChild(intLabel);

  const intCb = document.createElement("input");
  intCb.type = "checkbox";
  intCb.className = "ch-header-checkbox";
  intCb.checked = choreo.interrupts;
  intCb.addEventListener("change", () => {
    updateChoreographyCmd(choreo.id, { interrupts: intCb.checked });
  });
  intRow.appendChild(intCb);
  header.appendChild(intRow);

  // ── When clause ──
  header.appendChild(renderWhenEditor(choreo));

  return header;
}

// ---------------------------------------------------------------------------
// Render: When clause editor
// ---------------------------------------------------------------------------

function renderWhenEditor(choreo: ChoreographyDef): HTMLElement {
  const section = document.createElement("div");
  section.className = "ch-when-section";

  const title = document.createElement("div");
  title.className = "ch-when-title";
  title.textContent = "when";

  const indicator = document.createElement("span");
  indicator.className = "ch-when-indicator";
  const summary = summarizeWhen(choreo.when);
  indicator.textContent = summary || "—";
  title.appendChild(indicator);
  section.appendChild(title);

  // Determine current conditions (normalize to single object for V1 editor)
  const isArrayMode = Array.isArray(choreo.when);
  const condition: WhenConditionDef = isArrayMode
    ? {}
    : (choreo.when as WhenConditionDef | undefined) ?? {};

  // If in array mode, show JSON textarea instead
  if (isArrayMode) {
    const note = document.createElement("div");
    note.className = "ch-when-note";
    note.textContent = "OR mode — edit as JSON:";
    section.appendChild(note);

    const textarea = document.createElement("textarea");
    textarea.className = "ch-when-json";
    textarea.value = JSON.stringify(choreo.when, null, 2);
    textarea.spellcheck = false;
    textarea.rows = 4;

    const applyJsonBtn = document.createElement("button");
    applyJsonBtn.className = "ch-when-apply";
    applyJsonBtn.textContent = "Apply JSON";
    applyJsonBtn.addEventListener("click", () => {
      try {
        const parsed = JSON.parse(textarea.value) as WhenClauseDef;
        updateChoreographyCmd(choreo.id, { when: parsed });
      } catch {
        textarea.style.borderColor = "var(--color-error)";
      }
    });
    section.appendChild(textarea);
    section.appendChild(applyJsonBtn);
    return section;
  }

  // AND mode: one row per path
  const conditionContainer = document.createElement("div");
  conditionContainer.className = "ch-when-conditions";

  const entries = Object.entries(condition);
  for (const [path, operator] of entries) {
    conditionContainer.appendChild(renderWhenRow(choreo.id, condition, path, operator));
  }
  section.appendChild(conditionContainer);

  // Add condition button
  const addCondBtn = document.createElement("button");
  addCondBtn.className = "ch-when-add";
  addCondBtn.innerHTML = `${ICON_PLUS} <span>Add condition</span>`;
  addCondBtn.addEventListener("click", () => {
    const newCondition = { ...condition, [`signal.`]: { contains: "" } };
    updateChoreographyCmd(choreo.id, {
      when: Object.keys(newCondition).length > 0 ? newCondition : undefined,
    });
  });
  section.appendChild(addCondBtn);

  // Clear when button (if any conditions exist)
  if (entries.length > 0) {
    const clearBtn = document.createElement("button");
    clearBtn.className = "ch-when-clear";
    clearBtn.textContent = "Clear all";
    clearBtn.addEventListener("click", () => {
      updateChoreographyCmd(choreo.id, { when: undefined });
    });
    section.appendChild(clearBtn);
  }

  return section;
}

/** Render a single when condition row: [path] [operator ▼] [value] [✕]. */
function renderWhenRow(
  choreoId: string,
  condition: WhenConditionDef,
  path: string,
  operator: WhenOperatorDef,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "ch-when-row";

  // Path input
  const pathInput = document.createElement("input");
  pathInput.type = "text";
  pathInput.className = "ch-when-path";
  pathInput.value = path;
  pathInput.placeholder = "signal.content";

  // Operator dropdown
  const opSelect = document.createElement("select");
  opSelect.className = "ch-when-operator";
  const currentOp = Object.keys(operator).filter((k) => k !== "not")[0] ?? "contains";
  for (const op of OPERATOR_NAMES) {
    const opt = document.createElement("option");
    opt.value = op;
    opt.textContent = op;
    if (op === currentOp) opt.selected = true;
    opSelect.appendChild(opt);
  }

  // Value input
  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.className = "ch-when-value";
  const currentValue = operator[currentOp as keyof WhenOperatorDef];
  valueInput.value = currentValue !== undefined ? String(currentValue) : "";
  valueInput.placeholder = "value";
  if (currentOp === "exists") {
    valueInput.value = String(operator.exists ?? true);
    valueInput.placeholder = "true/false";
  }

  // Apply changes on blur/change
  const applyCondition = (): void => {
    const newPath = pathInput.value.trim();
    const op = opSelect.value;
    if (!newPath) return;

    // Build new operator
    const newOp: WhenOperatorDef = {};
    const val = valueInput.value;
    switch (op) {
      case "equals": newOp.equals = val; break;
      case "contains": newOp.contains = val; break;
      case "matches": newOp.matches = val; break;
      case "gt": newOp.gt = Number(val) || 0; break;
      case "lt": newOp.lt = Number(val) || 0; break;
      case "exists": newOp.exists = val !== "false"; break;
    }

    // Build new condition (remove old path if it changed)
    const newCondition = { ...condition };
    if (newPath !== path) delete newCondition[path];
    newCondition[newPath] = newOp;

    updateChoreographyCmd(choreoId, {
      when: Object.keys(newCondition).length > 0 ? newCondition : undefined,
    });
  };

  pathInput.addEventListener("change", applyCondition);
  opSelect.addEventListener("change", applyCondition);
  valueInput.addEventListener("change", applyCondition);

  // Delete button
  const delBtn = document.createElement("button");
  delBtn.className = "ch-when-del";
  delBtn.innerHTML = ICON_X;
  delBtn.title = "Remove condition";
  delBtn.addEventListener("click", () => {
    const newCondition = { ...condition };
    delete newCondition[path];
    updateChoreographyCmd(choreoId, {
      when: Object.keys(newCondition).length > 0 ? newCondition : undefined,
    });
  });

  row.appendChild(pathInput);
  row.appendChild(opSelect);
  row.appendChild(valueInput);
  row.appendChild(delBtn);
  return row;
}

// ---------------------------------------------------------------------------
// Render: Step list
// ---------------------------------------------------------------------------

function renderStepList(choreo: ChoreographyDef): HTMLElement {
  const container = document.createElement("div");
  container.className = "ch-steps-section";

  const title = document.createElement("div");
  title.className = "ch-section-title";
  title.textContent = "Steps";
  container.appendChild(title);

  const list = document.createElement("div");
  list.className = "ch-steps";

  if (choreo.steps.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ch-empty";
    empty.textContent = "No steps yet.";
    list.appendChild(empty);
  } else {
    renderStepRows(list, choreo.id, choreo.steps, 0);
  }
  container.appendChild(list);

  // Footer: add step buttons
  const footer = document.createElement("div");
  footer.className = "ch-steps-footer";

  const addActionBtn = document.createElement("button");
  addActionBtn.className = "ch-add-btn";
  addActionBtn.innerHTML = `${ICON_PLUS} <span>Action</span>`;
  addActionBtn.addEventListener("click", () => {
    addStepCmd(choreo.id, createDefaultStep(lastUsedAction));
  });

  const addGroupBtn = document.createElement("button");
  addGroupBtn.className = "ch-add-btn ch-add-btn--group";
  addGroupBtn.innerHTML = `${ICON_PLUS} <span>Group</span>`;
  addGroupBtn.addEventListener("click", () => {
    // Show dropdown for structural type
    const sel = document.createElement("select");
    sel.className = "ch-inline-select";
    for (const sa of STRUCTURAL_ACTIONS) {
      const opt = document.createElement("option");
      opt.value = sa;
      opt.textContent = sa;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => {
      addStepCmd(choreo.id, createDefaultStep(sel.value));
      sel.remove();
    });
    addGroupBtn.after(sel);
    sel.focus();
    sel.addEventListener("blur", () => sel.remove());
  });

  footer.appendChild(addActionBtn);
  footer.appendChild(addGroupBtn);
  container.appendChild(footer);

  return container;
}

/** Track last-used action type for convenience. */
let lastUsedAction = "move";

/** Counter for step numbering across nesting levels. */
let stepCounter = 0;

/** Render step rows recursively. */
function renderStepRows(
  container: HTMLElement,
  choreoId: string,
  steps: ChoreographyStepDef[],
  depth: number,
): void {
  const { selectedStepId } = getChoreographyState();

  for (const step of steps) {
    stepCounter++;
    const row = document.createElement("div");
    row.className = "ch-step" +
      (step.id === selectedStepId ? " ch-step--selected" : "") +
      (depth > 0 ? " ch-step--child" : "");

    if (depth > 0) {
      row.style.paddingLeft = `${12 + depth * 24}px`;
    }

    // Step number
    const num = document.createElement("span");
    num.className = "ch-step-num";
    num.textContent = String(stepCounter);
    row.appendChild(num);

    // Action badge
    const badge = document.createElement("span");
    badge.className = "ch-step-badge";
    const color = ACTION_COLORS[step.action] ?? "#888899";
    badge.style.background = color + "22";
    badge.style.color = color;
    badge.textContent = step.action;
    row.appendChild(badge);

    // Summary
    const summary = document.createElement("span");
    summary.className = "ch-step-summary";
    summary.textContent = summarizeStep(step);
    row.appendChild(summary);

    // Actions
    const actions = document.createElement("span");
    actions.className = "ch-step-actions";

    const upBtn = document.createElement("button");
    upBtn.className = "ch-step-action-btn";
    upBtn.innerHTML = ICON_CHEVRON_UP;
    upBtn.title = "Move up";
    upBtn.addEventListener("click", (e) => { e.stopPropagation(); moveStepCmd(choreoId, step.id, -1); });

    const downBtn = document.createElement("button");
    downBtn.className = "ch-step-action-btn";
    downBtn.innerHTML = ICON_CHEVRON_DOWN;
    downBtn.title = "Move down";
    downBtn.addEventListener("click", (e) => { e.stopPropagation(); moveStepCmd(choreoId, step.id, 1); });

    const delBtn = document.createElement("button");
    delBtn.className = "ch-step-action-btn ch-step-action-btn--danger";
    delBtn.innerHTML = ICON_TRASH;
    delBtn.title = "Delete step";
    delBtn.addEventListener("click", (e) => { e.stopPropagation(); removeStepCmd(choreoId, step.id); });

    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(delBtn);
    row.appendChild(actions);

    // Select on click
    row.addEventListener("click", () => {
      selectChoreographyStep(step.id === selectedStepId ? null : step.id);
    });

    container.appendChild(row);

    // Structural: add child step button + render children
    if (STRUCTURAL_ACTIONS.includes(step.action) && step.children) {
      // Render children
      if (step.children.length > 0) {
        renderStepRows(container, choreoId, step.children, depth + 1);
      }

      // Add child button
      const addChildBtn = document.createElement("button");
      addChildBtn.className = "ch-add-child-btn";
      addChildBtn.style.paddingLeft = `${12 + (depth + 1) * 24}px`;
      addChildBtn.innerHTML = `${ICON_PLUS} <span>Add to ${step.action}</span>`;
      addChildBtn.addEventListener("click", () => {
        addStepCmd(choreoId, createDefaultStep("move"), step.id);
      });
      container.appendChild(addChildBtn);
    }
  }
}

// ---------------------------------------------------------------------------
// Render: Step detail (ISF declarative inputs)
// ---------------------------------------------------------------------------

function renderStepDetail(choreo: ChoreographyDef): HTMLElement | null {
  const { selectedStepId } = getChoreographyState();
  if (!selectedStepId) return null;

  const allSteps = flattenSteps(choreo.steps);
  const step = allSteps.find((s) => s.id === selectedStepId);
  if (!step) return null;

  lastUsedAction = STRUCTURAL_ACTIONS.includes(step.action) ? "move" : step.action;

  const detail = document.createElement("div");
  detail.className = "ch-detail";

  const detailTitle = document.createElement("div");
  detailTitle.className = "ch-section-title";
  detailTitle.textContent = "Detail";
  detail.appendChild(detailTitle);

  // Action dropdown (always shown)
  const actionSelect = document.createElement("select");
  actionSelect.className = "ch-detail-select";
  for (const a of ACTION_TYPES) {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    if (a === step.action) opt.selected = true;
    actionSelect.appendChild(opt);
  }
  detail.appendChild(detailRow("action", actionSelect));

  // Pending changes accumulator — ISF controls write here on change
  const pendingUpdates: Partial<ChoreographyStepDef> = {};
  const pendingParams: Record<string, unknown> = { ...step.params };

  /** Handle changes from common ISF controls (entity, duration, easing). */
  const onCommonChange: OnInputChange = (key, value) => {
    if (key === "entity") pendingUpdates.entity = value ? String(value) : undefined;
    else if (key === "target") pendingUpdates.target = value ? String(value) : undefined;
    else if (key === "duration") pendingUpdates.duration = typeof value === "number" ? value : undefined;
    else if (key === "easing") pendingUpdates.easing = value ? String(value) : undefined;
  };

  /** Handle changes from param ISF controls. */
  const onParamChange: OnInputChange = (key, value) => {
    if (value !== undefined && value !== "") {
      pendingParams[key] = value;
    } else {
      delete pendingParams[key];
    }
  };

  // Get ISF schema for this action
  const schema = getActionSchema(step.action);

  if (schema) {
    // ISF mode — auto-generate controls from schema

    // Common inputs (entity, duration, easing)
    for (const decl of schema.common) {
      // Resolve current value from the step
      let currentValue: unknown;
      if (decl.key === "entity") currentValue = step.entity;
      else if (decl.key === "target") currentValue = step.target;
      else if (decl.key === "duration") currentValue = step.duration;
      else if (decl.key === "easing") currentValue = step.easing;

      const control = createInputControl(decl, currentValue, onCommonChange);
      detail.appendChild(control);
    }

    // Action-specific param inputs
    if (schema.params.length > 0) {
      const paramTitle = document.createElement("div");
      paramTitle.className = "ch-section-subtitle";
      paramTitle.textContent = "Parameters";
      detail.appendChild(paramTitle);

      for (const decl of schema.params) {
        const currentValue = step.params[decl.key];
        const control = createInputControl(decl, currentValue, onParamChange);
        detail.appendChild(control);
      }
    }
  } else {
    // Fallback: unknown action — raw JSON editor for params
    const fallbackTitle = document.createElement("div");
    fallbackTitle.className = "ch-section-subtitle";
    fallbackTitle.textContent = "Parameters (JSON)";
    detail.appendChild(fallbackTitle);

    const textarea = document.createElement("textarea");
    textarea.className = "isf-json";
    textarea.rows = 5;
    textarea.value = JSON.stringify(step.params, null, 2);
    textarea.addEventListener("change", () => {
      try {
        const parsed = JSON.parse(textarea.value) as Record<string, unknown>;
        Object.assign(pendingParams, parsed);
        textarea.classList.remove("isf-json--error");
      } catch {
        textarea.classList.add("isf-json--error");
      }
    });
    detail.appendChild(textarea);
  }

  // Apply button
  const applyBtn = document.createElement("button");
  applyBtn.className = "ch-apply-btn";
  applyBtn.textContent = "Apply";
  applyBtn.addEventListener("click", () => {
    const newAction = actionSelect.value;
    const updates: Partial<ChoreographyStepDef> = {
      action: newAction,
      ...pendingUpdates,
      params: { ...pendingParams },
    };

    // If action type changed to structural, add children
    if (STRUCTURAL_ACTIONS.includes(newAction) && !step.children) {
      updates.children = [];
    }
    // If action type changed from structural, remove children
    if (!STRUCTURAL_ACTIONS.includes(newAction) && step.children) {
      updates.children = undefined;
    }

    updateStepCmd(choreo.id, step.id, updates);
  });
  detail.appendChild(applyBtn);

  return detail;
}

/** Create a labeled row for the detail editor. */
function detailRow(label: string, input: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "ch-detail-row";

  const lbl = document.createElement("span");
  lbl.className = "ch-detail-label";
  lbl.textContent = label;

  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}

// ---------------------------------------------------------------------------
// Render: Main area
// ---------------------------------------------------------------------------

function renderMain(): HTMLElement {
  const main = document.createElement("div");
  main.className = "ch-main";

  const choreo = getSelectedChoreography();

  if (!choreo) {
    const empty = document.createElement("div");
    empty.className = "ch-main-empty";
    empty.textContent = "Select a choreography to edit";
    main.appendChild(empty);
    return main;
  }

  // Header (on, interrupts, when)
  main.appendChild(renderHeader(choreo));

  // Separator
  const sep = document.createElement("div");
  sep.className = "ch-separator";
  main.appendChild(sep);

  // Step list
  stepCounter = 0;
  main.appendChild(renderStepList(choreo));

  // Step detail (if a step is selected)
  const detail = renderStepDetail(choreo);
  if (detail) {
    const sep2 = document.createElement("div");
    sep2.className = "ch-separator";
    main.appendChild(sep2);
    main.appendChild(detail);
  }

  return main;
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

let viewEl: HTMLElement | null = null;

function render(): void {
  if (!viewEl) return;
  viewEl.innerHTML = "";
  viewEl.appendChild(renderSidebar());
  viewEl.appendChild(renderMain());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let initialized = false;

/** Initialize the Choreography view (Orchestrator tab). Idempotent. */
export function initChoreographyView(): void {
  if (initialized) return;
  initialized = true;

  viewEl = document.getElementById("zone-choreographer");
  if (!viewEl) return;

  render();
  subscribeChoreography(render);
}
