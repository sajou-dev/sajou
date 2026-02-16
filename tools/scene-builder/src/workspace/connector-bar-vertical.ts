/**
 * Vertical connector bar — choreographer ↔ visual.
 *
 * Mounts action badges inside the rail separator (#rail-choreographer-visual).
 * Each badge represents a non-structural action step from a populated rack.
 *
 * Wired section (top): actions from choreographies that have a defaultTargetEntityId.
 * Unwired section (bottom): actions from choreographies without a target entity.
 *
 * Badges are draggable toward visual entities (integrates with wiring-drag / step-drag).
 */

import type { ChoreographyStepDef } from "../types.js";
import { STRUCTURAL_ACTIONS } from "../types.js";
import {
  getChoreographyState,
  selectChoreography,
  selectChoreographyStep,
  subscribeChoreography,
} from "../state/choreography-state.js";
import { subscribeWiring } from "../state/wiring-state.js";
import { ACTION_COLORS, SIGNAL_TYPE_COLORS } from "../views/step-commands.js";
import { attachPillDragBehavior, DRAGGABLE_ACTIONS } from "./step-drag.js";

// ---------------------------------------------------------------------------
// Action icons (same as step-chain.ts)
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
// Init
// ---------------------------------------------------------------------------

/** Wired actions (above). */
let wiredEl: HTMLElement | null = null;
/** Unwired actions (below). */
let unwiredEl: HTMLElement | null = null;
let initialized = false;

/** Initialize the vertical connector bar inside the choreo→visual rail. */
export function initConnectorBarV(): void {
  if (initialized) return;
  initialized = true;

  const rail = document.getElementById("rail-choreographer-visual");
  if (!rail) return;

  const badgesContainer = rail.querySelector(".pl-rail-badges");

  // Wired section — above badges
  wiredEl = document.createElement("div");
  wiredEl.className = "pl-rail-sources";

  // Unwired section — below badges
  unwiredEl = document.createElement("div");
  unwiredEl.className = "pl-rail-sources pl-rail-sources--inactive";

  if (badgesContainer) {
    rail.insertBefore(wiredEl, badgesContainer);
    if (badgesContainer.nextSibling) {
      rail.insertBefore(unwiredEl, badgesContainer.nextSibling);
    } else {
      rail.appendChild(unwiredEl);
    }
  } else {
    rail.appendChild(wiredEl);
    rail.appendChild(unwiredEl);
  }

  subscribeChoreography(render);
  subscribeWiring(render);
  render();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Collected action info for a badge. */
interface ActionBadgeInfo {
  choreoId: string;
  choreoOn: string;
  step: ChoreographyStepDef;
}

function render(): void {
  const { choreographies } = getChoreographyState();

  const wiredActions: ActionBadgeInfo[] = [];
  const unwiredActions: ActionBadgeInfo[] = [];

  for (const choreo of choreographies) {
    // Only show actions from racks that have steps
    if (choreo.steps.length === 0) continue;

    const hasTarget = !!choreo.defaultTargetEntityId;
    const target = hasTarget ? wiredActions : unwiredActions;

    for (const step of choreo.steps) {
      // Skip structural actions (parallel, onArrive, onInterrupt)
      if (STRUCTURAL_ACTIONS.includes(step.action)) continue;
      target.push({ choreoId: choreo.id, choreoOn: choreo.on, step });
    }
  }

  // Wired (above, active)
  if (wiredEl) {
    wiredEl.innerHTML = "";
    wiredEl.style.display = wiredActions.length === 0 ? "none" : "";
    for (const info of wiredActions) {
      wiredEl.appendChild(createActionBadge(info, true));
    }
  }

  // Unwired (below, inactive)
  if (unwiredEl) {
    unwiredEl.innerHTML = "";
    unwiredEl.style.display = unwiredActions.length === 0 ? "none" : "";
    for (const info of unwiredActions) {
      unwiredEl.appendChild(createActionBadge(info, false));
    }
  }
}

/** Create an action badge element. */
function createActionBadge(
  info: ActionBadgeInfo,
  wired: boolean,
): HTMLButtonElement {
  const { choreoId, choreoOn, step } = info;

  const badge = document.createElement("button");
  badge.className = "pl-rail-badge";

  // Data attributes for the drag-connect system
  badge.dataset.wireZone = "choreographer";
  badge.dataset.wireId = step.id;
  badge.dataset.choreoId = choreoId;

  if (wired) {
    badge.classList.add("pl-rail-badge--active");
  } else {
    badge.classList.add("pl-rail-badge--inactive");
  }

  const color = ACTION_COLORS[step.action] ?? "#6E6E8A";
  const signalColor = SIGNAL_TYPE_COLORS[choreoOn] ?? "#6E6E8A";

  // Action icon
  const icon = document.createElement("span");
  icon.className = "pl-rail-badge-dot";
  icon.style.background = wired ? color : "#6E6E8A";
  icon.textContent = ACTION_ICONS[step.action] ?? "";
  icon.style.fontSize = "9px";
  icon.style.lineHeight = "8px";
  icon.style.textAlign = "center";
  badge.appendChild(icon);

  // Label: "action" (compact)
  const label = document.createElement("span");
  label.className = "pl-rail-badge-label";
  label.textContent = step.action;
  badge.appendChild(label);

  // Thin colored stripe on the left edge to indicate signal type origin
  badge.style.borderLeftColor = signalColor;
  badge.style.borderLeftWidth = "2px";
  badge.style.borderLeftStyle = "solid";

  badge.title = `${step.action} (${choreoOn})${wired ? " — wired" : " — drag to entity"}`;

  // Drag-to-entity for draggable actions
  if (DRAGGABLE_ACTIONS.has(step.action)) {
    attachPillDragBehavior(badge, step, choreoId);
  }

  badge.addEventListener("click", () => {
    selectChoreography(choreoId);
    selectChoreographyStep(step.id);
  });

  return badge;
}
