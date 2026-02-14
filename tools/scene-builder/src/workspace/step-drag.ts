/**
 * Step-pill drag-to-entity — drag a step pill onto a canvas entity to configure it.
 *
 * When the user drags a step pill (e.g. `setAnimation`, `move`, `fly`) and drops
 * it on an entity in the canvas, the step is auto-configured with that entity.
 * For actions that need extra params (animation state, target position), a radial
 * menu opens to complete the configuration.
 *
 * Click vs drag is distinguished by a 5px movement threshold:
 *   - Under threshold → normal click (popover opens)
 *   - Over threshold → drag mode activates, ghost pill follows cursor
 */

import type { ChoreographyStepDef } from "../types.js";
import { hitTestAnyEntity } from "../tools/hit-test.js";
import { screenToScene } from "../canvas/canvas.js";
import { updateEditorState } from "../state/editor-state.js";
import { getSceneState, updateSceneState } from "../state/scene-state.js";
import { updateStepCmd } from "../views/step-commands.js";
import { showActionDropMenu } from "./action-drop-menu.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Actions that support pill drag-to-entity configuration. */
export const DRAGGABLE_ACTIONS = new Set([
  "move", "fly", "spawn", "destroy", "flash", "setAnimation", "followRoute",
]);

/** Movement threshold (px) to distinguish click from drag. */
const DRAG_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Suppression flag — prevents click after drag
// ---------------------------------------------------------------------------

let suppressNextClick = false;

/** Returns true if the next click on a pill should be suppressed (post-drag). */
export function isStepDragSuppressed(): boolean {
  if (suppressNextClick) {
    suppressNextClick = false;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attach drag behavior to a step pill element.
 *
 * Adds a mousedown handler that detects drag intent (5px threshold) and
 * initiates ghost pill + entity highlighting. On drop, configures the step.
 */
export function attachPillDragBehavior(
  pill: HTMLElement,
  step: ChoreographyStepDef,
  choreoId: string,
): void {
  pill.addEventListener("mousedown", (startEvent) => {
    // Only left mouse button
    if (startEvent.button !== 0) return;

    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    let dragging = false;
    let ghost: HTMLElement | null = null;

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        // Enter drag mode
        dragging = true;
        suppressNextClick = true;

        // Create ghost pill
        ghost = pill.cloneNode(true) as HTMLElement;
        ghost.className = pill.className + " nc-step-drag-ghost";
        document.body.appendChild(ghost);

        // Activate entity highlighting (reuse binding drag overlay)
        updateEditorState({ bindingDragActive: true });
      }

      if (dragging && ghost) {
        // Move ghost to cursor
        ghost.style.left = `${e.clientX - 30}px`;
        ghost.style.top = `${e.clientY - 14}px`;

        // Hit-test entities
        const scenePos = screenToScene(e);
        const hit = hitTestAnyEntity(scenePos.x, scenePos.y);
        updateEditorState({
          bindingDragActive: true,
          bindingDropHighlightId: hit?.placedId ?? null,
        });
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      if (!dragging) return; // Was a click, not a drag

      // Cleanup ghost
      if (ghost) {
        ghost.remove();
        ghost = null;
      }

      // Reset editor state
      updateEditorState({ bindingDragActive: false, bindingDropHighlightId: null });

      // Check if we dropped on an entity
      const scenePos = screenToScene(e);
      const hit = hitTestAnyEntity(scenePos.x, scenePos.y);
      if (!hit) return;

      // Auto-assign semanticId if entity doesn't have one
      let semanticId = hit.semanticId ?? "";
      if (!semanticId) {
        semanticId = generateSemanticId(hit.entityId);
        const { entities } = getSceneState();
        updateSceneState({
          entities: entities.map((ent) =>
            ent.id === hit.placedId ? { ...ent, semanticId } : ent,
          ),
        });
      }

      // Actions that don't need a radial menu — configure directly
      if (step.action === "destroy") {
        updateStepCmd(choreoId, step.id, { entity: semanticId });
        return;
      }
      if (step.action === "flash") {
        updateStepCmd(choreoId, step.id, { target: semanticId });
        return;
      }

      // Actions with parameter choices — open radial menu
      showActionDropMenu({
        x: e.clientX,
        y: e.clientY,
        choreoId,
        stepId: step.id,
        action: step.action,
        targetSemanticId: semanticId,
        targetPlacedId: hit.placedId,
      });
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique semantic ID for an entity (same logic as wiring-drag). */
function generateSemanticId(entityId: string): string {
  const { entities } = getSceneState();
  const usedIds = new Set<string>();
  for (const ent of entities) {
    if (ent.semanticId) usedIds.add(ent.semanticId);
  }

  if (!usedIds.has(entityId)) return entityId;

  let i = 2;
  while (usedIds.has(`${entityId}-${i}`)) i++;
  return `${entityId}-${i}`;
}
