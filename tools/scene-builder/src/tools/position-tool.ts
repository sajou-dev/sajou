/**
 * Position tool.
 *
 * Click to create semantic position markers on the scene.
 * Click to select existing positions, drag to move them.
 * Delete key removes selected positions.
 * All mutations go through the undo system.
 */

import type { CanvasToolHandler } from "../canvas/canvas.js";
import {
  getEditorState,
  setPositionSelection,
  showPanel,
} from "../state/editor-state.js";
import {
  getSceneState,
  updateSceneState,
} from "../state/scene-state.js";
import { executeCommand } from "../state/undo.js";
import { snap } from "./snap.js";
import { showGuideLines, hideGuideLines, snapToCenter } from "./guide-lines.js";
import type { ScenePosition, UndoableCommand } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hit-test radius for position markers (in scene pixels). */
const HIT_RADIUS = 12;

/** Color palette for auto-assigned position colors. */
const POSITION_COLORS = [
  "#E8A851",
  "#58a6ff",
  "#7ee787",
  "#f778ba",
  "#d2a8ff",
  "#ffa657",
  "#79c0ff",
  "#ff7b72",
];

// ---------------------------------------------------------------------------
// Hit-testing
// ---------------------------------------------------------------------------

/** Hit-test against position markers. Returns the topmost hit ID or null. */
function hitTestPosition(sx: number, sy: number): string | null {
  const { positions } = getSceneState();

  // Iterate in reverse (last = topmost)
  for (let i = positions.length - 1; i >= 0; i--) {
    const pos = positions[i]!;
    const dx = sx - pos.x;
    const dy = sy - pos.y;
    if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
      return pos.id;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique position ID. */
function generatePositionId(): string {
  return `pos-${Date.now().toString(36)}`;
}

/** Get the next auto-assigned color from the palette. */
function nextColor(): string {
  const { positions } = getSceneState();
  return POSITION_COLORS[positions.length % POSITION_COLORS.length]!;
}

/** Get the next default position name. */
function nextName(): string {
  const { positions } = getSceneState();
  return `position-${positions.length + 1}`;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/** Create the Position tool handler. */
export function createPositionTool(): CanvasToolHandler {
  let dragging = false;
  let dragId: string | null = null;
  let dragStart = { x: 0, y: 0 };
  let dragStartPos = { x: 0, y: 0 };

  return {
    onMouseDown(e: MouseEvent, scenePos: { x: number; y: number }) {
      const hitId = hitTestPosition(scenePos.x, scenePos.y);
      const { selectedPositionIds } = getEditorState();

      if (hitId) {
        // Select the position
        if (e.ctrlKey || e.metaKey) {
          if (selectedPositionIds.includes(hitId)) {
            setPositionSelection(selectedPositionIds.filter((id) => id !== hitId));
          } else {
            setPositionSelection([...selectedPositionIds, hitId]);
          }
        } else if (!selectedPositionIds.includes(hitId)) {
          setPositionSelection([hitId]);
        }

        showPanel("inspector");

        // Start drag
        const { positions } = getSceneState();
        const pos = positions.find((p) => p.id === hitId);
        if (pos) {
          dragging = true;
          dragId = hitId;
          dragStart = { x: scenePos.x, y: scenePos.y };
          dragStartPos = { x: pos.x, y: pos.y };
          showGuideLines();
        }
      } else {
        // Click on empty space — create a new position
        if (!e.ctrlKey && !e.metaKey) {
          const x = snap(scenePos.x);
          const y = snap(scenePos.y);

          const newPos: ScenePosition = {
            id: generatePositionId(),
            name: nextName(),
            x,
            y,
            color: nextColor(),
            typeHint: "generic",
          };

          const cmd: UndoableCommand = {
            execute() {
              const { positions } = getSceneState();
              updateSceneState({ positions: [...positions, newPos] });
            },
            undo() {
              const { positions } = getSceneState();
              updateSceneState({ positions: positions.filter((p) => p.id !== newPos.id) });
            },
            description: `Create position "${newPos.name}"`,
          };
          executeCommand(cmd);

          // Select the new position
          setPositionSelection([newPos.id]);
          showPanel("inspector");
        }
      }
    },

    onMouseMove(_e: MouseEvent, scenePos: { x: number; y: number }) {
      if (!dragging || !dragId) return;

      const dx = scenePos.x - dragStart.x;
      const dy = scenePos.y - dragStart.y;

      const gridSnapped = {
        x: snap(dragStartPos.x + dx),
        y: snap(dragStartPos.y + dy),
      };
      const centered = snapToCenter(gridSnapped.x, gridSnapped.y);

      const { positions } = getSceneState();
      updateSceneState({
        positions: positions.map((p) =>
          p.id === dragId ? { ...p, x: centered.x, y: centered.y } : p,
        ),
      });
    },

    onMouseUp() {
      hideGuideLines();
      if (!dragging || !dragId) {
        dragging = false;
        return;
      }

      // Check if actually moved
      const { positions } = getSceneState();
      const pos = positions.find((p) => p.id === dragId);
      const moved = pos && (pos.x !== dragStartPos.x || pos.y !== dragStartPos.y);

      if (moved && pos) {
        const finalX = pos.x;
        const finalY = pos.y;
        const startX = dragStartPos.x;
        const startY = dragStartPos.y;
        const movedId = dragId;

        const cmd: UndoableCommand = {
          execute() {
            const { positions: current } = getSceneState();
            updateSceneState({
              positions: current.map((p) =>
                p.id === movedId ? { ...p, x: finalX, y: finalY } : p,
              ),
            });
          },
          undo() {
            const { positions: current } = getSceneState();
            updateSceneState({
              positions: current.map((p) =>
                p.id === movedId ? { ...p, x: startX, y: startY } : p,
              ),
            });
          },
          description: `Move position "${pos.name}"`,
        };
        // Already applied live, undo first then executeCommand to register
        cmd.undo();
        executeCommand(cmd);
      }

      dragging = false;
      dragId = null;
    },
  };
}

/** Initialize Position tool keyboard shortcuts (Delete, Escape). */
export function initPositionToolKeyboard(): void {
  document.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    const { activeTool, selectedPositionIds } = getEditorState();
    if (activeTool !== "position") return;

    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedPositionIds.length === 0) return;
      e.preventDefault();

      const idsToRemove = [...selectedPositionIds];
      const { positions } = getSceneState();
      const removedPositions = positions.filter((p) => idsToRemove.includes(p.id));

      const cmd: UndoableCommand = {
        execute() {
          const { positions: curP } = getSceneState();
          updateSceneState({
            positions: curP.filter((p) => !idsToRemove.includes(p.id)),
          });
          setPositionSelection([]);
        },
        undo() {
          const { positions: curP } = getSceneState();
          updateSceneState({
            positions: [...curP, ...removedPositions],
          });
          setPositionSelection(idsToRemove);
        },
        description: `Delete ${idsToRemove.length} position(s)`,
      };
      executeCommand(cmd);
    }

    if (e.key === "Escape") {
      setPositionSelection([]);
    }
  });
}
