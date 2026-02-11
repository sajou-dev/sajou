/**
 * Canvas drop handler.
 *
 * Accepts drag-and-drop of assets from the Asset Manager panel
 * onto the canvas. Auto-creates a minimal entity definition (if needed)
 * and places an instance at the drop position on the active layer.
 *
 * The entire operation is a single compound UndoableCommand.
 */

import { getAssetByPath } from "../state/asset-store.js";
import { setEntity, removeEntity } from "../state/entity-store.js";
import { getEditorState } from "../state/editor-state.js";
import { getSceneState, updateSceneState } from "../state/scene-state.js";
import { executeCommand } from "../state/undo.js";
import { screenToScene, getCanvasContainer } from "./canvas.js";
import { findEntityForAsset, createEntityFromAsset } from "../tools/auto-entity.js";
import type { PlacedEntity, UndoableCommand, SceneLayer } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers (same patterns as place-tool.ts)
// ---------------------------------------------------------------------------

/** Snap a value to the grid if snapping is enabled. */
function snap(value: number): number {
  const { snapToGrid, gridSize } = getEditorState();
  if (!snapToGrid) return value;
  return Math.round(value / gridSize) * gridSize;
}

/** Generate a unique placed entity ID. */
function generatePlacedId(entityId: string): string {
  return `${entityId}-${Date.now().toString(36)}`;
}

/** Get the active layer if it's usable (exists, visible, unlocked). */
function getUsableActiveLayer(): SceneLayer | null {
  const { activeLayerId } = getEditorState();
  if (!activeLayerId) return null;
  const { layers } = getSceneState();
  const layer = layers.find((l) => l.id === activeLayerId);
  if (!layer || layer.locked || !layer.visible) return null;
  return layer;
}

// ---------------------------------------------------------------------------
// Drop handler
// ---------------------------------------------------------------------------

/** Initialize drag-and-drop handling on the canvas container. */
export function initCanvasDropHandler(): void {
  const container = getCanvasContainer();

  // Accept only sajou-asset drags
  container.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("application/x-sajou-asset")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    container.classList.add("canvas-drop-active");
  });

  // Remove drop feedback when dragging out
  container.addEventListener("dragleave", (e) => {
    if (!container.contains(e.relatedTarget as Node)) {
      container.classList.remove("canvas-drop-active");
    }
  });

  // Handle the drop
  container.addEventListener("drop", (e) => {
    e.preventDefault();
    container.classList.remove("canvas-drop-active");

    const assetPath = e.dataTransfer?.getData("application/x-sajou-asset");
    if (!assetPath) return;

    const asset = getAssetByPath(assetPath);
    if (!asset) return;

    // Block if no usable active layer
    const activeLayer = getUsableActiveLayer();
    if (!activeLayer) return;

    // Find or create entity definition
    let entityDef = findEntityForAsset(assetPath);
    const isNewEntity = !entityDef;

    if (!entityDef) {
      entityDef = createEntityFromAsset(asset);
    }

    // Compute scene position from drop coordinates
    const scenePos = screenToScene(e);
    const x = snap(scenePos.x);
    const y = snap(scenePos.y);

    // Determine default active state
    let activeState = "default";
    if (entityDef.visual.type === "spritesheet") {
      const keys = Object.keys(entityDef.visual.animations);
      activeState = keys[0] ?? "default";
    }

    // Auto-increment zIndex: place on top of existing entities in this layer
    const { entities: existing } = getSceneState();
    const maxZ = existing
      .filter((e) => e.layerId === activeLayer.id)
      .reduce((m, e) => Math.max(m, e.zIndex), -1);

    // Build PlacedEntity
    const placed: PlacedEntity = {
      id: generatePlacedId(entityDef.id),
      entityId: entityDef.id,
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
      activeState,
    };

    // Capture for closure
    const capturedEntityDef = entityDef;
    const capturedEntityId = entityDef.id;

    // Compound undo command: create entity (if new) + place instance
    const cmd: UndoableCommand = {
      execute() {
        if (isNewEntity) {
          setEntity(capturedEntityId, capturedEntityDef);
        }
        const { entities } = getSceneState();
        updateSceneState({ entities: [...entities, placed] });
      },
      undo() {
        const { entities } = getSceneState();
        updateSceneState({ entities: entities.filter((e) => e.id !== placed.id) });
        if (isNewEntity) {
          removeEntity(capturedEntityId);
        }
      },
      description: isNewEntity
        ? `Auto-place ${capturedEntityId} (new entity)`
        : `Auto-place ${capturedEntityId}`,
    };

    executeCommand(cmd);
  });
}
