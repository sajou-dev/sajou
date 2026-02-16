/**
 * Step chain — horizontal Blockly-style block chain.
 *
 * Renders a choreography's steps as interlocking blocks in a horizontal
 * chain. Each block is colored by action type and shows inline params.
 * The when filter (if present) renders as the first block.
 *
 * Blocks snap together via CSS puzzle-piece connectors (tab on right,
 * notch on left).
 */

import type { ChoreographyDef, ChoreographyStepDef } from "../types.js";
import { STRUCTURAL_ACTIONS } from "../types.js";
import { getChoreographyState } from "../state/choreography-state.js";
import { ACTION_COLORS } from "./step-commands.js";
import { attachPillDragBehavior, isStepDragSuppressed, DRAGGABLE_ACTIONS } from "../workspace/step-drag.js";

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
  setAnimation: "\u25B6", // ▶
  followRoute: "\u21DD", // ⇝
  parallel: "\u2503",   // ┃ (split)
  onArrive: "\u2691",   // ⚑
  onInterrupt: "\u26A0", // ⚠
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StepChainCallbacks {
  /** Called when a block is clicked. */
  onStepClick: (stepId: string) => void;
  /** Called when the "+" button is clicked (legacy — now palette-driven). */
  onAddClick: (anchorEl: HTMLElement) => void;
}

/**
 * Render a horizontal block chain for a choreography.
 *
 * Returns a `.nc-chain` container with Blockly-style blocks.
 * If the choreography has a when condition, it renders as the first block.
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

  // Step blocks
  for (const step of choreo.steps) {
    const block = renderBlock(step, step.id === selectedStepId, callbacks.onStepClick, choreo.id);
    chain.appendChild(block);
  }

  // Empty drop zone hint at the end
  const dropHint = document.createElement("div");
  dropHint.className = "nc-chain-drop-hint";
  dropHint.textContent = choreo.steps.length === 0 ? "drop actions here" : "+";
  dropHint.title = "Drag an action from the palette";
  chain.appendChild(dropHint);

  return chain;
}

// ---------------------------------------------------------------------------
// Step block
// ---------------------------------------------------------------------------

/** Render a single step as a Blockly-style block. */
function renderBlock(
  step: ChoreographyStepDef,
  isSelected: boolean,
  onClick: (stepId: string) => void,
  choreoId: string,
): HTMLElement {
  const block = document.createElement("button");
  block.className = "nc-block" + (isSelected ? " nc-block--selected" : "");
  block.dataset.stepId = step.id;

  const color = ACTION_COLORS[step.action] ?? "#888899";
  block.style.setProperty("--block-color", color);

  // Mark incomplete blocks (draggable action with no entity configured)
  if (DRAGGABLE_ACTIONS.has(step.action) && !step.entity && !step.target) {
    block.classList.add("nc-block--incomplete");
  }

  // Icon
  const icon = document.createElement("span");
  icon.className = "nc-block-icon";
  icon.textContent = ACTION_ICONS[step.action] ?? "\u25CF"; // ●
  block.appendChild(icon);

  // Label with inline params
  const label = document.createElement("span");
  label.className = "nc-block-label";
  label.textContent = inlineLabel(step);
  block.appendChild(label);

  // Attach drag-to-entity behavior for draggable actions
  if (DRAGGABLE_ACTIONS.has(step.action)) {
    attachPillDragBehavior(block, step, choreoId);
  }

  block.addEventListener("click", (e) => {
    if (isStepDragSuppressed()) return;
    e.stopPropagation();
    onClick(step.id);
  });

  return block;
}

/** Build an inline label with params embedded. */
function inlineLabel(step: ChoreographyStepDef): string {
  if (STRUCTURAL_ACTIONS.includes(step.action)) {
    const count = step.children?.length ?? 0;
    return `${step.action} (${count})`;
  }

  const parts: string[] = [step.action];
  const entity = step.entity ?? step.target ?? "";
  if (entity) parts.push(entity);

  const to = step.params["to"] as string | undefined;
  if (to) parts.push(`\u2192 ${to}`); // →

  if (step.duration) parts.push(`${step.duration}ms`);

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Legacy exports (for backward compat with step-chain consumers)
// ---------------------------------------------------------------------------

/** @deprecated Use palette instead. Kept for backward compat. */
export function openActionPicker(_anchorEl: HTMLElement, _choreoId: string): void {
  // No-op — replaced by action palette
}

/** @deprecated No-op. */
export function closeActionPicker(): void {
  // No-op
}
