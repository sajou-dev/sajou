/**
 * Action drop menu — radial menu for step-pill drop-to-entity configuration.
 *
 * When a step pill is dropped onto a canvas entity, this menu shows the
 * available parameter options for that specific action:
 *   - setAnimation → animation states from the entity's spritesheet
 *   - move/fly → named positions + signal refs (signal.to, signal.from)
 *   - spawn → named positions + signal refs
 *   - destroy/flash → no menu needed (handled directly by step-drag.ts)
 *
 * Reuses the .radial-* CSS classes from binding-drop-menu.
 */

import { getSceneState } from "../state/scene-state.js";
import { getEntityStore } from "../state/entity-store.js";
import { updateStepCmd } from "../views/step-commands.js";
import type { SpritesheetVisual } from "../types.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let menuEl: HTMLElement | null = null;
let cleanupFn: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionDropMenuOptions {
  /** Client X of the drop point. */
  x: number;
  /** Client Y of the drop point. */
  y: number;
  /** Choreography ID containing the step. */
  choreoId: string;
  /** Step ID to configure. */
  stepId: string;
  /** Action type of the step. */
  action: string;
  /** Semantic ID of the target entity. */
  targetSemanticId: string;
  /** Placed ID of the target entity. */
  targetPlacedId: string;
}

/** A single radial menu item. */
interface RadialItem {
  label: string;
  icon: string;
  isSignalRef?: boolean;
  onClick: () => void;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const RING_RADIUS = 100;
const ITEM_SIZE = 56;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Show the radial action menu at the drop point. */
export function showActionDropMenu(options: ActionDropMenuOptions): void {
  hideActionDropMenu();

  const items = buildItems(options);
  if (items.length === 0) {
    // No items available — just assign entity directly
    updateStepCmd(options.choreoId, options.stepId, { entity: options.targetSemanticId });
    return;
  }

  const { x, y } = options;

  // Full-viewport overlay
  const overlay = document.createElement("div");
  overlay.className = "radial-overlay";

  // Ring container
  const ring = document.createElement("div");
  ring.className = "radial-ring";
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;

  // Center dot
  const center = document.createElement("div");
  center.className = "radial-center";
  ring.appendChild(center);

  // Place items around the ring
  const count = items.length;
  const startAngle = -Math.PI / 2;

  for (let i = 0; i < count; i++) {
    const item = items[i]!;
    const angle = startAngle + (2 * Math.PI * i) / count;
    const ix = Math.cos(angle) * RING_RADIUS;
    const iy = Math.sin(angle) * RING_RADIUS;

    const btn = document.createElement("button");
    btn.className = "radial-item";
    btn.style.left = `${ix - ITEM_SIZE / 2}px`;
    btn.style.top = `${iy - ITEM_SIZE / 2}px`;
    btn.title = item.label;

    const iconSpan = document.createElement("span");
    iconSpan.className = "radial-item-icon";
    iconSpan.textContent = item.icon;

    const labelSpan = document.createElement("span");
    labelSpan.className = "radial-item-label";
    labelSpan.textContent = item.label;
    if (item.isSignalRef) {
      labelSpan.style.fontStyle = "italic";
    }

    btn.appendChild(iconSpan);
    btn.appendChild(labelSpan);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      item.onClick();
      hideActionDropMenu();
    });

    ring.appendChild(btn);
  }

  overlay.appendChild(ring);
  document.body.appendChild(overlay);
  menuEl = overlay;

  // Animate in
  requestAnimationFrame(() => {
    ring.classList.add("radial-ring--open");
  });

  // Close on overlay click or Escape
  const onOverlayClick = (e: MouseEvent) => {
    if (e.target === overlay) hideActionDropMenu();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") hideActionDropMenu();
  };

  overlay.addEventListener("mousedown", onOverlayClick);
  document.addEventListener("keydown", onKeyDown);

  cleanupFn = () => {
    overlay.removeEventListener("mousedown", onOverlayClick);
    document.removeEventListener("keydown", onKeyDown);
  };
}

/** Hide and remove the radial action menu. */
export function hideActionDropMenu(): void {
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
}

// ---------------------------------------------------------------------------
// Item builders
// ---------------------------------------------------------------------------

/** Build radial items based on the step's action type and target entity. */
function buildItems(options: ActionDropMenuOptions): RadialItem[] {
  const { action, choreoId, stepId, targetSemanticId, targetPlacedId } = options;

  switch (action) {
    case "setAnimation":
      return buildAnimationItems(choreoId, stepId, targetSemanticId, targetPlacedId);
    case "move":
    case "fly":
      return buildPositionItems(choreoId, stepId, targetSemanticId, "to");
    case "spawn":
      return buildPositionItems(choreoId, stepId, targetSemanticId, "at");
    case "followRoute":
      return buildRouteItems(choreoId, stepId, targetSemanticId);
    default:
      return [];
  }
}

/** Build items for setAnimation: one per animation state in the entity's spritesheet. */
function buildAnimationItems(
  choreoId: string,
  stepId: string,
  semanticId: string,
  placedId: string,
): RadialItem[] {
  const { entities } = getSceneState();
  const placed = entities.find((e) => e.id === placedId);
  if (!placed) return [];

  const entityStore = getEntityStore();
  const def = entityStore.entities[placed.entityId];
  if (!def || def.visual.type !== "spritesheet") return [];

  const visual = def.visual as SpritesheetVisual;
  const states = Object.keys(visual.animations);

  return states.map((state) => ({
    label: state,
    icon: "\u25B6", // ▶
    onClick: () => {
      updateStepCmd(choreoId, stepId, {
        entity: semanticId,
        params: { state },
      });
    },
  }));
}

/** Build items for move/fly/spawn: named positions + signal refs. */
function buildPositionItems(
  choreoId: string,
  stepId: string,
  semanticId: string,
  paramKey: string,
): RadialItem[] {
  const items: RadialItem[] = [];

  // Signal refs
  const signalRefs = paramKey === "at"
    ? [{ ref: "signal.from", label: "signal.from" }]
    : [
      { ref: "signal.to", label: "signal.to" },
      { ref: "signal.from", label: "signal.from" },
    ];

  for (const { ref, label } of signalRefs) {
    items.push({
      label,
      icon: "\u2197", // ↗
      isSignalRef: true,
      onClick: () => {
        updateStepCmd(choreoId, stepId, {
          entity: semanticId,
          params: { [paramKey]: ref },
        });
      },
    });
  }

  // Named scene positions
  const { positions } = getSceneState();
  for (const pos of positions) {
    items.push({
      label: pos.name || pos.id,
      icon: "\u25C9", // ◉
      onClick: () => {
        updateStepCmd(choreoId, stepId, {
          entity: semanticId,
          params: { [paramKey]: pos.name || pos.id },
        });
      },
    });
  }

  return items;
}

/** Build items for followRoute: one per scene route. */
function buildRouteItems(
  choreoId: string,
  stepId: string,
  semanticId: string,
): RadialItem[] {
  const { routes } = getSceneState();

  return routes.map((route) => ({
    label: route.name || route.id,
    icon: "\u21DD", // ⇝
    onClick: () => {
      updateStepCmd(choreoId, stepId, {
        entity: semanticId,
        params: { route: route.name || route.id },
      });
    },
  }));
}
