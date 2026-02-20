/**
 * Mapping binding UI.
 *
 * Provides a "bind" button that can be attached to any ISF input control.
 * When bound, the input receives its value from a signal source field
 * transformed through a mapping function.
 *
 * Binding config:
 *   sourceField: "token_usage.completionTokens"
 *   mappingFn: "map"
 *   mappingArgs: [0, 1000, 200, 2000]
 *
 * Usage:
 *   const binding = createMappingBinding(inputKey, currentBinding, onBindChange);
 *   controlContainer.appendChild(binding);
 */

import { getAllMappingFns } from "./mapping-functions.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A binding configuration for a single input. */
export interface InputBinding {
  /** Source signal field path (e.g., "token_usage.completionTokens"). */
  sourceField: string;
  /** Mapping function name (e.g., "map", "lerp", "clamp"). */
  mappingFn: string;
  /** Arguments for the mapping function. */
  mappingArgs: number[];
}

/** Callback when binding changes. */
export type OnBindChange = (key: string, binding: InputBinding | null) => void;

// ---------------------------------------------------------------------------
// Signal field options (common source paths)
// ---------------------------------------------------------------------------

const SIGNAL_FIELDS = [
  { value: "token_usage.promptTokens", label: "token_usage.promptTokens" },
  { value: "token_usage.completionTokens", label: "token_usage.completionTokens" },
  { value: "task_dispatch.taskId", label: "task_dispatch.taskId" },
  { value: "agent_state_change.from", label: "agent_state_change.from" },
  { value: "agent_state_change.to", label: "agent_state_change.to" },
  { value: "error.severity", label: "error.severity" },
  { value: "completion.success", label: "completion.success" },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a mapping binding UI element for an input key.
 *
 * Returns a container with a "bind" toggle + binding config (visible when bound).
 */
export function createMappingBinding(
  inputKey: string,
  currentBinding: InputBinding | null,
  onChange: OnBindChange,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "mapping-binding";

  let bound = currentBinding !== null;
  let binding: InputBinding = currentBinding ?? {
    sourceField: SIGNAL_FIELDS[0].value,
    mappingFn: "map",
    mappingArgs: [0, 100, 0, 1],
  };

  // Bind toggle button
  const bindBtn = document.createElement("button");
  bindBtn.className = `mapping-bind-btn${bound ? " mapping-bind-btn--bound" : ""}`;
  bindBtn.textContent = bound ? "⚡" : "🔗";
  bindBtn.title = bound ? "Unbind this input" : "Bind to signal source";

  // Config panel (hidden by default)
  const configPanel = document.createElement("div");
  configPanel.className = "mapping-config";
  configPanel.hidden = !bound;

  bindBtn.addEventListener("click", () => {
    if (bound) {
      // Unbind
      bound = false;
      bindBtn.className = "mapping-bind-btn";
      bindBtn.textContent = "🔗";
      bindBtn.title = "Bind to signal source";
      configPanel.hidden = true;
      onChange(inputKey, null);
    } else {
      // Bind
      bound = true;
      bindBtn.className = "mapping-bind-btn mapping-bind-btn--bound";
      bindBtn.textContent = "⚡";
      bindBtn.title = "Unbind this input";
      configPanel.hidden = false;
      onChange(inputKey, { ...binding });
    }
  });

  container.appendChild(bindBtn);

  // Source field selector
  const fieldRow = document.createElement("div");
  fieldRow.className = "mapping-row";

  const fieldLabel = document.createElement("span");
  fieldLabel.className = "mapping-label";
  fieldLabel.textContent = "Source";
  fieldRow.appendChild(fieldLabel);

  const fieldSelect = document.createElement("select");
  fieldSelect.className = "mapping-select";
  for (const field of SIGNAL_FIELDS) {
    const opt = document.createElement("option");
    opt.value = field.value;
    opt.textContent = field.label;
    if (field.value === binding.sourceField) opt.selected = true;
    fieldSelect.appendChild(opt);
  }
  fieldSelect.addEventListener("change", () => {
    binding = { ...binding, sourceField: fieldSelect.value };
    if (bound) onChange(inputKey, { ...binding });
  });
  fieldRow.appendChild(fieldSelect);
  configPanel.appendChild(fieldRow);

  // Mapping function selector
  const fnRow = document.createElement("div");
  fnRow.className = "mapping-row";

  const fnLabel = document.createElement("span");
  fnLabel.className = "mapping-label";
  fnLabel.textContent = "Function";
  fnRow.appendChild(fnLabel);

  const fnSelect = document.createElement("select");
  fnSelect.className = "mapping-select";

  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "None (pass-through)";
  fnSelect.appendChild(noneOpt);

  const allFns = getAllMappingFns();
  for (const fnInfo of allFns) {
    const opt = document.createElement("option");
    opt.value = fnInfo.name;
    opt.textContent = `${fnInfo.name} — ${fnInfo.description}`;
    if (fnInfo.name === binding.mappingFn) opt.selected = true;
    fnSelect.appendChild(opt);
  }
  fnSelect.addEventListener("change", () => {
    binding = { ...binding, mappingFn: fnSelect.value };
    if (bound) onChange(inputKey, { ...binding });
    renderArgs();
  });
  fnRow.appendChild(fnSelect);
  configPanel.appendChild(fnRow);

  // Mapping args container (dynamic)
  const argsContainer = document.createElement("div");
  argsContainer.className = "mapping-args";
  configPanel.appendChild(argsContainer);

  function renderArgs(): void {
    argsContainer.innerHTML = "";
    const fnInfo = allFns.find((f) => f.name === binding.mappingFn);
    if (!fnInfo || fnInfo.params.length <= 1) return;

    // Skip first param (always the input value)
    const argParams = fnInfo.params.slice(1);

    for (let i = 0; i < argParams.length; i++) {
      const argRow = document.createElement("div");
      argRow.className = "mapping-row";

      const argLabel = document.createElement("span");
      argLabel.className = "mapping-label";
      argLabel.textContent = argParams[i];
      argRow.appendChild(argLabel);

      const argInput = document.createElement("input");
      argInput.type = "number";
      argInput.className = "mapping-arg-input";
      argInput.value = String(binding.mappingArgs[i] ?? 0);
      argInput.step = "0.1";

      const idx = i;
      argInput.addEventListener("change", () => {
        const newArgs = [...binding.mappingArgs];
        newArgs[idx] = parseFloat(argInput.value) || 0;
        binding = { ...binding, mappingArgs: newArgs };
        if (bound) onChange(inputKey, { ...binding });
      });

      argRow.appendChild(argInput);
      argsContainer.appendChild(argRow);
    }
  }

  renderArgs();
  container.appendChild(configPanel);

  return container;
}
