/**
 * Binding drop menu — radial / OPie-style.
 *
 * Contextual pie menu that appears when the user drops a choreographer output
 * wire onto an entity in the scene (cross-rideau drag). Bindable properties
 * are arranged in a ring around the drop point. Click one to create a binding.
 *
 * Behaviour:
 *   - Items fan out radially from the drop point.
 *   - Hover highlights the slice.
 *   - Click creates the binding and closes the menu.
 *   - Click outside or Escape closes without creating.
 */

import { addBinding } from "../state/binding-store.js";
import type { BindingValueType } from "../types.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let menuEl: HTMLElement | null = null;
let cleanupFn: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Property definitions
// ---------------------------------------------------------------------------

interface RadialItem {
  /** Property key for the binding. */
  key: string;
  /** Short display label. */
  label: string;
  /** Icon character (emoji or symbol). */
  icon: string;
  /** Inferred source type when this property is selected. */
  sourceType: BindingValueType;
  /** Optional action payload (for animation states). */
  action?: { animationDuring: string };
}

/** Build the list of radial items based on entity capabilities. */
function buildItems(
  hasTopology: boolean,
  animationStates: string[],
): RadialItem[] {
  const items: RadialItem[] = [];

  // Topological actions first (most common intent for game entities)
  if (hasTopology) {
    items.push({ key: "moveTo:waypoint", label: "Move To", icon: "\u279C", sourceType: "event" });
    items.push({ key: "followRoute", label: "Follow Route", icon: "\u21BB", sourceType: "event" });
    items.push({ key: "teleportTo", label: "Teleport", icon: "\u26A1", sourceType: "event" });
  }

  // Animation states (spritesheet)
  for (const state of animationStates) {
    items.push({
      key: "animation.state",
      label: state,
      icon: "\u25B6",
      sourceType: "event",
      action: { animationDuring: state },
    });
  }

  // Core spatial/visual properties
  items.push({ key: "position.x", label: "Pos X", icon: "\u2194", sourceType: "float" });
  items.push({ key: "position.y", label: "Pos Y", icon: "\u2195", sourceType: "float" });
  items.push({ key: "rotation", label: "Rotation", icon: "\u21BB", sourceType: "float" });
  items.push({ key: "scale", label: "Scale", icon: "\u2922", sourceType: "float" });
  items.push({ key: "opacity", label: "Opacity", icon: "\u25D1", sourceType: "float" });
  items.push({ key: "visible", label: "Visible", icon: "\u25C9", sourceType: "bool" });

  return items;
}

// ---------------------------------------------------------------------------
// Geometry constants
// ---------------------------------------------------------------------------

/** Radius of the item ring from center (px). */
const RING_RADIUS = 100;

/** Size of each item button (px). */
const ITEM_SIZE = 56;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BindingDropMenuOptions {
  /** Client X of the drop point. */
  x: number;
  /** Client Y of the drop point. */
  y: number;
  /** Source choreography ID. */
  choreographyId: string;
  /** Target entity semantic ID. */
  targetSemanticId: string;
  /** Whether the entity has topology (waypoints/routes). */
  hasTopology: boolean;
  /** Animation state names if entity is a spritesheet (empty for static). */
  animationStates: string[];
}

/** Show the radial binding menu at the drop point. */
export function showBindingDropMenu(options: BindingDropMenuOptions): void {
  hideBindingDropMenu();

  const {
    x, y,
    choreographyId,
    targetSemanticId,
    hasTopology,
    animationStates,
  } = options;

  const items = buildItems(hasTopology, animationStates);
  if (items.length === 0) return;

  // Container — covers the full viewport to capture clicks outside
  const overlay = document.createElement("div");
  overlay.className = "radial-overlay";

  // Ring container — positioned at the drop point
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
  const startAngle = -Math.PI / 2; // 12 o'clock

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

    btn.appendChild(iconSpan);
    btn.appendChild(labelSpan);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      addBinding({
        targetEntityId: targetSemanticId,
        property: item.key,
        sourceChoreographyId: choreographyId,
        sourceType: item.sourceType,
        ...(item.action ? { action: item.action } : {}),
      });
      hideBindingDropMenu();
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
    if (e.target === overlay) {
      hideBindingDropMenu();
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      hideBindingDropMenu();
    }
  };

  overlay.addEventListener("mousedown", onOverlayClick);
  document.addEventListener("keydown", onKeyDown);

  cleanupFn = () => {
    overlay.removeEventListener("mousedown", onOverlayClick);
    document.removeEventListener("keydown", onKeyDown);
  };
}

/** Hide and remove the radial binding menu. */
export function hideBindingDropMenu(): void {
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
}
