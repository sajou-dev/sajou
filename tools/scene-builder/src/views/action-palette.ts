/**
 * Action palette — fixed toolbar of draggable action blocks.
 *
 * Sits at the top of `#zone-choreographer`. Each block represents an action
 * type (move, fly, flash...) and can be dragged into a clamp (rack) to add
 * that action as a new step.
 *
 * Replaces the floating action picker (openActionPicker).
 */

import { ACTION_COLORS, addStepCmd, createDefaultStep } from "./step-commands.js";
import { getChoreographyState } from "../state/choreography-state.js";

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

/** Action palette items. */
const PALETTE_ITEMS: { action: string; icon: string; label: string }[] = [
  { action: "move", icon: "\u279C", label: "move" },
  { action: "fly", icon: "\u2197", label: "fly" },
  { action: "spawn", icon: "+", label: "spawn" },
  { action: "destroy", icon: "\u2716", label: "destroy" },
  { action: "flash", icon: "\u26A1", label: "flash" },
  { action: "wait", icon: "\u23F1", label: "wait" },
  { action: "playSound", icon: "\u266B", label: "sound" },
  { action: "setAnimation", icon: "\u25B6", label: "anim" },
  { action: "followRoute", icon: "\u21DD", label: "route" },
  { action: "parallel", icon: "\u2503", label: "parallel" },
  { action: "onArrive", icon: "\u2691", label: "onArrive" },
  { action: "onInterrupt", icon: "\u26A0", label: "onInterrupt" },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRAG_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let initialized = false;

/** Create the action palette and insert it at the top of the zone. */
export function initActionPalette(zoneEl: HTMLElement): void {
  if (initialized) return;
  initialized = true;

  const palette = document.createElement("div");
  palette.className = "action-palette";

  for (const item of PALETTE_ITEMS) {
    const block = createPaletteBlock(item);
    palette.appendChild(block);
  }

  // Insert at top of zone (before rack-list)
  zoneEl.prepend(palette);

  // Init drag-from-palette system
  initPaletteDrag();
}

// ---------------------------------------------------------------------------
// Palette block
// ---------------------------------------------------------------------------

/** Create a single draggable palette block. */
function createPaletteBlock(item: { action: string; icon: string; label: string }): HTMLElement {
  const block = document.createElement("div");
  block.className = "action-palette-block";
  block.dataset.paletteAction = item.action;

  const color = ACTION_COLORS[item.action] ?? "#888899";
  block.style.setProperty("--block-color", color);

  const icon = document.createElement("span");
  icon.className = "action-palette-icon";
  icon.textContent = item.icon;
  block.appendChild(icon);

  const label = document.createElement("span");
  label.className = "action-palette-label";
  label.textContent = item.label;
  block.appendChild(label);

  return block;
}

// ---------------------------------------------------------------------------
// Drag from palette into clamp
// ---------------------------------------------------------------------------

function initPaletteDrag(): void {
  let dragging = false;
  let actionType = "";
  let ghost: HTMLElement | null = null;
  let mouseDownX = 0;
  let mouseDownY = 0;
  let thresholdMet = false;
  let highlightedClamp: HTMLElement | null = null;

  document.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 0) return;

    const block = (e.target as HTMLElement).closest<HTMLElement>("[data-palette-action]");
    if (!block) return;

    const action = block.dataset.paletteAction;
    if (!action) return;

    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    actionType = action;
    thresholdMet = false;
    dragging = true;

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging) return;

    if (!thresholdMet) {
      const dist = Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY);
      if (dist < DRAG_THRESHOLD) return;
      thresholdMet = true;

      const color = ACTION_COLORS[actionType] ?? "#888899";
      ghost = document.createElement("div");
      ghost.className = "action-palette-ghost";
      ghost.textContent = actionType;
      ghost.style.setProperty("--block-color", color);
      document.body.appendChild(ghost);
    }

    if (ghost) {
      ghost.style.left = `${e.clientX + 12}px`;
      ghost.style.top = `${e.clientY - 12}px`;
    }

    // Highlight clamp under cursor
    const clamp = findClampAt(e.clientX, e.clientY);
    if (clamp !== highlightedClamp) {
      highlightedClamp?.classList.remove("rack--drop-target");
      highlightedClamp = clamp;
      highlightedClamp?.classList.add("rack--drop-target");
    }
  });

  document.addEventListener("mouseup", (e: MouseEvent) => {
    if (!dragging) return;

    ghost?.remove();
    ghost = null;
    highlightedClamp?.classList.remove("rack--drop-target");
    highlightedClamp = null;

    if (!thresholdMet) {
      dragging = false;
      return;
    }

    dragging = false;

    // Find which clamp we dropped on
    const clamp = findClampAt(e.clientX, e.clientY);
    if (!clamp) return;

    const choreoId = clamp.dataset.choreoId;
    if (!choreoId) return;

    // Verify the choreography still exists
    const { choreographies } = getChoreographyState();
    if (!choreographies.some((c) => c.id === choreoId)) return;

    // Add the step to the choreography
    addStepCmd(choreoId, createDefaultStep(actionType));
  });
}

/** Find the clamp (.rack) element at the given cursor position. */
function findClampAt(x: number, y: number): HTMLElement | null {
  const elements = document.elementsFromPoint(x, y);
  for (const el of elements) {
    const rack = (el as HTMLElement).closest<HTMLElement>(".rack");
    if (rack && rack.dataset.choreoId) return rack;
  }
  return null;
}
