/**
 * Place tool.
 *
 * Active when the user has selected an entity from the palette
 * and clicks on the canvas to place an instance. Supports grid snapping
 * and undo via executeCommand().
 */

import type { CanvasToolHandler } from "../canvas/canvas.js";
import { getEditorState, setPlacingEntity } from "../state/editor-state.js";
import { getSceneState, updateSceneState } from "../state/scene-state.js";
import { getEntityStore } from "../state/entity-store.js";
import { executeCommand } from "../state/undo.js";
import { snap } from "./snap.js";
import type { PlacedEntity, UndoableCommand, SceneLayer } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique placed entity ID. */
function generatePlacedId(entityId: string): string {
  return `${entityId}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/** Find the active layer definition, or null if missing/locked. */
function getActiveLayer(): SceneLayer | null {
  const { activeLayerId } = getEditorState();
  if (!activeLayerId) return null;
  const { layers } = getSceneState();
  return layers.find((l) => l.id === activeLayerId) ?? null;
}

/** Create the Place tool handler. */
export function createPlaceTool(): CanvasToolHandler {
  return {
    onMouseDown(_e: MouseEvent, scenePos: { x: number; y: number }) {
      const { placingEntityId } = getEditorState();
      if (!placingEntityId) return;

      // Block placement if active layer is locked or hidden
      const activeLayer = getActiveLayer();
      if (!activeLayer || activeLayer.locked || !activeLayer.visible) return;

      const entityDef = getEntityStore().entities[placingEntityId];
      if (!entityDef) return;

      const x = snap(scenePos.x);
      const y = snap(scenePos.y);

      // Auto-increment zIndex: place on top of existing entities in this layer
      const { entities: existing } = getSceneState();
      const maxZ = existing
        .filter((e) => e.layerId === activeLayer.id)
        .reduce((m, e) => Math.max(m, e.zIndex), -1);

      const placed: PlacedEntity = {
        id: generatePlacedId(placingEntityId),
        entityId: placingEntityId,
        x,
        y,
        scale: entityDef.defaults.scale ?? 1,
        rotation: 0,
        layerId: activeLayer.id,
        zIndex: maxZ + 1,
        opacity: entityDef.defaults.opacity ?? 1,
        flipH: false,
        flipV: false,
        locked: false,
        visible: true,
        activeState: getDefaultState(entityDef),
      };

      const cmd: UndoableCommand = {
        execute() {
          const { entities } = getSceneState();
          updateSceneState({ entities: [...entities, placed] });
        },
        undo() {
          const { entities } = getSceneState();
          updateSceneState({ entities: entities.filter((e) => e.id !== placed.id) });
        },
        description: `Place ${placingEntityId}`,
      };

      executeCommand(cmd);

      // Keep placing mode active (user can click again to place more)
      // If they want to stop, they press Escape or switch tool
    },
  };
}

/** Get the default active state name for an entity. */
function getDefaultState(entityDef: { visual: { type: string; animations?: Record<string, unknown> } }): string {
  if (entityDef.visual.type === "spritesheet" && entityDef.visual.animations) {
    const keys = Object.keys(entityDef.visual.animations);
    return keys[0] ?? "default";
  }
  return "default";
}

/** Keyboard handler: Escape cancels placement. */
export function initPlaceToolKeyboard(): void {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const { placingEntityId, activeTool } = getEditorState();
      if (activeTool === "place" && placingEntityId) {
        setPlacingEntity(null);
      }
    }
  });
}
