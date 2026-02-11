/**
 * Wiring drag — drag-to-connect interaction for the patch bay.
 *
 * `mousedown` on a connector badge starts a drag. A dashed preview wire
 * follows the cursor. Valid drop targets highlight on hover. Releasing on
 * a valid target creates a WireConnection; releasing elsewhere cancels.
 *
 * Auto-transitions: first signal->choreo wire moves interfaceState to 2,
 * first choreo->theme wire moves it to 3.
 */

import {
  addWire,
  getWiringState,
  hasWire,
  type WireZone,
} from "../state/wiring-state.js";
import {
  getEditorState,
  setInterfaceState,
} from "../state/editor-state.js";
import { setPreviewWire, type PreviewWire } from "./wiring-overlay.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Describes a drag in progress. */
interface DragSession {
  /** The badge element drag started from. */
  fromBadge: HTMLElement;
  /** Zone of the source badge. */
  fromZone: WireZone;
  /** Endpoint ID of the source badge. */
  fromId: string;
  /** Direction of the wire being dragged. */
  direction: "horizontal" | "vertical";
  /** Expected destination zone. */
  targetZone: WireZone;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let session: DragSession | null = null;
let initialized = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize the wiring drag interaction. Call once after DOM is ready. */
export function initWiringDrag(): void {
  if (initialized) return;
  initialized = true;

  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function onMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return;

  // Check if click target is a connector badge (or child of one)
  const badge = findBadgeAncestor(e.target as HTMLElement);
  if (!badge) return;

  const zone = badge.dataset.wireZone as WireZone | undefined;
  const id = badge.dataset.wireId;
  if (!zone || !id) return;

  e.preventDefault();
  e.stopPropagation();

  // Determine drag direction and target zone
  let direction: "horizontal" | "vertical";
  let targetZone: WireZone;

  if (zone === "signal") {
    direction = "horizontal";
    targetZone = "choreographer";
  } else if (zone === "choreographer") {
    // Could be on H-bar (target from signal) or V-bar (target for theme)
    // Check if badge is in the horizontal bar or vertical bar
    const isOnHBar = badge.closest(".connector-bar-h") !== null;
    if (isOnHBar) {
      // Badge is a choreography endpoint on the H-bar — can't drag from it
      // H-bar badges are signal sources; choreo targets are on V-bar
      return;
    }
    direction = "vertical";
    targetZone = "theme";
  } else {
    // Theme badges — can't initiate from theme side for now
    return;
  }

  session = {
    fromBadge: badge,
    fromZone: zone,
    fromId: id,
    direction,
    targetZone,
  };

  // Add dragging class to badge
  badge.classList.add("connector-badge--dragging");
  document.body.style.cursor = "crosshair";

  // Highlight valid drop targets
  highlightTargets(targetZone, true);
}

function onMouseMove(e: MouseEvent): void {
  if (!session) return;

  // Update preview wire
  const preview: PreviewWire = {
    fromBadge: session.fromBadge,
    direction: session.direction,
    cursorX: e.clientX,
    cursorY: e.clientY,
  };
  setPreviewWire(preview);

  // Check if hovering over a valid target
  const targetBadge = findTargetBadgeAt(e.clientX, e.clientY, session.targetZone);
  updateTargetHighlight(session.targetZone, targetBadge);
}

function onMouseUp(e: MouseEvent): void {
  if (!session) return;

  const { fromZone, fromId, targetZone, fromBadge } = session;

  // Clean up drag state
  fromBadge.classList.remove("connector-badge--dragging");
  document.body.style.cursor = "";
  highlightTargets(targetZone, false);
  setPreviewWire(null);

  // Check if released on a valid target
  const targetBadge = findTargetBadgeAt(e.clientX, e.clientY, targetZone);
  if (targetBadge) {
    const toId = targetBadge.dataset.wireId;
    if (toId && !hasWire(fromZone, fromId, targetZone, toId)) {
      // Create wire
      addWire({
        fromZone: fromZone as "signal" | "choreographer",
        fromId,
        toZone: targetZone as "choreographer" | "theme",
        toId,
      });

      // Auto-transition interfaceState
      autoTransition(fromZone, targetZone);
    }
  }

  session = null;
}

// ---------------------------------------------------------------------------
// Auto-transition
// ---------------------------------------------------------------------------

/**
 * Progress the interfaceState when first wires are created.
 * signal->choreo → state 2, choreo->theme → state 3.
 */
function autoTransition(fromZone: WireZone, toZone: WireZone): void {
  const { interfaceState } = getEditorState();
  const { wires } = getWiringState();

  if (fromZone === "signal" && toZone === "choreographer" && interfaceState < 2) {
    // Check if this is the first signal->choreo wire
    const signalChoreoWires = wires.filter((w) => w.fromZone === "signal" && w.toZone === "choreographer");
    if (signalChoreoWires.length >= 1) {
      setInterfaceState(2);
    }
  }

  if (fromZone === "choreographer" && toZone === "theme" && interfaceState < 3) {
    // Check if this is the first choreo->theme wire
    const choreoThemeWires = wires.filter((w) => w.fromZone === "choreographer" && w.toZone === "theme");
    if (choreoThemeWires.length >= 1) {
      setInterfaceState(3);
    }
  }
}

// ---------------------------------------------------------------------------
// Target highlighting
// ---------------------------------------------------------------------------

/** Add/remove highlight class on all badges in the target zone. */
function highlightTargets(zone: WireZone, highlight: boolean): void {
  const badges = document.querySelectorAll(`[data-wire-zone="${zone}"]`);
  for (const badge of badges) {
    if (highlight) {
      (badge as HTMLElement).classList.add("connector-badge--drop-target");
    } else {
      (badge as HTMLElement).classList.remove("connector-badge--drop-target");
      (badge as HTMLElement).classList.remove("connector-badge--drop-hover");
    }
  }
}

/** Update which target badge is hovered (only one at a time). */
function updateTargetHighlight(zone: WireZone, hoveredBadge: HTMLElement | null): void {
  const badges = document.querySelectorAll(`[data-wire-zone="${zone}"]`);
  for (const badge of badges) {
    if (badge === hoveredBadge) {
      (badge as HTMLElement).classList.add("connector-badge--drop-hover");
    } else {
      (badge as HTMLElement).classList.remove("connector-badge--drop-hover");
    }
  }
}

// ---------------------------------------------------------------------------
// Badge lookup helpers
// ---------------------------------------------------------------------------

/** Walk up the DOM to find a badge with `data-wire-zone`. */
function findBadgeAncestor(el: HTMLElement | null): HTMLElement | null {
  let current = el;
  while (current) {
    if (current.dataset.wireZone && current.dataset.wireId) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Find a target badge at the given cursor position.
 * Uses `elementsFromPoint` to find badges under the cursor.
 */
function findTargetBadgeAt(x: number, y: number, zone: WireZone): HTMLElement | null {
  const elements = document.elementsFromPoint(x, y);
  for (const el of elements) {
    const badge = findBadgeAncestor(el as HTMLElement);
    if (badge && badge.dataset.wireZone === zone && badge.dataset.wireId) {
      return badge;
    }
  }
  return null;
}
