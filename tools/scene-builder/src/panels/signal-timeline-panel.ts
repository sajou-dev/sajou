/**
 * Signal Timeline panel.
 *
 * Visual editor for composing signal scenarios (timelines of SignalTimelineStep).
 * Output is compatible with the @sajou/emitter Scenario format.
 *
 * Layout: toolbar (name + import/export) → timeline list → detail editor → footer.
 */

import {
  getSignalTimelineState,
  updateSignalTimelineState,
  setSignalTimelineState,
  selectTimelineStep,
  subscribeSignalTimeline,
} from "../state/signal-timeline-state.js";
import { executeCommand } from "../state/undo.js";
import type {
  SignalType,
  SignalPayloadMap,
  SignalTimelineStep,
  AgentState,
  ErrorSeverity,
  UndoableCommand,
} from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All signal types for the type dropdown. */
const ALL_SIGNAL_TYPES: SignalType[] = [
  "task_dispatch",
  "tool_call",
  "tool_result",
  "token_usage",
  "agent_state_change",
  "error",
  "completion",
];

/** Agent lifecycle states for dropdowns. */
const AGENT_STATES: AgentState[] = ["idle", "thinking", "acting", "waiting", "done", "error"];

/** Error severity levels for dropdown. */
const ERROR_SEVERITIES: ErrorSeverity[] = ["warning", "error", "critical"];

/** Signal type badge colors (Ember palette + complements). */
const SIGNAL_TYPE_COLORS: Record<SignalType, string> = {
  task_dispatch: "#E8A851",
  tool_call: "#5B8DEF",
  tool_result: "#4EC9B0",
  token_usage: "#C586C0",
  agent_state_change: "#6A9955",
  error: "#F44747",
  completion: "#4EC9B0",
  event: "#8E8EA0",
};

/** Correlation ID → color palette (cycled via hash). */
const CORRELATION_COLORS = ["#E8A851", "#5B8DEF", "#4EC9B0", "#C586C0", "#6A9955", "#F44747"];

// ---------------------------------------------------------------------------
// Lucide SVG helpers
// ---------------------------------------------------------------------------

function lucide(inner: string, size = 12): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

const ICON_CHEVRON_UP = lucide('<path d="m18 15-6-6-6 6"/>');
const ICON_CHEVRON_DOWN = lucide('<path d="m6 9 6 6 6-6"/>');
const ICON_TRASH = lucide('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>');

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Generate a unique step ID. */
function generateStepId(): string {
  return "step-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

// ---------------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------------

/** Create a default payload for a given signal type. */
function createDefaultPayload(type: SignalType): SignalPayloadMap[SignalType] {
  switch (type) {
    case "task_dispatch":
      return { taskId: "task-001", from: "orchestrator", to: "agent-1", description: "" };
    case "tool_call":
      return { toolName: "web_search", agentId: "agent-1" };
    case "tool_result":
      return { toolName: "web_search", agentId: "agent-1", success: true };
    case "token_usage":
      return { agentId: "agent-1", promptTokens: 500, completionTokens: 200 };
    case "agent_state_change":
      return { agentId: "agent-1", from: "idle", to: "thinking" };
    case "error":
      return { message: "Something went wrong", severity: "error" };
    case "completion":
      return { taskId: "task-001", success: true };
    case "event":
      return {};
  }
}

/** Derive a short summary string from a step's payload. */
function summarizePayload(type: SignalType, payload: SignalPayloadMap[SignalType]): string {
  // Use `as Record` for defensive access — captured payloads may not match the typed shape
  const raw = payload as Record<string, unknown>;
  switch (type) {
    case "task_dispatch": {
      const p = payload as SignalPayloadMap["task_dispatch"];
      if (p.from && p.to) return `${p.from} → ${p.to}`;
      // Fallback for OpenAI-format payloads
      const model = raw["model"] ?? "";
      const desc = raw["description"] ?? "";
      return model ? `[${model}] ${desc}` : String(desc);
    }
    case "tool_call": {
      const p = payload as SignalPayloadMap["tool_call"];
      return `${p.toolName} (${p.agentId})`;
    }
    case "tool_result": {
      const p = payload as SignalPayloadMap["tool_result"];
      return `${p.toolName} ${p.success ? "✓" : "✗"}`;
    }
    case "token_usage": {
      const p = payload as SignalPayloadMap["token_usage"];
      const total = p.promptTokens + p.completionTokens;
      if (!isNaN(total)) return `${total} tokens`;
      // Fallback for OpenAI-format payloads with content field
      const content = raw["content"];
      if (content !== undefined) return String(content);
      return "? tokens";
    }
    case "agent_state_change": {
      const p = payload as SignalPayloadMap["agent_state_change"];
      return `${p.agentId}: ${p.from} → ${p.to}`;
    }
    case "error": {
      const p = payload as SignalPayloadMap["error"];
      if (!p.message) return String(raw["message"] ?? "error");
      return p.message.length > 30 ? p.message.slice(0, 28) + "…" : p.message;
    }
    case "completion": {
      const p = payload as SignalPayloadMap["completion"];
      const icon = p.success ? "✓" : "✗";
      if (p.taskId) return `${p.taskId} ${icon}`;
      // Fallback for OpenAI-format payloads
      const tokens = raw["totalTokens"];
      const reason = raw["finishReason"];
      if (tokens !== undefined) return `${icon} ${tokens} tokens (${reason ?? "done"})`;
      return icon;
    }
    case "event":
      return JSON.stringify(payload).slice(0, 60);
  }
}

/** Derive a color from a correlation ID via simple hash. */
function correlationColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return CORRELATION_COLORS[Math.abs(hash) % CORRELATION_COLORS.length]!;
}

// ---------------------------------------------------------------------------
// Undo command helpers
// ---------------------------------------------------------------------------

/** Add a step and select it. */
function addStepCommand(step: SignalTimelineStep): void {
  const cmd: UndoableCommand = {
    execute() {
      const { steps } = getSignalTimelineState();
      updateSignalTimelineState({ steps: [...steps, step], selectedStepId: step.id });
    },
    undo() {
      const { steps } = getSignalTimelineState();
      updateSignalTimelineState({ steps: steps.filter((s) => s.id !== step.id), selectedStepId: null });
    },
    description: `Add ${step.type} step`,
  };
  executeCommand(cmd);
}

/** Remove a step and deselect. */
function removeStepCommand(stepId: string): void {
  const { steps } = getSignalTimelineState();
  const snapshot = steps.map((s) => ({ ...s }));
  const cmd: UndoableCommand = {
    execute() {
      const cur = getSignalTimelineState().steps;
      updateSignalTimelineState({ steps: cur.filter((s) => s.id !== stepId), selectedStepId: null });
    },
    undo() {
      updateSignalTimelineState({ steps: snapshot });
    },
    description: "Remove timeline step",
  };
  executeCommand(cmd);
}

/** Swap a step with its neighbor. direction: -1 = up, +1 = down. */
function moveStepCommand(stepId: string, direction: -1 | 1): void {
  const { steps } = getSignalTimelineState();
  const idx = steps.findIndex((s) => s.id === stepId);
  const swapIdx = idx + direction;
  if (idx < 0 || swapIdx < 0 || swapIdx >= steps.length) return;
  const snapshot = [...steps];
  const reordered = [...steps];
  const tmp = reordered[idx]!;
  reordered[idx] = reordered[swapIdx]!;
  reordered[swapIdx] = tmp;
  const cmd: UndoableCommand = {
    execute() { updateSignalTimelineState({ steps: reordered }); },
    undo() { updateSignalTimelineState({ steps: snapshot }); },
    description: "Reorder timeline step",
  };
  executeCommand(cmd);
}

/** Update one or more properties of a step. */
function updateStepCommand(stepId: string, updates: Partial<SignalTimelineStep>): void {
  const { steps } = getSignalTimelineState();
  const snapshot = steps.map((s) => ({ ...s }));
  const updated = steps.map((s) => (s.id === stepId ? { ...s, ...updates } : s));
  const cmd: UndoableCommand = {
    execute() { updateSignalTimelineState({ steps: updated }); },
    undo() { updateSignalTimelineState({ steps: snapshot }); },
    description: "Update timeline step",
  };
  executeCommand(cmd);
}

// ---------------------------------------------------------------------------
// Import / Export
// ---------------------------------------------------------------------------

/** Export the current timeline as a JSON file (Scenario format). */
function exportScenarioJson(): void {
  const { name, description, steps } = getSignalTimelineState();
  const exported = {
    name,
    description,
    steps: steps.map((s) => {
      const out: Record<string, unknown> = {
        delayMs: s.delayMs,
        type: s.type,
        payload: s.payload,
      };
      if (s.correlationId) out["correlationId"] = s.correlationId;
      return out;
    }),
  };
  const json = JSON.stringify(exported, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name || "scenario"}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Import a Scenario JSON file via file picker. */
function importScenarioJson(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as Record<string, unknown>;
        if (!Array.isArray(parsed["steps"])) return;
        const rawSteps = parsed["steps"] as Array<Record<string, unknown>>;
        const steps: SignalTimelineStep[] = rawSteps
          .filter((s) => typeof s["type"] === "string" && typeof s["delayMs"] === "number")
          .map((s) => ({
            id: generateStepId(),
            delayMs: s["delayMs"] as number,
            type: s["type"] as SignalType,
            payload: (s["payload"] ?? {}) as SignalPayloadMap[SignalType],
            correlationId: typeof s["correlationId"] === "string" ? s["correlationId"] : undefined,
          }));
        setSignalTimelineState({
          name: typeof parsed["name"] === "string" ? parsed["name"] : "imported",
          description: typeof parsed["description"] === "string" ? parsed["description"] : "",
          steps,
          selectedStepId: null,
        });
      } catch {
        console.warn("[signal-timeline] Failed to parse scenario JSON");
      }
    };
    reader.readAsText(file);
  });
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

// ---------------------------------------------------------------------------
// Render: Toolbar
// ---------------------------------------------------------------------------

function renderToolbar(): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "st-toolbar";

  const { name } = getSignalTimelineState();

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "st-name-input";
  nameInput.value = name;
  nameInput.placeholder = "Scenario name…";
  nameInput.addEventListener("change", () => {
    updateSignalTimelineState({ name: nameInput.value.trim() || "untitled-scenario" });
  });

  const importBtn = document.createElement("button");
  importBtn.className = "st-toolbar-btn";
  importBtn.textContent = "Import";
  importBtn.title = "Import scenario JSON";
  importBtn.addEventListener("click", importScenarioJson);

  const exportBtn = document.createElement("button");
  exportBtn.className = "st-toolbar-btn";
  exportBtn.textContent = "Export";
  exportBtn.title = "Export scenario JSON";
  exportBtn.addEventListener("click", exportScenarioJson);

  bar.appendChild(nameInput);
  bar.appendChild(importBtn);
  bar.appendChild(exportBtn);
  return bar;
}

// ---------------------------------------------------------------------------
// Render: Step row
// ---------------------------------------------------------------------------

function renderStepRow(step: SignalTimelineStep, index: number, isSelected: boolean): HTMLElement {
  const row = document.createElement("div");
  row.className = "st-step" + (isSelected ? " st-step--selected" : "");

  // Correlation left-border color
  if (step.correlationId) {
    row.style.borderLeft = `3px solid ${correlationColor(step.correlationId)}`;
  }

  // Step number
  const num = document.createElement("span");
  num.className = "st-step-num";
  num.textContent = String(index + 1);

  // Type badge
  const badge = document.createElement("span");
  badge.className = "st-step-badge";
  const color = SIGNAL_TYPE_COLORS[step.type];
  badge.style.background = color + "22";
  badge.style.color = color;
  badge.textContent = step.type;

  // Summary
  const summary = document.createElement("span");
  summary.className = "st-step-summary";
  summary.textContent = summarizePayload(step.type, step.payload);

  // Delay
  const delay = document.createElement("span");
  delay.className = "st-step-delay";
  delay.textContent = `+${step.delayMs}ms`;

  // Actions
  const actions = document.createElement("span");
  actions.className = "st-step-actions";

  const upBtn = document.createElement("button");
  upBtn.className = "st-step-action-btn";
  upBtn.innerHTML = ICON_CHEVRON_UP;
  upBtn.title = "Move up";
  upBtn.addEventListener("click", (e) => { e.stopPropagation(); moveStepCommand(step.id, -1); });

  const downBtn = document.createElement("button");
  downBtn.className = "st-step-action-btn";
  downBtn.innerHTML = ICON_CHEVRON_DOWN;
  downBtn.title = "Move down";
  downBtn.addEventListener("click", (e) => { e.stopPropagation(); moveStepCommand(step.id, 1); });

  const delBtn = document.createElement("button");
  delBtn.className = "st-step-action-btn st-step-action-btn--danger";
  delBtn.innerHTML = ICON_TRASH;
  delBtn.title = "Delete step";
  delBtn.addEventListener("click", (e) => { e.stopPropagation(); removeStepCommand(step.id); });

  actions.appendChild(upBtn);
  actions.appendChild(downBtn);
  actions.appendChild(delBtn);

  row.appendChild(num);
  row.appendChild(badge);
  row.appendChild(summary);
  row.appendChild(delay);
  row.appendChild(actions);

  // Click → select
  row.addEventListener("click", () => {
    selectTimelineStep(isSelected ? null : step.id);
  });

  return row;
}

// ---------------------------------------------------------------------------
// Render: Timeline
// ---------------------------------------------------------------------------

function renderTimeline(): HTMLElement {
  const container = document.createElement("div");
  container.className = "st-timeline";

  const { steps, selectedStepId } = getSignalTimelineState();

  if (steps.length === 0) {
    const empty = document.createElement("div");
    empty.className = "st-empty";
    empty.textContent = "No steps yet. Click + Add Step to begin.";
    container.appendChild(empty);
    return container;
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    container.appendChild(renderStepRow(step, i, step.id === selectedStepId));
  }

  return container;
}

// ---------------------------------------------------------------------------
// Render: Detail editor
// ---------------------------------------------------------------------------

/** Create a labeled row for the detail editor. */
function detailRow(label: string, input: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "st-detail-row";

  const lbl = document.createElement("span");
  lbl.className = "st-detail-label";
  lbl.textContent = label;

  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}

/** Create a text input element. */
function textInput(value: string, cls = "st-detail-input"): HTMLInputElement {
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = cls;
  inp.value = value;
  return inp;
}

/** Create a number input element. */
function numberInput(value: number, cls = "st-detail-input"): HTMLInputElement {
  const inp = document.createElement("input");
  inp.type = "number";
  inp.className = cls;
  inp.value = String(value);
  return inp;
}

/** Create a select dropdown. */
function selectInput(options: string[], selected: string, cls = "st-detail-select"): HTMLSelectElement {
  const sel = document.createElement("select");
  sel.className = cls;
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    if (opt === selected) o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}

/** Create a checkbox. */
function checkboxInput(checked: boolean): HTMLInputElement {
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "st-detail-checkbox";
  cb.checked = checked;
  return cb;
}

/** Create a textarea for JSON. */
function jsonTextarea(value: Record<string, unknown> | undefined): HTMLTextAreaElement {
  const ta = document.createElement("textarea");
  ta.className = "st-detail-textarea";
  ta.value = value ? JSON.stringify(value, null, 2) : "{}";
  ta.spellcheck = false;
  return ta;
}

/** Render the payload-specific form fields and return a collector function. */
function renderPayloadFields(
  type: SignalType,
  payload: SignalPayloadMap[SignalType],
  container: HTMLElement,
): () => SignalPayloadMap[SignalType] {
  switch (type) {
    case "task_dispatch": {
      const p = payload as SignalPayloadMap["task_dispatch"];
      const fTaskId = textInput(p.taskId);
      const fFrom = textInput(p.from);
      const fTo = textInput(p.to);
      const fDesc = textInput(p.description ?? "");
      container.appendChild(detailRow("taskId", fTaskId));
      container.appendChild(detailRow("from", fFrom));
      container.appendChild(detailRow("to", fTo));
      container.appendChild(detailRow("description", fDesc));
      return () => ({
        taskId: fTaskId.value,
        from: fFrom.value,
        to: fTo.value,
        description: fDesc.value || undefined,
      });
    }
    case "tool_call": {
      const p = payload as SignalPayloadMap["tool_call"];
      const fTool = textInput(p.toolName);
      const fAgent = textInput(p.agentId);
      const fCallId = textInput(p.callId ?? "");
      const fInput = jsonTextarea(p.input);
      container.appendChild(detailRow("toolName", fTool));
      container.appendChild(detailRow("agentId", fAgent));
      container.appendChild(detailRow("callId", fCallId));
      container.appendChild(detailRow("input", fInput));
      return () => {
        let inp: Record<string, unknown> | undefined;
        try { inp = JSON.parse(fInput.value) as Record<string, unknown>; } catch { /* keep undefined */ }
        return {
          toolName: fTool.value,
          agentId: fAgent.value,
          callId: fCallId.value || undefined,
          input: inp,
        };
      };
    }
    case "tool_result": {
      const p = payload as SignalPayloadMap["tool_result"];
      const fTool = textInput(p.toolName);
      const fAgent = textInput(p.agentId);
      const fCallId = textInput(p.callId ?? "");
      const fSuccess = checkboxInput(p.success);
      const fOutput = jsonTextarea(p.output);
      container.appendChild(detailRow("toolName", fTool));
      container.appendChild(detailRow("agentId", fAgent));
      container.appendChild(detailRow("callId", fCallId));
      container.appendChild(detailRow("success", fSuccess));
      container.appendChild(detailRow("output", fOutput));
      return () => {
        let out: Record<string, unknown> | undefined;
        try { out = JSON.parse(fOutput.value) as Record<string, unknown>; } catch { /* keep undefined */ }
        return {
          toolName: fTool.value,
          agentId: fAgent.value,
          callId: fCallId.value || undefined,
          success: fSuccess.checked,
          output: out,
        };
      };
    }
    case "token_usage": {
      const p = payload as SignalPayloadMap["token_usage"];
      const fAgent = textInput(p.agentId);
      const fPrompt = numberInput(p.promptTokens);
      const fCompletion = numberInput(p.completionTokens);
      const fModel = textInput(p.model ?? "");
      const fCost = numberInput(p.cost ?? 0);
      container.appendChild(detailRow("agentId", fAgent));
      container.appendChild(detailRow("prompt tok", fPrompt));
      container.appendChild(detailRow("compl tok", fCompletion));
      container.appendChild(detailRow("model", fModel));
      container.appendChild(detailRow("cost", fCost));
      return () => ({
        agentId: fAgent.value,
        promptTokens: Number(fPrompt.value) || 0,
        completionTokens: Number(fCompletion.value) || 0,
        model: fModel.value || undefined,
        cost: Number(fCost.value) || undefined,
      });
    }
    case "agent_state_change": {
      const p = payload as SignalPayloadMap["agent_state_change"];
      const fAgent = textInput(p.agentId);
      const fFrom = selectInput(AGENT_STATES, p.from);
      const fTo = selectInput(AGENT_STATES, p.to);
      const fReason = textInput(p.reason ?? "");
      container.appendChild(detailRow("agentId", fAgent));
      container.appendChild(detailRow("from", fFrom));
      container.appendChild(detailRow("to", fTo));
      container.appendChild(detailRow("reason", fReason));
      return () => ({
        agentId: fAgent.value,
        from: fFrom.value as AgentState,
        to: fTo.value as AgentState,
        reason: fReason.value || undefined,
      });
    }
    case "error": {
      const p = payload as SignalPayloadMap["error"];
      const fAgent = textInput(p.agentId ?? "");
      const fCode = textInput(p.code ?? "");
      const fMsg = textInput(p.message);
      const fSev = selectInput(ERROR_SEVERITIES, p.severity);
      container.appendChild(detailRow("agentId", fAgent));
      container.appendChild(detailRow("code", fCode));
      container.appendChild(detailRow("message", fMsg));
      container.appendChild(detailRow("severity", fSev));
      return () => ({
        agentId: fAgent.value || undefined,
        code: fCode.value || undefined,
        message: fMsg.value,
        severity: fSev.value as ErrorSeverity,
      });
    }
    case "completion": {
      const p = payload as SignalPayloadMap["completion"];
      const fTaskId = textInput(p.taskId);
      const fAgent = textInput(p.agentId ?? "");
      const fSuccess = checkboxInput(p.success);
      const fResult = textInput(p.result ?? "");
      container.appendChild(detailRow("taskId", fTaskId));
      container.appendChild(detailRow("agentId", fAgent));
      container.appendChild(detailRow("success", fSuccess));
      container.appendChild(detailRow("result", fResult));
      return () => ({
        taskId: fTaskId.value,
        agentId: fAgent.value || undefined,
        success: fSuccess.checked,
        result: fResult.value || undefined,
      });
    }
    case "event": {
      const fJson = jsonTextarea(payload);
      container.appendChild(detailRow("payload", fJson));
      return () => {
        try { return JSON.parse(fJson.value) as Record<string, unknown>; } catch { return {}; }
      };
    }
  }
}

/** Render the detail editor for the currently selected step. */
function renderDetail(): HTMLElement | null {
  const { steps, selectedStepId } = getSignalTimelineState();
  if (!selectedStepId) return null;

  const step = steps.find((s) => s.id === selectedStepId);
  if (!step) return null;

  const detail = document.createElement("div");
  detail.className = "st-detail";

  // Signal type dropdown
  const typeSelect = selectInput(ALL_SIGNAL_TYPES, step.type);
  detail.appendChild(detailRow("type", typeSelect));

  // Delay
  const delayInput = numberInput(step.delayMs);
  delayInput.min = "0";
  detail.appendChild(detailRow("delay (ms)", delayInput));

  // Correlation ID
  const corrInput = textInput(step.correlationId ?? "");
  corrInput.placeholder = "optional";
  detail.appendChild(detailRow("correlation", corrInput));

  // Payload section header
  const payloadHeader = document.createElement("div");
  payloadHeader.className = "st-payload-section";
  payloadHeader.textContent = "Payload";
  detail.appendChild(payloadHeader);

  // Payload fields container
  const payloadContainer = document.createElement("div");
  detail.appendChild(payloadContainer);

  // Current payload collector
  let collectPayload = renderPayloadFields(step.type, step.payload, payloadContainer);

  // When type changes → reset payload form
  typeSelect.addEventListener("change", () => {
    const newType = typeSelect.value as SignalType;
    payloadContainer.innerHTML = "";
    const newPayload = createDefaultPayload(newType);
    collectPayload = renderPayloadFields(newType, newPayload, payloadContainer);
  });

  // Apply button
  const applyBtn = document.createElement("button");
  applyBtn.className = "st-apply-btn";
  applyBtn.textContent = "Apply";
  applyBtn.addEventListener("click", () => {
    const newType = typeSelect.value as SignalType;
    const newPayload = collectPayload();
    updateStepCommand(step.id, {
      type: newType,
      delayMs: Math.max(0, Number(delayInput.value) || 0),
      correlationId: corrInput.value.trim() || undefined,
      payload: newPayload,
    });
  });
  detail.appendChild(applyBtn);

  return detail;
}

// ---------------------------------------------------------------------------
// Render: Footer
// ---------------------------------------------------------------------------

/** Track last-used signal type for new steps. */
let lastUsedType: SignalType = "task_dispatch";

function renderFooter(): HTMLElement {
  const footer = document.createElement("div");
  footer.className = "st-footer";

  const addBtn = document.createElement("button");
  addBtn.className = "st-add-btn";
  addBtn.textContent = "+ Add Step";
  addBtn.addEventListener("click", () => {
    const step: SignalTimelineStep = {
      id: generateStepId(),
      delayMs: 100,
      type: lastUsedType,
      payload: createDefaultPayload(lastUsedType),
    };
    addStepCommand(step);
  });

  const { steps } = getSignalTimelineState();
  const totalMs = steps.reduce((sum, s) => sum + s.delayMs, 0);

  const total = document.createElement("span");
  total.className = "st-total";
  total.textContent = `Total: ${(totalMs / 1000).toFixed(1)}s`;

  footer.appendChild(addBtn);
  footer.appendChild(total);
  return footer;
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

let panelEl: HTMLElement | null = null;

function render(): void {
  if (!panelEl) return;
  panelEl.innerHTML = "";

  // Track last-used type for convenience
  const { steps, selectedStepId } = getSignalTimelineState();
  const selected = selectedStepId ? steps.find((s) => s.id === selectedStepId) : null;
  if (selected) lastUsedType = selected.type;

  panelEl.appendChild(renderToolbar());
  panelEl.appendChild(renderTimeline());

  const detail = renderDetail();
  if (detail) panelEl.appendChild(detail);

  panelEl.appendChild(renderFooter());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize the Signal Timeline panel. */
export function initSignalTimelinePanel(contentEl: HTMLElement): void {
  panelEl = contentEl;
  panelEl.classList.add("st-panel");
  render();
  subscribeSignalTimeline(render);
}
