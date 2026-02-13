/**
 * Step chain — horizontal pill-based step renderer.
 *
 * Renders a choreography's steps as a horizontal chain of coloured pills
 * connected by arrows, inspired by TouchDesigner's operator chains.
 * Each pill is clickable (opens popover). A "+" button at the end
 * opens the quick-action picker.
 */

import type { ChoreographyDef, ChoreographyStepDef } from "../types.js";
import { STRUCTURAL_ACTIONS } from "../types.js";
import { getChoreographyState } from "../state/choreography-state.js";
import { ACTION_COLORS, addStepCmd, createDefaultStep } from "./step-commands.js";

// ---------------------------------------------------------------------------
// Action icons (short emoji/symbol per action type)
// ---------------------------------------------------------------------------

const ACTION_ICONS: Record<string, string> = {
  move: "\u279C",       // ➜
  spawn: "+",
  destroy: "\u2716",    // ✖
  fly: "\u2197",        // ↗
  flash: "\u26A1",      // ⚡
  wait: "\u23F1",       // ⏱
  playSound: "\u266B",  // ♫
  parallel: "\u2503",   // ┃ (split)
  onArrive: "\u2691",   // ⚑
  onInterrupt: "\u26A0", // ⚠
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StepChainCallbacks {
  /** Called when a pill is clicked. */
  onStepClick: (stepId: string) => void;
  /** Called when the "+" button is clicked (opens action picker). */
  onAddClick: (anchorEl: HTMLElement) => void;
}

/**
 * Render a horizontal step chain for a choreography.
 *
 * Returns a `.nc-chain` container with pills, arrows, and a "+" button.
 */
export function renderStepChain(
  choreo: ChoreographyDef,
  callbacks: StepChainCallbacks,
): HTMLElement {
  const chain = document.createElement("div");
  chain.className = "nc-chain";

  // Prevent node drag when interacting with the chain
  chain.addEventListener("mousedown", (e) => e.stopPropagation());

  const { selectedStepId } = getChoreographyState();

  if (choreo.steps.length === 0) {
    // Empty state: just the "+" button
    const addBtn = createAddButton(callbacks.onAddClick);
    chain.appendChild(addBtn);
    return chain;
  }

  for (let i = 0; i < choreo.steps.length; i++) {
    const step = choreo.steps[i]!;

    // Arrow before each pill (except the first)
    if (i > 0) {
      const arrow = document.createElement("div");
      arrow.className = "nc-chain-arrow";
      chain.appendChild(arrow);
    }

    const pill = renderPill(step, step.id === selectedStepId, callbacks.onStepClick);
    chain.appendChild(pill);
  }

  // Arrow before the "+" button
  const lastArrow = document.createElement("div");
  lastArrow.className = "nc-chain-arrow";
  chain.appendChild(lastArrow);

  // "+" add button
  const addBtn = createAddButton(callbacks.onAddClick);
  chain.appendChild(addBtn);

  return chain;
}

// ---------------------------------------------------------------------------
// Internal: pill
// ---------------------------------------------------------------------------

/** Render a single step pill. */
function renderPill(
  step: ChoreographyStepDef,
  isSelected: boolean,
  onClick: (stepId: string) => void,
): HTMLElement {
  const pill = document.createElement("button");
  pill.className = "nc-chain-pill" + (isSelected ? " nc-chain-pill--selected" : "");
  pill.dataset.stepId = step.id;

  const color = ACTION_COLORS[step.action] ?? "#888899";
  pill.style.setProperty("--pill-color", color);

  // Icon
  const icon = document.createElement("span");
  icon.className = "nc-pill-icon";
  icon.textContent = ACTION_ICONS[step.action] ?? "\u25CF"; // ●
  pill.appendChild(icon);

  // Label
  const label = document.createElement("span");
  label.className = "nc-pill-label";

  if (STRUCTURAL_ACTIONS.includes(step.action)) {
    const count = step.children?.length ?? 0;
    label.textContent = `${step.action} (${count})`;
  } else {
    label.textContent = compactLabel(step);
  }

  pill.appendChild(label);

  pill.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick(step.id);
  });

  return pill;
}

/** Build a compact label: "action entity → target" */
function compactLabel(step: ChoreographyStepDef): string {
  const entity = step.entity ?? step.target ?? "";
  const to = step.params["to"] as string | undefined;
  if (entity && to) return `${step.action} ${entity}→${to}`;
  if (entity) return `${step.action} ${entity}`;
  return step.action;
}

// ---------------------------------------------------------------------------
// Internal: add button
// ---------------------------------------------------------------------------

/** Create the dashed "+" button at the end of the chain. */
function createAddButton(onAddClick: (anchor: HTMLElement) => void): HTMLElement {
  const btn = document.createElement("button");
  btn.className = "nc-chain-add";
  btn.title = "Add step";
  btn.textContent = "+";

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onAddClick(btn);
  });

  return btn;
}

// ---------------------------------------------------------------------------
// Quick-action picker
// ---------------------------------------------------------------------------

/** Action picker items: icon + label + action type. */
const PICKER_ITEMS: { action: string; icon: string; label: string }[] = [
  { action: "move", icon: "\u279C", label: "move" },
  { action: "spawn", icon: "+", label: "spawn" },
  { action: "destroy", icon: "\u2716", label: "destroy" },
  { action: "fly", icon: "\u2197", label: "fly" },
  { action: "flash", icon: "\u26A1", label: "flash" },
  { action: "wait", icon: "\u23F1", label: "wait" },
  { action: "playSound", icon: "\u266B", label: "sound" },
  { action: "parallel", icon: "\u2503", label: "parallel" },
  { action: "onArrive", icon: "\u2691", label: "onArrive" },
  { action: "onInterrupt", icon: "\u26A0", label: "onInterrupt" },
];

let pickerEl: HTMLElement | null = null;
let pickerCleanup: (() => void) | null = null;

/** Open the quick-action picker anchored to the "+" button. */
export function openActionPicker(anchorEl: HTMLElement, choreoId: string): void {
  closeActionPicker();

  const picker = document.createElement("div");
  picker.className = "nc-action-picker";

  for (const item of PICKER_ITEMS) {
    const color = ACTION_COLORS[item.action] ?? "#888899";

    const btn = document.createElement("button");
    btn.className = "nc-action-picker-item";
    btn.style.setProperty("--picker-color", color);
    btn.title = item.label;

    const icon = document.createElement("span");
    icon.className = "nc-action-picker-icon";
    icon.textContent = item.icon;
    btn.appendChild(icon);

    const label = document.createElement("span");
    label.className = "nc-action-picker-label";
    label.textContent = item.label;
    btn.appendChild(label);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      addStepCmd(choreoId, createDefaultStep(item.action));
      closeActionPicker();
    });

    picker.appendChild(btn);
  }

  document.body.appendChild(picker);
  pickerEl = picker;

  // Position below the anchor
  const rect = anchorEl.getBoundingClientRect();
  const pickerWidth = 200;
  let left = rect.left + rect.width / 2 - pickerWidth / 2;
  left = Math.max(8, Math.min(window.innerWidth - pickerWidth - 8, left));
  let top = rect.bottom + 6;
  // If it would overflow, place above
  if (top + 200 > window.innerHeight - 8) {
    top = rect.top - 200 - 6;
  }
  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;

  // Close on click outside or Escape
  const onDocClick = (e: MouseEvent) => {
    if (picker.contains(e.target as Node)) return;
    closeActionPicker();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeActionPicker();
  };

  requestAnimationFrame(() => {
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
  });

  pickerCleanup = () => {
    document.removeEventListener("mousedown", onDocClick);
    document.removeEventListener("keydown", onKeyDown);
  };
}

/** Close the quick-action picker. */
export function closeActionPicker(): void {
  if (pickerCleanup) {
    pickerCleanup();
    pickerCleanup = null;
  }
  if (pickerEl) {
    pickerEl.remove();
    pickerEl = null;
  }
}
