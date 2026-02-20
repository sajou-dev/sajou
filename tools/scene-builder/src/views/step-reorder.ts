/**
 * Step reorder — drag grip to reorder steps within a choreography chain.
 *
 * Mousedown on `.nc-block-grip` activates drag mode after a 5px threshold.
 * A ghost clone follows the cursor while a placeholder marks the insertion
 * point. On drop, `reorderStepCmd` commits the new order with undo support.
 *
 * V1: top-level steps only (no children of parallel/onArrive/onInterrupt).
 */

import { reorderStepCmd } from "./step-commands.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRAG_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let dragging = false;
let dragStepId = "";
let dragChoreoId = "";
let startX = 0;
let startY = 0;
let thresholdMet = false;
let ghost: HTMLElement | null = null;
let placeholder: HTMLElement | null = null;
let dragBlock: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize step reorder drag interaction. Call once after DOM is ready. */
export function initStepReorder(): void {
  // Capture phase so we fire BEFORE the chain's stopPropagation() in bubbling
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function onMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return;

  const grip = (e.target as HTMLElement).closest<HTMLElement>(".nc-block-grip");
  if (!grip) return;

  const stepId = grip.dataset.stepId;
  const choreoId = grip.dataset.choreoId;
  if (!stepId || !choreoId) return;

  dragging = true;
  dragStepId = stepId;
  dragChoreoId = choreoId;
  startX = e.clientX;
  startY = e.clientY;
  thresholdMet = false;

  // Find the parent block
  dragBlock = grip.closest<HTMLElement>(".nc-block");

  e.preventDefault();
  e.stopPropagation();
}

function onMouseMove(e: MouseEvent): void {
  if (!dragging || !dragBlock) return;
  e.preventDefault();

  if (!thresholdMet) {
    const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (dist < DRAG_THRESHOLD) return;
    thresholdMet = true;

    // Prevent text selection during drag
    document.body.style.userSelect = "none";

    // Create ghost (clone of the block)
    ghost = dragBlock.cloneNode(true) as HTMLElement;
    ghost.className = "nc-block nc-block-reorder-ghost";
    ghost.style.setProperty("--block-color", dragBlock.style.getPropertyValue("--block-color"));
    ghost.style.position = "fixed";
    ghost.style.width = `${dragBlock.offsetWidth}px`;
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "10000";
    ghost.style.opacity = "0.85";
    document.body.appendChild(ghost);

    // Create placeholder
    placeholder = document.createElement("div");
    placeholder.className = "nc-block-reorder-placeholder";
    placeholder.style.height = `${dragBlock.offsetHeight}px`;

    // Insert placeholder and hide the original
    dragBlock.parentElement?.insertBefore(placeholder, dragBlock);
    dragBlock.classList.add("nc-block--reordering");
  }

  if (ghost) {
    ghost.style.left = `${e.clientX - 20}px`;
    ghost.style.top = `${e.clientY - ghost.offsetHeight / 2}px`;
  }

  // Determine insertion point via midpoint crossing
  if (!placeholder || !dragBlock) return;
  const chain = dragBlock.closest<HTMLElement>(".nc-chain");
  if (!chain) return;

  const siblings = [...chain.querySelectorAll<HTMLElement>(
    ".nc-block:not(.nc-block--hat):not(.nc-block--reordering)",
  )];

  let inserted = false;
  for (const sibling of siblings) {
    const rect = sibling.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      chain.insertBefore(placeholder, sibling);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    // Past all blocks — place before the drop hint (last child)
    const dropHint = chain.querySelector<HTMLElement>(".nc-chain-drop-hint");
    if (dropHint) {
      chain.insertBefore(placeholder, dropHint);
    } else {
      chain.appendChild(placeholder);
    }
  }
}

function onMouseUp(): void {
  if (!dragging) return;

  if (thresholdMet && placeholder && dragBlock) {
    const chain = dragBlock.closest<HTMLElement>(".nc-chain");

    // Clean up DOM state
    dragBlock.classList.remove("nc-block--reordering");

    if (ghost) {
      ghost.remove();
      ghost = null;
    }

    if (chain) {
      // The placeholder sits where the block should go — count blocks before it
      let toIndex = 0;
      for (const el of chain.children) {
        if (el === placeholder) break;
        if (el.classList.contains("nc-block") && !el.classList.contains("nc-block--hat")) {
          toIndex++;
        }
      }

      placeholder.remove();
      placeholder = null;

      // Commit reorder
      reorderStepCmd(dragChoreoId, dragStepId, toIndex);
    } else {
      placeholder.remove();
      placeholder = null;
    }
  } else {
    // Cleanup if threshold not met
    if (ghost) { ghost.remove(); ghost = null; }
    if (placeholder) { placeholder.remove(); placeholder = null; }
    if (dragBlock) dragBlock.classList.remove("nc-block--reordering");
  }

  // Restore text selection
  document.body.style.userSelect = "";

  dragging = false;
  dragBlock = null;
  dragStepId = "";
  dragChoreoId = "";
  thresholdMet = false;
}
