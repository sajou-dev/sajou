/**
 * Particle tool.
 *
 * Click to create particle emitters on the scene.
 * Click to select existing emitters, drag to move them.
 * Delete key removes selected emitters.
 * All mutations go through the undo system.
 */

import type { CanvasToolHandler } from "../canvas/canvas.js";
import {
  getEditorState,
  setParticleSelection,
  showPanel,
} from "../state/editor-state.js";
import {
  getSceneState,
  addParticleEmitter,
  updateParticleEmitter,
  removeParticleEmitter,
  updateSceneState,
} from "../state/scene-state.js";
import { executeCommand } from "../state/undo.js";
import { snap } from "./snap.js";
import type { ParticleEmitterState, UndoableCommand } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hit-test radius for emitter markers (in scene pixels). */
const HIT_RADIUS = 14;

/** Default preset for new particle emitters. */
const DEFAULT_PRESET: Omit<ParticleEmitterState, "id" | "x" | "y"> = {
  sprite: "",
  type: "radial",
  count: 30,
  lifetime: [0.5, 1.5],
  velocity: { x: [-40, 40], y: [-40, 40] },
  direction: { x: 0, y: -1 },
  speed: [20, 60],
  colorOverLife: ["#FFA040", "#FF6020", "#FF2000"],
  size: [4, 8],
  glow: true,
};

// ---------------------------------------------------------------------------
// Hit-testing
// ---------------------------------------------------------------------------

/** Hit-test against emitter markers. Returns the topmost hit ID or null. */
function hitTestEmitter(sx: number, sy: number): string | null {
  const { particles } = getSceneState();

  for (let i = particles.length - 1; i >= 0; i--) {
    const em = particles[i]!;
    const dx = sx - em.x;
    const dy = sy - em.y;
    if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
      return em.id;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique emitter ID. */
function generateEmitterId(): string {
  return `particle-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/** Create the Particle tool handler. */
export function createParticleTool(): CanvasToolHandler {
  let dragging = false;
  let dragId: string | null = null;
  let dragStart = { x: 0, y: 0 };
  let dragStartPos = { x: 0, y: 0 };

  return {
    onMouseDown(e: MouseEvent, scenePos: { x: number; y: number }) {
      const hitId = hitTestEmitter(scenePos.x, scenePos.y);
      const { selectedParticleIds } = getEditorState();

      if (hitId) {
        // Select the emitter
        if (e.ctrlKey || e.metaKey) {
          if (selectedParticleIds.includes(hitId)) {
            setParticleSelection(selectedParticleIds.filter((id) => id !== hitId));
          } else {
            setParticleSelection([...selectedParticleIds, hitId]);
          }
        } else if (!selectedParticleIds.includes(hitId)) {
          setParticleSelection([hitId]);
        }

        showPanel("particles");

        // Start drag
        const { particles } = getSceneState();
        const emitter = particles.find((p) => p.id === hitId);
        if (emitter) {
          dragging = true;
          dragId = hitId;
          dragStart = { x: scenePos.x, y: scenePos.y };
          dragStartPos = { x: emitter.x, y: emitter.y };
        }
      } else {
        // Click on empty space — create a new emitter
        if (!e.ctrlKey && !e.metaKey) {
          const x = snap(scenePos.x);
          const y = snap(scenePos.y);

          const newEmitter: ParticleEmitterState = {
            id: generateEmitterId(),
            x,
            y,
            ...DEFAULT_PRESET,
          };

          const cmd: UndoableCommand = {
            execute() {
              addParticleEmitter(newEmitter);
            },
            undo() {
              removeParticleEmitter([newEmitter.id]);
            },
            description: `Create particle emitter "${newEmitter.id}"`,
          };
          executeCommand(cmd);

          setParticleSelection([newEmitter.id]);
          showPanel("particles");
        }
      }
    },

    onMouseMove(_e: MouseEvent, scenePos: { x: number; y: number }) {
      if (!dragging || !dragId) return;

      const dx = scenePos.x - dragStart.x;
      const dy = scenePos.y - dragStart.y;

      const newX = snap(dragStartPos.x + dx);
      const newY = snap(dragStartPos.y + dy);

      updateParticleEmitter(dragId, { x: newX, y: newY });
    },

    onMouseUp() {
      if (!dragging || !dragId) {
        dragging = false;
        return;
      }

      const { particles } = getSceneState();
      const emitter = particles.find((p) => p.id === dragId);
      const moved = emitter && (emitter.x !== dragStartPos.x || emitter.y !== dragStartPos.y);

      if (moved && emitter) {
        const finalX = emitter.x;
        const finalY = emitter.y;
        const startX = dragStartPos.x;
        const startY = dragStartPos.y;
        const movedId = dragId;

        const cmd: UndoableCommand = {
          execute() {
            updateParticleEmitter(movedId, { x: finalX, y: finalY });
          },
          undo() {
            updateParticleEmitter(movedId, { x: startX, y: startY });
          },
          description: `Move particle emitter "${movedId}"`,
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

/** Initialize Particle tool keyboard shortcuts (Delete, Escape). */
export function initParticleToolKeyboard(): void {
  document.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    const { activeTool, selectedParticleIds } = getEditorState();
    if (activeTool !== "particle") return;

    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedParticleIds.length === 0) return;
      e.preventDefault();

      const idsToRemove = [...selectedParticleIds];
      const { particles } = getSceneState();
      const removedEmitters = particles.filter((p) => idsToRemove.includes(p.id));

      const cmd: UndoableCommand = {
        execute() {
          removeParticleEmitter(idsToRemove);
          setParticleSelection([]);
        },
        undo() {
          const current = getSceneState();
          updateSceneState({
            particles: [...current.particles, ...removedEmitters],
          });
          setParticleSelection(idsToRemove);
        },
        description: `Delete ${idsToRemove.length} particle emitter(s)`,
      };
      executeCommand(cmd);
    }

    if (e.key === "Escape") {
      setParticleSelection([]);
    }
  });
}
