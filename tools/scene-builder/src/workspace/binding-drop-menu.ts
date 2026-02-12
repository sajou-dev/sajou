/**
 * Binding drop menu.
 *
 * Contextual popup that appears when the user drops a choreographer output
 * wire onto an entity in the scene (cross-rideau drag). Lists bindable
 * properties: animation states first (for spritesheets), then generic
 * spatial/visual/topological properties.
 *
 * Selecting an item creates an EntityBinding via the binding store.
 */

import { addBinding } from "../state/binding-store.js";
import type { BindingValueType } from "../types.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let menuEl: HTMLElement | null = null;
let cleanupFn: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Property definitions for the menu
// ---------------------------------------------------------------------------

interface MenuProperty {
  /** Property key for the binding. */
  key: string;
  /** Display label. */
  label: string;
  /** Inferred source type when this property is selected. */
  sourceType: BindingValueType;
  /** Category for grouping. */
  category: "animation" | "spatial" | "visual" | "topological";
}

/** Static list of generic bindable properties shown in the menu. */
const GENERIC_PROPERTIES: readonly MenuProperty[] = [
  // Spatial
  { key: "position.x", label: "Position X", sourceType: "float", category: "spatial" },
  { key: "position.y", label: "Position Y", sourceType: "float", category: "spatial" },
  { key: "rotation", label: "Rotation", sourceType: "float", category: "spatial" },
  { key: "scale", label: "Scale", sourceType: "float", category: "spatial" },
  // Visual
  { key: "opacity", label: "Opacity", sourceType: "float", category: "visual" },
  { key: "visible", label: "Visible", sourceType: "bool", category: "visual" },
  { key: "zIndex", label: "Z-Index", sourceType: "int", category: "visual" },
];

/** Topological properties (only shown if entity has topology). */
const TOPO_PROPERTIES: readonly MenuProperty[] = [
  { key: "moveTo:waypoint", label: "Move To", sourceType: "event", category: "topological" },
  { key: "followRoute", label: "Follow Route", sourceType: "event", category: "topological" },
  { key: "teleportTo", label: "Teleport To", sourceType: "event", category: "topological" },
];

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

/** Show the binding drop menu at the drop point. */
export function showBindingDropMenu(options: BindingDropMenuOptions): void {
  // Close any existing menu first
  hideBindingDropMenu();

  const {
    x, y,
    choreographyId,
    targetSemanticId,
    hasTopology,
    animationStates,
  } = options;

  // Build the menu element
  const menu = document.createElement("div");
  menu.className = "binding-drop-menu";

  // Animation states section (spritesheet only)
  if (animationStates.length > 0) {
    const header = document.createElement("div");
    header.className = "bdm-header";
    header.textContent = "Animation";
    menu.appendChild(header);

    for (const state of animationStates) {
      const item = createItem(`\u25B6 ${state}`, () => {
        addBinding({
          targetEntityId: targetSemanticId,
          property: "animation.state",
          sourceChoreographyId: choreographyId,
          sourceType: "event",
          action: { animationDuring: state },
        });
        hideBindingDropMenu();
      });
      menu.appendChild(item);
    }

    // Separator
    const sep = document.createElement("div");
    sep.className = "bdm-separator";
    menu.appendChild(sep);
  }

  // Generic properties
  const propHeader = document.createElement("div");
  propHeader.className = "bdm-header";
  propHeader.textContent = "Properties";
  menu.appendChild(propHeader);

  for (const prop of GENERIC_PROPERTIES) {
    const item = createItem(prop.label, () => {
      addBinding({
        targetEntityId: targetSemanticId,
        property: prop.key,
        sourceChoreographyId: choreographyId,
        sourceType: prop.sourceType,
      });
      hideBindingDropMenu();
    });
    menu.appendChild(item);
  }

  // Topological properties (if entity has topology)
  if (hasTopology) {
    const topoSep = document.createElement("div");
    topoSep.className = "bdm-separator";
    menu.appendChild(topoSep);

    const topoHeader = document.createElement("div");
    topoHeader.className = "bdm-header";
    topoHeader.textContent = "Topology";
    menu.appendChild(topoHeader);

    for (const prop of TOPO_PROPERTIES) {
      const item = createItem(prop.label, () => {
        addBinding({
          targetEntityId: targetSemanticId,
          property: prop.key,
          sourceChoreographyId: choreographyId,
          sourceType: prop.sourceType,
        });
        hideBindingDropMenu();
      });
      menu.appendChild(item);
    }
  }

  // Position the menu — clamp to viewport
  document.body.appendChild(menu);
  const menuRect = menu.getBoundingClientRect();
  const clampedX = Math.min(x, window.innerWidth - menuRect.width - 8);
  const clampedY = Math.min(y, window.innerHeight - menuRect.height - 8);
  menu.style.left = `${Math.max(4, clampedX)}px`;
  menu.style.top = `${Math.max(4, clampedY)}px`;

  menuEl = menu;

  // Close on click-outside or Escape
  const onClickOutside = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      hideBindingDropMenu();
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      hideBindingDropMenu();
    }
  };

  // Delay adding click listener to avoid the same mouseup closing it
  requestAnimationFrame(() => {
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
  });

  cleanupFn = () => {
    document.removeEventListener("mousedown", onClickOutside);
    document.removeEventListener("keydown", onKeyDown);
  };
}

/** Hide and remove the binding drop menu. */
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Create a clickable menu item. */
function createItem(label: string, onClick: () => void): HTMLElement {
  const item = document.createElement("div");
  item.className = "bdm-item";
  item.textContent = label;
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return item;
}
