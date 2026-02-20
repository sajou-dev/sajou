/**
 * Route mode.
 *
 * Click position A then click position B to create a route.
 * Renders as dashed line between positions.
 */

import { getState, updateState } from "../../app-state.js";
import { getCanvasContainer, canvasCoords, isPanning } from "../scene-canvas.js";
import { executeCommand } from "../undo-manager.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let firstPosition: string | null = null;
let routeCounter = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hit-test for positions (12px radius). */
function hitTestPosition(px: number, py: number): string | null {
  const positions = getState().scene.positions;
  for (const [name, pos] of Object.entries(positions)) {
    const dx = px - pos.x;
    const dy = py - pos.y;
    if (dx * dx + dy * dy < 144) return name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/** Handle click to select start/end positions for a route. */
function handleMouseDown(e: MouseEvent): void {
  const state = getState();
  if (state.activeTab !== "scene" || state.sceneEditor.mode !== "routes") return;
  if (isPanning()) return;

  const { x, y } = canvasCoords(e);
  const hitName = hitTestPosition(x, y);

  if (!hitName) {
    firstPosition = null;
    return;
  }

  if (!firstPosition) {
    // First click: select start position
    firstPosition = hitName;
    updateState({
      sceneEditor: { ...state.sceneEditor, selectedIds: [hitName], selectedType: "position" },
    });
    return;
  }

  // Second click: create route
  if (firstPosition === hitName) {
    firstPosition = null;
    return;
  }

  // Check for existing route
  const exists = state.scene.routes.some(
    (r) => (r.from === firstPosition && r.to === hitName) || (r.from === hitName && r.to === firstPosition),
  );
  if (exists) {
    firstPosition = null;
    return;
  }

  routeCounter++;
  const routeId = `r${Date.now()}-${routeCounter}`;
  const from = firstPosition;
  const to = hitName;

  executeCommand({
    description: `Add route ${from} → ${to}`,
    execute() {
      const s = getState();
      const route = { id: routeId, from, to };
      updateState({
        scene: { ...s.scene, routes: [...s.scene.routes, route] },
        sceneEditor: { ...s.sceneEditor, selectedIds: [routeId], selectedType: "route" },
      });
    },
    undo() {
      const s = getState();
      updateState({
        scene: { ...s.scene, routes: s.scene.routes.filter((r) => r.id !== routeId) },
        sceneEditor: { ...s.sceneEditor, selectedIds: [], selectedType: null },
      });
    },
  });

  firstPosition = null;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize route mode. */
export function initRouteMode(): void {
  const container = getCanvasContainer();
  container.addEventListener("mousedown", handleMouseDown);
}
