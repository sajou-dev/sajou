/**
 * Step chain — vertical block chain with inline editable params.
 *
 * Each action block contains its parameters as inline inputs,
 * reading like a sentence (Scratch/Unitree model). No separate
 * form — the block IS the editor.
 *
 * Blocks stack vertically in the dock groove. Each block stretches
 * to fit its inline controls.
 */

import type { ChoreographyDef, ChoreographyStepDef } from "../types.js";
import { STRUCTURAL_ACTIONS } from "../types.js";
import { getChoreographyState } from "../state/choreography-state.js";
import { getActionSchema } from "../choreography/action-inputs.js";
import type { InputDeclaration } from "../choreography/input-types.js";
import {
  ACTION_COLORS,
  flattenSteps,
  updateStepCmd,
  removeStepCmd,
} from "./step-commands.js";
import { attachPillDragBehavior, isStepDragSuppressed, DRAGGABLE_ACTIONS } from "../workspace/step-drag.js";

// ---------------------------------------------------------------------------
// Action icons
// ---------------------------------------------------------------------------

const ACTION_ICONS: Record<string, string> = {
  move: "\u279C",       // ➜
  spawn: "+",
  destroy: "\u2716",    // ✖
  fly: "\u2197",        // ↗
  flash: "\u26A1",      // ⚡
  wait: "\u23F1",       // ⏱
  playSound: "\u266B",  // ♫
  setAnimation: "\u25B6", // ▶
  followRoute: "\u21DD", // ⇝
  parallel: "\u2503",   // ┃
  onArrive: "\u2691",   // ⚑
  onInterrupt: "\u26A0", // ⚠
};

// ---------------------------------------------------------------------------
// Inline field config
// ---------------------------------------------------------------------------

/** Easing options for inline select. */
const EASING_OPTIONS = ["linear", "easeIn", "easeOut", "easeInOut", "arc"];

/** Inline labels for known keys. Empty string = no label. */
const INLINE_LABELS: Record<string, string> = {
  entity: "",
  target: "",
  duration: "",
  easing: "",
  to: "\u2192", // →
  at: "at",
  delay: "delay",
  from: "from",
  reverse: "rev",
};

/** Common field keys (read from step root, not params). */
const COMMON_KEYS = new Set(["entity", "target", "delay", "duration", "easing"]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StepChainCallbacks {
  /** Called when a block background is clicked. */
  onStepClick: (stepId: string) => void;
  /** Legacy — no-op. */
  onAddClick: (anchorEl: HTMLElement) => void;
}

/**
 * Render a vertical block chain for a choreography.
 * Each block contains inline editable params.
 */
export function renderStepChain(
  choreo: ChoreographyDef,
  callbacks: StepChainCallbacks,
): HTMLElement {
  const chain = document.createElement("div");
  chain.className = "nc-chain";

  // Prevent rack drag when interacting with the chain
  chain.addEventListener("mousedown", (e) => e.stopPropagation());

  const { selectedStepId } = getChoreographyState();

  for (const step of choreo.steps) {
    const block = renderBlock(step, step.id === selectedStepId, callbacks.onStepClick, choreo.id);
    chain.appendChild(block);
  }

  // Drop zone hint
  const dropHint = document.createElement("div");
  dropHint.className = "nc-chain-drop-hint";
  dropHint.textContent = choreo.steps.length === 0 ? "drop actions here" : "+";
  dropHint.title = "Drag an action from the palette";
  chain.appendChild(dropHint);

  return chain;
}

// ---------------------------------------------------------------------------
// Fresh step reader (avoids stale closure on param edits)
// ---------------------------------------------------------------------------

/** Re-read step from store to prevent stale params on rapid edits. */
function getFreshStep(choreoId: string, stepId: string): ChoreographyStepDef | null {
  const { choreographies } = getChoreographyState();
  const choreo = choreographies.find((c) => c.id === choreoId);
  if (!choreo) return null;
  return flattenSteps(choreo.steps).find((s) => s.id === stepId) ?? null;
}

// ---------------------------------------------------------------------------
// Block renderer — the block IS the editor
// ---------------------------------------------------------------------------

/** Render a single step block with inline param controls. */
function renderBlock(
  step: ChoreographyStepDef,
  isSelected: boolean,
  onClick: (stepId: string) => void,
  choreoId: string,
): HTMLElement {
  const block = document.createElement("div");
  block.className = "nc-block" + (isSelected ? " nc-block--selected" : "");
  block.dataset.stepId = step.id;

  const color = ACTION_COLORS[step.action] ?? "#888899";
  block.style.setProperty("--block-color", color);

  // Icon
  const icon = document.createElement("span");
  icon.className = "nc-block-icon";
  icon.textContent = ACTION_ICONS[step.action] ?? "\u25CF";
  block.appendChild(icon);

  // Action name
  const name = document.createElement("span");
  name.className = "nc-block-action";
  name.textContent = step.action;
  block.appendChild(name);

  // Structural actions: just show children count
  if (STRUCTURAL_ACTIONS.includes(step.action)) {
    const count = step.children?.length ?? 0;
    const countEl = document.createElement("span");
    countEl.className = "nc-block-count";
    countEl.textContent = `(${count})`;
    block.appendChild(countEl);
  } else {
    // Inline editable params from schema
    const schema = getActionSchema(step.action);
    if (schema) {
      const onChange = (key: string, value: unknown): void => {
        const updates: Partial<ChoreographyStepDef> = {};
        if (key === "entity") { updates.entity = value as string; }
        else if (key === "target") { updates.target = value as string; }
        else if (key === "delay") { updates.delay = value as number; }
        else if (key === "duration") { updates.duration = value as number; }
        else if (key === "easing") { updates.easing = value as string; }
        else {
          const fresh = getFreshStep(choreoId, step.id);
          const currentParams = fresh?.params ?? step.params;
          updates.params = { ...currentParams, [key]: value };
        }
        updateStepCmd(choreoId, step.id, updates);
      };

      for (const decl of schema.common) {
        const val = getCommonValue(step, decl.key);
        block.appendChild(createInlineField(decl, val, onChange));
      }

      for (const decl of schema.params) {
        block.appendChild(createInlineField(decl, step.params[decl.key], onChange));
      }
    }
  }

  // Delete button (appears on hover)
  const del = document.createElement("span");
  del.className = "nc-block-delete";
  del.textContent = "\u00D7";
  del.title = "Delete step";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    removeStepCmd(choreoId, step.id);
  });
  block.appendChild(del);

  // Drag-to-entity for draggable actions
  if (DRAGGABLE_ACTIONS.has(step.action)) {
    attachPillDragBehavior(block, step, choreoId);
  }

  // Click on block background → select (not when clicking an input)
  block.addEventListener("click", (e) => {
    if (isStepDragSuppressed()) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    e.stopPropagation();
    onClick(step.id);
  });

  return block;
}

/** Read a common field value from the step root. */
function getCommonValue(step: ChoreographyStepDef, key: string): unknown {
  if (key === "entity") return step.entity;
  if (key === "target") return step.target;
  if (key === "delay") return step.delay;
  if (key === "duration") return step.duration;
  if (key === "easing") return step.easing;
  return undefined;
}

// ---------------------------------------------------------------------------
// Inline field factory — creates mini-controls inside blocks
// ---------------------------------------------------------------------------

/** Create an inline field (label + control) for a schema declaration. */
function createInlineField(
  decl: InputDeclaration,
  value: unknown,
  onChange: (key: string, value: unknown) => void,
): HTMLElement {
  const field = document.createElement("span");
  field.className = "nc-inline-field";

  // Label (some keys have no label, others have a short inline label)
  const labelText = decl.key in INLINE_LABELS
    ? INLINE_LABELS[decl.key]!
    : decl.label.toLowerCase();
  if (labelText) {
    const label = document.createElement("span");
    label.className = "nc-inline-label";
    label.textContent = labelText;
    field.appendChild(label);
  }

  const placeholder = "placeholder" in decl && typeof decl.placeholder === "string"
    ? decl.placeholder
    : decl.label.toLowerCase();

  switch (decl.type) {
    case "duration": {
      const input = document.createElement("input");
      input.type = "number";
      input.className = "nc-inline-num";
      input.value = String(value ?? ("default" in decl ? decl.default : 0) ?? 0);
      if ("min" in decl && decl.min != null) input.min = String(decl.min);
      if ("max" in decl && decl.max != null) input.max = String(decl.max);
      input.addEventListener("change", () => onChange(decl.key, Number(input.value)));
      field.appendChild(input);

      const unit = document.createElement("span");
      unit.className = "nc-inline-unit";
      unit.textContent = "ms";
      field.appendChild(unit);
      break;
    }

    case "easing": {
      const select = document.createElement("select");
      select.className = "nc-inline-select";
      const current = (value ?? ("default" in decl ? decl.default : "linear") ?? "linear") as string;
      for (const opt of EASING_OPTIONS) {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        if (opt === current) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener("change", () => onChange(decl.key, select.value));
      field.appendChild(select);
      break;
    }

    case "entity-ref":
    case "position-ref":
    case "route-ref":
    case "waypoint-ref":
    case "string": {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "nc-inline-input";
      input.value = String(value ?? "");
      input.placeholder = placeholder;
      input.addEventListener("change", () => onChange(decl.key, input.value));
      field.appendChild(input);
      break;
    }

    case "float":
    case "int": {
      const input = document.createElement("input");
      input.type = "number";
      input.className = "nc-inline-num";
      input.value = String(value ?? ("default" in decl ? decl.default : 0) ?? 0);
      if ("min" in decl && decl.min != null) input.min = String(decl.min);
      if ("max" in decl && decl.max != null) input.max = String(decl.max);
      if ("step" in decl && decl.step != null) input.step = String(decl.step);
      input.addEventListener("change", () => onChange(decl.key, Number(input.value)));
      field.appendChild(input);
      break;
    }

    case "angle": {
      const input = document.createElement("input");
      input.type = "number";
      input.className = "nc-inline-num";
      input.value = String(value ?? ("default" in decl ? decl.default : 0) ?? 0);
      input.min = "0";
      input.max = "360";
      input.addEventListener("change", () => onChange(decl.key, Number(input.value)));
      field.appendChild(input);

      const unit = document.createElement("span");
      unit.className = "nc-inline-unit";
      unit.textContent = "\u00B0"; // °
      field.appendChild(unit);
      break;
    }

    case "color": {
      const input = document.createElement("input");
      input.type = "color";
      input.className = "nc-inline-color";
      input.value = String(value ?? ("default" in decl ? decl.default : "#E8A851") ?? "#E8A851");
      input.addEventListener("change", () => onChange(decl.key, input.value));
      field.appendChild(input);
      break;
    }

    case "bool": {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "nc-inline-check";
      input.checked = Boolean(value ?? ("default" in decl ? decl.default : false));
      input.addEventListener("change", () => onChange(decl.key, input.checked));
      field.appendChild(input);
      break;
    }

    case "enum": {
      const select = document.createElement("select");
      select.className = "nc-inline-select";
      const current = (value ?? ("default" in decl ? decl.default : "")) as string;
      for (const opt of decl.options) {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === current) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener("change", () => onChange(decl.key, select.value));
      field.appendChild(select);
      break;
    }

    default: {
      // Fallback: text input
      const input = document.createElement("input");
      input.type = "text";
      input.className = "nc-inline-input";
      input.value = value != null ? String(value) : "";
      input.placeholder = placeholder;
      input.addEventListener("change", () => onChange(decl.key, input.value));
      field.appendChild(input);
    }
  }

  return field;
}

// ---------------------------------------------------------------------------
// Legacy exports
// ---------------------------------------------------------------------------

/** @deprecated Use palette instead. */
export function openActionPicker(_anchorEl: HTMLElement, _choreoId: string): void {
  // No-op
}

/** @deprecated No-op. */
export function closeActionPicker(): void {
  // No-op
}
