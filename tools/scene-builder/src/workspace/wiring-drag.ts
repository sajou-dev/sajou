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
 * Level 2 binding: choreographer output → entity on canvas (cross-rideau drag).
 * When dropping on an entity, a contextual menu lets the user pick the target property.
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
  updateEditorState,
} from "../state/editor-state.js";
import { getSceneState, updateSceneState } from "../state/scene-state.js";
import { getEntityStore } from "../state/entity-store.js";
import { setPreviewWire, type PreviewWire } from "./wiring-overlay.js";
import { getActiveBarHSource } from "./connector-bar-horizontal.js";
import { screenToScene } from "../canvas/canvas.js";
import { hitTestAnyEntity } from "../tools/hit-test.js";
import { showBindingDropMenu } from "./binding-drop-menu.js";
import { updateChoreographyCmd } from "../views/step-commands.js";

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
  /** Parent choreography ID (when dragging an action badge from the V-bar). */
  choreoId: string | null;
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
    // Source badges no longer initiate drags — color-coding suffices
    return;
  } else if (zone === "signal-type") {
    // Signal-type → choreo binding is now implicit (rack model).
    // Drag-from-rail to create racks is handled by rack-drag.ts.
    return;
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
    choreoId: badge.dataset.choreoId ?? null,
  };

  // Add dragging class to badge
  badge.classList.add("connector-badge--dragging");
  document.body.style.cursor = "crosshair";

  // Highlight valid drop targets
  highlightTargets(targetZone, true);

  // Level 2: notify canvas to highlight actor entities during choreo→theme drags
  if (targetZone === "theme") {
    updateEditorState({ bindingDragActive: true });
  }
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

  // Check if hovering over a valid DOM target badge
  const targetBadge = findTargetBadgeAt(e.clientX, e.clientY, session.targetZone);
  updateTargetHighlight(session.targetZone, targetBadge);

  // Level 2: when dragging choreo→theme, also hit-test entities on canvas
  if (session.targetZone === "theme") {
    const themeZone = document.getElementById("zone-theme");
    if (themeZone) {
      const rect = themeZone.getBoundingClientRect();
      const inThemeZone = e.clientX >= rect.left && e.clientX <= rect.right
        && e.clientY >= rect.top && e.clientY <= rect.bottom;

      if (inThemeZone) {
        const scenePos = screenToScene(e);
        const hit = hitTestAnyEntity(scenePos.x, scenePos.y);
        updateEditorState({ bindingDropHighlightId: hit?.placedId ?? null });
      } else {
        updateEditorState({ bindingDropHighlightId: null });
      }
    }
  }
}

function onMouseUp(e: MouseEvent): void {
  if (!session) return;

  const { fromZone, fromId, targetZone, fromBadge } = session;

  // Clean up drag state
  fromBadge.classList.remove("connector-badge--dragging");
  document.body.style.cursor = "";
  highlightTargets(targetZone, false);
  setPreviewWire(null);

  // Level 2: clear binding drag highlight
  if (targetZone === "theme") {
    updateEditorState({ bindingDragActive: false, bindingDropHighlightId: null });
  }

  // Check if released on a valid DOM target badge
  const targetBadge = findTargetBadgeAt(e.clientX, e.clientY, targetZone);
  if (targetBadge) {
    const toId = targetBadge.dataset.wireId;
    if (toId) {
      // Create signal-type→choreographer (or other) wire if it doesn't exist
      const wireExists = hasWire(fromZone, fromId, targetZone, toId);
      if (!wireExists) {
        addWire({
          fromZone: fromZone as "signal" | "signal-type" | "choreographer",
          fromId,
          toZone: targetZone as "signal-type" | "choreographer" | "theme",
          toId,
        });
      }

      // Auto-create signal→signal-type wire for 2-hop provenance.
      // This runs INDEPENDENTLY of the above guard so that after import
      // (where signal-type→choreo wires exist but signal→signal-type
      // wires are ephemeral and excluded), re-dragging still connects
      // the active source.
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

      // Auto-transition interfaceState (only on first wire creation)
      if (!wireExists) {
        autoTransition(fromZone, targetZone);
      }
    }
    session = null;
    return;
  }

  // Level 2: if no DOM badge hit and targeting theme, try entity hit-test
  if (targetZone === "theme" && fromZone === "choreographer") {
    // Resolve the choreography ID: use choreoId from the badge (rack model),
    // falling back to fromId for backward compat (legacy node model).
    const effectiveChoreoId = session?.choreoId ?? fromId;

    const scenePos = screenToScene(e);
    const hit = hitTestAnyEntity(scenePos.x, scenePos.y);
    if (hit) {
      // Auto-assign Actor ID if the entity doesn't have one yet
      let semanticId: string = hit.semanticId ?? "";
      if (!semanticId) {
        semanticId = generateSemanticId(hit.entityId);
        const { entities } = getSceneState();
        updateSceneState({
          entities: entities.map((ent) =>
            ent.id === hit.placedId
              ? { ...ent, semanticId }
              : ent,
          ),
        });
      }

      // Gather entity info for the drop menu
      const { entities } = getSceneState();
      const placed = entities.find((ent) => ent.id === hit.placedId);
      const entityStore = getEntityStore();
      const def = placed ? entityStore.entities[placed.entityId] : undefined;
      const hasTopo = !!(placed?.topology && placed.topology.waypoints.length > 0);

      // Get animation states (spritesheet only)
      const animationStates: string[] = [];
      if (def && def.visual.type === "spritesheet") {
        animationStates.push(...Object.keys(def.visual.animations));
      }

      // Assign this entity as the choreography's default target
      updateChoreographyCmd(effectiveChoreoId, { defaultTargetEntityId: semanticId });

      // Show contextual binding menu at drop point
      showBindingDropMenu({
        x: e.clientX,
        y: e.clientY,
        choreographyId: effectiveChoreoId,
        targetSemanticId: semanticId,
        hasTopology: hasTopo,
        animationStates,
      });
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

// ---------------------------------------------------------------------------
// Auto Actor ID
// ---------------------------------------------------------------------------

/**
 * Generate a unique semantic ID for an entity that doesn't have one yet.
 * Uses the entityId as base (e.g. "refugee-2") and appends a suffix if
 * another entity already uses that semantic ID.
 */
function generateSemanticId(entityId: string): string {
  const { entities } = getSceneState();
  const usedIds = new Set<string>();
  for (const ent of entities) {
    if (ent.semanticId) usedIds.add(ent.semanticId);
  }

  // Try base entityId first
  if (!usedIds.has(entityId)) return entityId;

  // Append incrementing suffix
  let i = 2;
  while (usedIds.has(`${entityId}-${i}`)) i++;
  return `${entityId}-${i}`;
}

