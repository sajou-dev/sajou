/**
 * Light tool.
 *
 * Click to create point light sources on the scene.
 * Click to select existing lights, drag to move them.
 * Delete key removes selected lights.
 * All mutations go through the undo system.
 */

import type { CanvasToolHandler } from "../canvas/canvas.js";
import {
  getEditorState,
  setLightSelection,
  showPanel,
} from "../state/editor-state.js";
import {
  getSceneState,
  addLightSource,
  updateLightSource,
  removeLightSource,
  updateSceneState,
} from "../state/scene-state.js";
import { executeCommand } from "../state/undo.js";
import { snap } from "./snap.js";
import type { LightSourceState, UndoableCommand } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hit-test radius for light markers (in scene pixels). */
const HIT_RADIUS = 14;

/** Default radius for new point lights. */
const DEFAULT_RADIUS = 120;

/** Default intensity for new point lights. */
const DEFAULT_INTENSITY = 1.5;

/** Color palette for auto-assigned light colors (warm/cool mix). */
const LIGHT_COLORS = [
  "#FFA040", // warm orange
  "#FFD080", // soft gold
  "#80C0FF", // cool blue
  "#FF8060", // warm coral
  "#A0FFD0", // cool mint
];

// ---------------------------------------------------------------------------
// Hit-testing
// ---------------------------------------------------------------------------

/** Hit-test against light markers. Returns the topmost hit ID or null. */
function hitTestLight(sx: number, sy: number): string | null {
  const { lighting } = getSceneState();

  for (let i = lighting.sources.length - 1; i >= 0; i--) {
    const light = lighting.sources[i]!;
    const dx = sx - light.x;
    const dy = sy - light.y;
    if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
      return light.id;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let colorIndex = 0;

/** Generate a unique light ID. */
function generateLightId(): string {
  return `light-${Date.now().toString(36)}`;
}

/** Get the next auto-assigned color from the palette. */
function nextColor(): string {
  const color = LIGHT_COLORS[colorIndex % LIGHT_COLORS.length]!;
  colorIndex++;
  return color;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/** Create the Light tool handler. */
export function createLightTool(): CanvasToolHandler {
  let dragging = false;
  let dragId: string | null = null;
  let dragStart = { x: 0, y: 0 };
  let dragStartPos = { x: 0, y: 0 };

  return {
    onMouseDown(e: MouseEvent, scenePos: { x: number; y: number }) {
      const hitId = hitTestLight(scenePos.x, scenePos.y);
      const { selectedLightIds } = getEditorState();

      if (hitId) {
        // Select the light
        if (e.ctrlKey || e.metaKey) {
          if (selectedLightIds.includes(hitId)) {
            setLightSelection(selectedLightIds.filter((id) => id !== hitId));
          } else {
            setLightSelection([...selectedLightIds, hitId]);
          }
        } else if (!selectedLightIds.includes(hitId)) {
          setLightSelection([hitId]);
        }

        showPanel("lighting");

        // Start drag
        const { lighting } = getSceneState();
        const light = lighting.sources.find((s) => s.id === hitId);
        if (light) {
          dragging = true;
          dragId = hitId;
          dragStart = { x: scenePos.x, y: scenePos.y };
          dragStartPos = { x: light.x, y: light.y };
        }
      } else {
        // Click on empty space — create a new light
        if (!e.ctrlKey && !e.metaKey) {
          const x = snap(scenePos.x);
          const y = snap(scenePos.y);

          const newLight: LightSourceState = {
            id: generateLightId(),
            x,
            y,
            color: nextColor(),
            intensity: DEFAULT_INTENSITY,
            radius: DEFAULT_RADIUS,
          };

          const cmd: UndoableCommand = {
            execute() {
              addLightSource(newLight);
            },
            undo() {
              removeLightSource([newLight.id]);
            },
            description: `Create light "${newLight.id}"`,
          };
          executeCommand(cmd);

          setLightSelection([newLight.id]);
          showPanel("lighting");
        }
      }
    },

    onMouseMove(_e: MouseEvent, scenePos: { x: number; y: number }) {
      if (!dragging || !dragId) return;

      const dx = scenePos.x - dragStart.x;
      const dy = scenePos.y - dragStart.y;

      const newX = snap(dragStartPos.x + dx);
      const newY = snap(dragStartPos.y + dy);

      updateLightSource(dragId, { x: newX, y: newY });
    },

    onMouseUp() {
      if (!dragging || !dragId) {
        dragging = false;
        return;
      }

      const { lighting } = getSceneState();
      const light = lighting.sources.find((s) => s.id === dragId);
      const moved = light && (light.x !== dragStartPos.x || light.y !== dragStartPos.y);

      if (moved && light) {
        const finalX = light.x;
        const finalY = light.y;
        const startX = dragStartPos.x;
        const startY = dragStartPos.y;
        const movedId = dragId;

        const cmd: UndoableCommand = {
          execute() {
            updateLightSource(movedId, { x: finalX, y: finalY });
          },
          undo() {
            updateLightSource(movedId, { x: startX, y: startY });
          },
          description: `Move light "${movedId}"`,
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

/** Initialize Light tool keyboard shortcuts (Delete, Escape). */
export function initLightToolKeyboard(): void {
  document.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    const { activeTool, selectedLightIds } = getEditorState();
    if (activeTool !== "light") return;

    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedLightIds.length === 0) return;
      e.preventDefault();

      const idsToRemove = [...selectedLightIds];
      const { lighting } = getSceneState();
      const removedLights = lighting.sources.filter((s) => idsToRemove.includes(s.id));

      const cmd: UndoableCommand = {
        execute() {
          removeLightSource(idsToRemove);
          setLightSelection([]);
        },
        undo() {
          const { lighting: current } = getSceneState();
          updateSceneState({
            lighting: {
              ...current,
              sources: [...current.sources, ...removedLights],
            },
          });
          setLightSelection(idsToRemove);
        },
        description: `Delete ${idsToRemove.length} light(s)`,
      };
      executeCommand(cmd);
    }

    if (e.key === "Escape") {
      setLightSelection([]);
    }
  });
}
