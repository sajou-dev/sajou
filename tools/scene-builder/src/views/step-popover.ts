/**
 * Step popover — floating parameter editor for a single step.
 *
 * Opens below (or above) a clicked pill in the step chain.
 * Uses the same ISF input controls as the original detail panel,
 * but commits changes on blur/change (no "Apply" button).
 */

import type { ChoreographyStepDef } from "../types.js";
import { STRUCTURAL_ACTIONS } from "../types.js";
import {
  getChoreographyState,
  subscribeChoreography,
} from "../state/choreography-state.js";
import { getActionSchema } from "../choreography/action-inputs.js";
import { createInputControl } from "../choreography/input-controls.js";
import type { OnInputChange } from "../choreography/input-controls.js";
import {
  ACTION_TYPES,
  flattenSteps,
  updateStepCmd,
  removeStepCmd,
} from "./step-commands.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let popoverEl: HTMLElement | null = null;
let cleanupFn: (() => void) | null = null;
let currentStepId: string | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Open a parameter popover anchored to a pill element. */
export function openStepPopover(
  stepId: string,
  choreoId: string,
  anchorEl: HTMLElement,
): void {
  // If same step, toggle off
  if (currentStepId === stepId && popoverEl) {
    closeStepPopover();
    return;
  }

  closeStepPopover();
  currentStepId = stepId;

  // Find the step data
  const { choreographies } = getChoreographyState();
  const choreo = choreographies.find((c) => c.id === choreoId);
  if (!choreo) return;

  const allSteps = flattenSteps(choreo.steps);
  const step = allSteps.find((s) => s.id === stepId);
  if (!step) return;

  // Create popover element
  const el = document.createElement("div");
  el.className = "nc-popover";

  // Arrow pointing up toward the pill
  const arrow = document.createElement("div");
  arrow.className = "nc-popover-arrow";
  el.appendChild(arrow);

  // Content
  const content = document.createElement("div");
  content.className = "nc-popover-content";

  // Action selector (dropdown at top)
  const actionRow = document.createElement("div");
  actionRow.className = "nc-popover-row";

  const actionLabel = document.createElement("span");
  actionLabel.className = "nc-popover-label";
  actionLabel.textContent = "action";
  actionRow.appendChild(actionLabel);

  const actionSelect = document.createElement("select");
  actionSelect.className = "nc-popover-select";
  for (const a of ACTION_TYPES) {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    if (a === step.action) opt.selected = true;
    actionSelect.appendChild(opt);
  }
  actionSelect.addEventListener("change", () => {
    const newAction = actionSelect.value;
    const updates: Partial<ChoreographyStepDef> = { action: newAction };
    if (STRUCTURAL_ACTIONS.includes(newAction) && !step.children) {
      updates.children = [];
    }
    if (!STRUCTURAL_ACTIONS.includes(newAction) && step.children) {
      updates.children = undefined;
    }
    updateStepCmd(choreoId, stepId, updates);
  });
  actionRow.appendChild(actionSelect);
  content.appendChild(actionRow);

  // ISF inputs — commit on change (no Apply button)
  const onChange: OnInputChange = (key: string, value: unknown) => {
    const updates: Partial<ChoreographyStepDef> = {};
    if (key === "entity") { updates.entity = value as string; }
    else if (key === "target") { updates.target = value as string; }
    else if (key === "delay") { updates.delay = value as number; }
    else if (key === "duration") { updates.duration = value as number; }
    else if (key === "easing") { updates.easing = value as string; }
    else { updates.params = { ...step.params, [key]: value }; }
    updateStepCmd(choreoId, stepId, updates);
  };

  const schema = getActionSchema(step.action);
  if (schema) {
    // Common inputs
    for (const decl of schema.common) {
      let currentValue: unknown;
      if (decl.key === "entity") currentValue = step.entity;
      else if (decl.key === "target") currentValue = step.target;
      else if (decl.key === "delay") currentValue = step.delay;
      else if (decl.key === "duration") currentValue = step.duration;
      else if (decl.key === "easing") currentValue = step.easing;
      const control = createInputControl(decl, currentValue, onChange);
      content.appendChild(control);
    }

    // Param inputs
    if (schema.params.length > 0) {
      const paramTitle = document.createElement("div");
      paramTitle.className = "nc-popover-subtitle";
      paramTitle.textContent = "params";
      content.appendChild(paramTitle);

      for (const decl of schema.params) {
        const currentValue = step.params[decl.key];
        const control = createInputControl(decl, currentValue, onChange);
        content.appendChild(control);
      }
    }
  } else {
    // Fallback: raw JSON textarea
    const textarea = document.createElement("textarea");
    textarea.className = "nc-popover-textarea";
    textarea.value = JSON.stringify(step.params, null, 2);
    textarea.rows = 4;
    textarea.addEventListener("change", () => {
      try {
        const parsed = JSON.parse(textarea.value) as Record<string, unknown>;
        updateStepCmd(choreoId, stepId, { params: parsed });
      } catch { /* ignore invalid JSON */ }
    });
    content.appendChild(textarea);
  }

  // Delete button
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "nc-popover-delete";
  deleteBtn.textContent = "\u2716 Delete step";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeStepCmd(choreoId, stepId);
    closeStepPopover();
  });
  content.appendChild(deleteBtn);

  el.appendChild(content);
  document.body.appendChild(el);
  popoverEl = el;

  // Position the popover below the anchor pill
  positionPopover(el, arrow, anchorEl);

  // Track the current anchor — it may be replaced by re-renders
  let currentAnchor = anchorEl;

  // Close on click outside or Escape
  const onDocClick = (e: MouseEvent) => {
    if (el.contains(e.target as Node)) return;
    if (currentAnchor.contains(e.target as Node)) return;
    closeStepPopover();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeStepPopover();
  };

  // Delay listener to avoid the opening click from closing immediately
  requestAnimationFrame(() => {
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
  });

  // Re-position when choreography state changes (e.g. node pan/zoom).
  // If the anchor pill was re-rendered (DOM replaced), find the new one
  // by data-step-id and re-anchor. Only close if the step truly vanished.
  const unsub = subscribeChoreography(() => {
    if (!currentAnchor.isConnected) {
      // Pill was re-rendered — try to find its replacement
      const replacement = document.querySelector<HTMLElement>(
        `.nc-chain-pill[data-step-id="${stepId}"]`,
      );
      if (replacement) {
        currentAnchor = replacement;
      } else {
        // Step was deleted — close popover
        closeStepPopover();
        return;
      }
    }
    if (popoverEl) positionPopover(popoverEl, arrow, currentAnchor);
  });

  cleanupFn = () => {
    document.removeEventListener("mousedown", onDocClick);
    document.removeEventListener("keydown", onKeyDown);
    unsub();
  };
}

/** Close and remove the step popover. */
export function closeStepPopover(): void {
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }
  if (popoverEl) {
    popoverEl.remove();
    popoverEl = null;
  }
  currentStepId = null;
}

// ---------------------------------------------------------------------------
// Positioning
// ---------------------------------------------------------------------------

/** Position the popover below (or above) the anchor element. */
function positionPopover(el: HTMLElement, arrow: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const popoverWidth = 260;
  const margin = 8;

  // Default: below the pill
  let top = rect.bottom + margin;
  let left = rect.left + rect.width / 2 - popoverWidth / 2;

  // Clamp horizontal
  left = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, left));

  // If below would overflow viewport, place above
  const estimatedHeight = 250;
  if (top + estimatedHeight > window.innerHeight - 8) {
    top = rect.top - estimatedHeight - margin;
    el.classList.add("nc-popover--above");
    arrow.style.top = "auto";
    arrow.style.bottom = "-6px";
  } else {
    el.classList.remove("nc-popover--above");
    arrow.style.top = "-6px";
    arrow.style.bottom = "auto";
  }

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.width = `${popoverWidth}px`;

  // Arrow horizontal position
  const arrowLeft = rect.left + rect.width / 2 - left - 6;
  arrow.style.left = `${Math.max(8, Math.min(popoverWidth - 20, arrowLeft))}px`;
}
