/**
 * Wiring drag — drag-to-connect interaction for the patch bay.
 *
 * `mousedown` on a connector badge starts a drag. A dashed preview wire
 * follows the cursor. Valid drop targets highlight on hover. Releasing on
 * a valid target creates a WireConnection; releasing elsewhere cancels.
 *
 * Three wire directions (TouchDesigner-style):
 *   - signal badge → signal-type badge (intra bar-H: "this source feeds this channel")
 *   - signal-type badge → choreographer node input (vertical: "this channel triggers this choreo")
 *   - choreographer output → theme (vertical: "this choreo sends to theme")
 *
 * Auto-transitions: first signal-type->choreo wire moves interfaceState to 2,
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
import { getActiveBarHSource } from "./connector-bar-horizontal.js";

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
  /** Expected destination zone. */
  targetZone: WireZone;
  /** Active source at drag start (for auto-creating signal→signal-type wires). */
  sourceContext: string | null;
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

  // Determine target zone based on source badge zone
  let targetZone: WireZone;

  if (zone === "signal") {
    // Source badge (on bar-H) → drag to a signal-type badge (intra bar-H)
    targetZone = "signal-type";
  } else if (zone === "signal-type") {
    // Signal type badge (on bar-H) → drag down to a choreographer node input
    targetZone = "choreographer";
  } else if (zone === "choreographer") {
    // Could be on H-bar (not draggable) or a node output port / V-bar badge
    const isOnHBar = badge.closest(".connector-bar-h") !== null;
    if (isOnHBar) {
      // Choreo badges on the H-bar are targets, not drag sources
      return;
    }
    targetZone = "theme";
  } else {
    // Theme badges — can't initiate from theme side for now
    return;
  }

  session = {
    fromBadge: badge,
    fromZone: zone,
    fromId: id,
    targetZone,
    sourceContext: getActiveBarHSource(),
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
    fromZone: session.fromZone,
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
        fromZone: fromZone as "signal" | "signal-type" | "choreographer",
        fromId,
        toZone: targetZone as "signal-type" | "choreographer" | "theme",
        toId,
      });

      // If dragging signal-type → choreographer and a source is active,
      // also create signal → signal-type wire (2-hop provenance)
      const src = session?.sourceContext;
      if (fromZone === "signal-type" && targetZone === "choreographer"
          && src && !hasWire("signal", src, "signal-type", fromId)) {
        addWire({
          fromZone: "signal",
          fromId: src,
          toZone: "signal-type",
          toId: fromId,
        });
      }

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
 * signal-type->choreo → state 2, choreo->theme → state 3.
 */
function autoTransition(fromZone: WireZone, toZone: WireZone): void {
  const { interfaceState } = getEditorState();
  const { wires } = getWiringState();

  if (fromZone === "signal-type" && toZone === "choreographer" && interfaceState < 2) {
    // Check if this is the first signal-type->choreo wire
    const typeChoreoWires = wires.filter((w) => w.fromZone === "signal-type" && w.toZone === "choreographer");
    if (typeChoreoWires.length >= 1) {
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
