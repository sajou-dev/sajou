/**
 * Select tool.
 *
 * Click to select placed entities, drag to move them, marquee
 * selection on empty space. Delete key removes selected entities.
 * All mutations go through the undo system.
 */

import type { CanvasToolHandler } from "../canvas/canvas.js";
import { screenToScene, getCanvasContainer } from "../canvas/canvas.js";
import { snap } from "./snap.js";
import { showGuideLines, hideGuideLines, snapToCenter } from "./guide-lines.js";
import {
  getEditorState,
  updateEditorState,
  setSelection,
  showPanel,
} from "../state/editor-state.js";
import {
  getSceneState,
  updateSceneState,
} from "../state/scene-state.js";
import { getEntityStore, selectEntity } from "../state/entity-store.js";
import { executeCommand } from "../state/undo.js";
import { hitTestPosition, hitTestScreenSpace } from "./hit-test.js";
import type { EntityTopology, SceneLayer, UndoableCommand } from "../types.js";

// ---------------------------------------------------------------------------
// Hit-testing
// ---------------------------------------------------------------------------

/**
 * AABB hit-test against placed entities. Returns the topmost hit ID or null.
 *
 * In isometric mode, delegates to screen-space hit-testing (via MouseEvent)
 * so that billboard entities can be clicked on their standing sprite.
 * Falls back to scene-coordinate AABB if no screen hit is found.
 */
function hitTest(sx: number, sy: number, mouseEvent?: MouseEvent): string | null {
  // In iso mode, try screen-space hit-test first (handles billboards)
  if (mouseEvent) {
    const screenHit = hitTestScreenSpace(mouseEvent.clientX, mouseEvent.clientY);
    if (screenHit) return screenHit;
    // If iso returned no hit, we still check scene-space below
    // (only relevant for top-down mode or iso edge cases)
    if (getEditorState().viewMode === "isometric") return null;
  }

  const { entities, layers } = getSceneState();
  const entityStore = getEntityStore();

  // Build layer lookup for visibility/lock/order checks
  const layerMap = new Map<string, SceneLayer>();
  for (const l of layers) layerMap.set(l.id, l);

  // Sort by effective zIndex descending (topmost first)
  const sorted = [...entities].sort((a, b) => {
    const la = layerMap.get(a.layerId);
    const lb = layerMap.get(b.layerId);
    const za = (la?.order ?? 0) * 10000 + a.zIndex;
    const zb = (lb?.order ?? 0) * 10000 + b.zIndex;
    return zb - za;
  });

  for (const placed of sorted) {
    if (!placed.visible) continue;

    // Skip entities on hidden or locked layers
    const layer = layerMap.get(placed.layerId);
    if (layer && (!layer.visible || layer.locked)) continue;

    const def = entityStore.entities[placed.entityId];
    const w = (def?.displayWidth ?? 32) * placed.scale;
    const h = (def?.displayHeight ?? 32) * placed.scale;
    const ax = def?.defaults.anchor?.[0] ?? 0.5;
    const ay = def?.defaults.anchor?.[1] ?? 0.5;

    const left = placed.x - w * ax;
    const top = placed.y - h * ay;

    if (sx >= left && sx <= left + w && sy >= top && sy <= top + h) {
      return placed.id;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/** Create the Select tool handler. */
export function createSelectTool(): CanvasToolHandler {
  let dragging = false;
  let dragIds: string[] = [];
  let dragStartScene = { x: 0, y: 0 };
  let dragStartPositions: Map<string, { x: number; y: number }> = new Map();

  // Alt+drag topology association state
  let associating = false;
  let associateEntityId: string | null = null;
  let associateStart = { x: 0, y: 0 };

  return {
    onMouseDown(e: MouseEvent, scenePos: { x: number; y: number }) {
      // Alt+click: start topology association mode
      if (e.altKey) {
        const { selectedIds } = getEditorState();
        if (selectedIds.length === 1) {
          const { entities } = getSceneState();
          const placed = entities.find((ent) => ent.id === selectedIds[0]);
          if (placed?.semanticId) {
            associating = true;
            associateEntityId = placed.id;
            associateStart = { x: placed.x, y: placed.y };
            return;
          }
        }
      }

      const hitId = hitTest(scenePos.x, scenePos.y, e);
      const { selectedIds } = getEditorState();

      if (hitId) {
        if (e.ctrlKey || e.metaKey) {
          // Toggle selection
          if (selectedIds.includes(hitId)) {
            setSelection(selectedIds.filter((id) => id !== hitId));
          } else {
            setSelection([...selectedIds, hitId]);
          }
        } else if (!selectedIds.includes(hitId)) {
          setSelection([hitId]);
        }

        // Show inspector when selecting entities
        showPanel("inspector");

        // Start drag — only for unlocked entities
        const currentSelected = getEditorState().selectedIds;
        const { entities } = getSceneState();
        const draggable = currentSelected.filter((id) => {
          const placed = entities.find((e) => e.id === id);
          return placed && !placed.locked;
        });
        if (draggable.length > 0) {
          dragging = true;
          dragIds = draggable;
          dragStartScene = { x: scenePos.x, y: scenePos.y };
          dragStartPositions = new Map();
          for (const id of dragIds) {
            const placed = entities.find((e) => e.id === id);
            if (placed) {
              dragStartPositions.set(id, { x: placed.x, y: placed.y });
            }
          }
          showGuideLines();
        }
      } else {
        // Click on empty — clear selection
        if (!e.ctrlKey && !e.metaKey) {
          setSelection([]);
        }
      }
    },

    onMouseMove(_e: MouseEvent, scenePos: { x: number; y: number }) {
      // Alt+drag association preview
      if (associating) {
        updateEditorState({
          topologyAssociationPreview: {
            fromX: associateStart.x,
            fromY: associateStart.y,
            toX: scenePos.x,
            toY: scenePos.y,
          },
        });
        return;
      }

      if (!dragging || dragIds.length === 0) return;

      const dx = scenePos.x - dragStartScene.x;
      const dy = scenePos.y - dragStartScene.y;

      const { entities } = getSceneState();
      const updated = entities.map((e) => {
        const start = dragStartPositions.get(e.id);
        if (!start) return e;
        const gridSnapped = {
          x: snap(start.x + dx),
          y: snap(start.y + dy),
        };
        // Apply center-snap on top of grid-snap
        const centered = snapToCenter(gridSnapped.x, gridSnapped.y);
        return { ...e, x: centered.x, y: centered.y };
      });
      updateSceneState({ entities: updated });
    },

    onMouseUp(_e: MouseEvent, scenePos: { x: number; y: number }) {
      // Alt+drag association: complete
      if (associating && associateEntityId) {
        updateEditorState({ topologyAssociationPreview: null });

        const hitPosId = hitTestPosition(scenePos.x, scenePos.y);
        if (hitPosId) {
          const { entities } = getSceneState();
          const placed = entities.find((ent) => ent.id === associateEntityId);
          if (placed) {
            const currentTopo: EntityTopology = placed.topology ?? { waypoints: [] };
            let newTopo: EntityTopology;
            let description: string;

            if (!currentTopo.home) {
              // First association = set as home + add to waypoints
              const newWaypoints = currentTopo.waypoints.includes(hitPosId)
                ? currentTopo.waypoints
                : [...currentTopo.waypoints, hitPosId];
              newTopo = { ...currentTopo, home: hitPosId, waypoints: newWaypoints };
              description = "Set home waypoint";
            } else if (!currentTopo.waypoints.includes(hitPosId)) {
              // Add to accessible waypoints
              newTopo = { ...currentTopo, waypoints: [...currentTopo.waypoints, hitPosId] };
              description = "Add waypoint";
            } else {
              // Already there — no change
              associating = false;
              associateEntityId = null;
              return;
            }

            const entityId = associateEntityId;
            const snapshot: EntityTopology | undefined = placed.topology
              ? { ...placed.topology, waypoints: [...placed.topology.waypoints] }
              : undefined;

            const cmd: UndoableCommand = {
              execute() {
                const { entities: cur } = getSceneState();
                updateSceneState({
                  entities: cur.map((ent) =>
                    ent.id === entityId ? { ...ent, topology: newTopo } : ent,
                  ),
                });
              },
              undo() {
                const { entities: cur } = getSceneState();
                updateSceneState({
                  entities: cur.map((ent) =>
                    ent.id === entityId ? { ...ent, topology: snapshot } : ent,
                  ),
                });
              },
              description,
            };
            executeCommand(cmd);
          }
        }

        associating = false;
        associateEntityId = null;
        return;
      }

      hideGuideLines();
      if (!dragging || dragIds.length === 0) {
        dragging = false;
        return;
      }

      // Check if actually moved
      const { entities } = getSceneState();
      const movedAny = dragIds.some((id) => {
        const placed = entities.find((e) => e.id === id);
        const start = dragStartPositions.get(id);
        if (!placed || !start) return false;
        return placed.x !== start.x || placed.y !== start.y;
      });

      if (movedAny) {
        // Create undo command with final positions
        const finalPositions = new Map<string, { x: number; y: number }>();
        for (const id of dragIds) {
          const placed = entities.find((e) => e.id === id);
          if (placed) finalPositions.set(id, { x: placed.x, y: placed.y });
        }
        const startPositions = new Map(dragStartPositions);

        const cmd: UndoableCommand = {
          execute() {
            const { entities: current } = getSceneState();
            updateSceneState({
              entities: current.map((e) => {
                const pos = finalPositions.get(e.id);
                return pos ? { ...e, x: pos.x, y: pos.y } : e;
              }),
            });
          },
          undo() {
            const { entities: current } = getSceneState();
            updateSceneState({
              entities: current.map((e) => {
                const pos = startPositions.get(e.id);
                return pos ? { ...e, x: pos.x, y: pos.y } : e;
              }),
            });
          },
          description: `Move ${dragIds.length} entities`,
        };
        // We already applied the move live, so just push to undo stack
        // without re-executing. We do this by pushing it after the fact.
        // Since executeCommand would call execute() again, we push manually:
        // But that requires access to internals. Instead, undo first, then executeCommand.
        cmd.undo();
        executeCommand(cmd);
      }

      dragging = false;
      dragIds = [];
      dragStartPositions = new Map();
    },
  };
}

/** Initialize Select tool keyboard shortcuts (Delete, Escape) and double-click. */
export function initSelectToolKeyboard(): void {
  // Double-click on canvas → open Entity Editor for the clicked entity
  getCanvasContainer()?.addEventListener("dblclick", (e) => {
    const { activeTool } = getEditorState();
    if (activeTool !== "select") return;

    const scenePos = screenToScene(e);
    const hitId = hitTest(scenePos.x, scenePos.y, e);
    if (!hitId) return;

    // Find the PlacedEntity to get its entityId
    const { entities } = getSceneState();
    const placed = entities.find((ent) => ent.id === hitId);
    if (!placed) return;

    // Select the entity definition in the Entity Editor and show the panel
    selectEntity(placed.entityId);
    showPanel("entity-editor");
  });

  document.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    const { activeTool, selectedIds } = getEditorState();
    if (activeTool !== "select") return;

    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedIds.length === 0) return;
      e.preventDefault();

      const idsToRemove = [...selectedIds];
      const { entities } = getSceneState();
      const removed = entities.filter((e) => idsToRemove.includes(e.id));

      const cmd: UndoableCommand = {
        execute() {
          const { entities: current } = getSceneState();
          updateSceneState({
            entities: current.filter((e) => !idsToRemove.includes(e.id)),
          });
          setSelection([]);
        },
        undo() {
          const { entities: current } = getSceneState();
          updateSceneState({ entities: [...current, ...removed] });
          setSelection(idsToRemove);
        },
        description: `Delete ${idsToRemove.length} entities`,
      };
      executeCommand(cmd);
    }

    if (e.key === "Escape") {
      setSelection([]);
    }
  });
}
