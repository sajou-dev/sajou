/**
 * Editor UI state.
 *
 * Transient state: active tool, selection, panel positions, grid settings.
 * Not saved to the scene file.
 */

import type { EditorState, PanelId, PanelLayout, ToolId, ViewId } from "../types.js";

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

function defaultPanelLayout(x: number, y: number, w: number, h: number): PanelLayout {
  return { x, y, width: w, height: h, visible: false };
}

function createDefault(): EditorState {
  return {
    currentView: "visual",
    activeTool: "select",
    selectedIds: [],
    selectedPositionIds: [],
    selectedRouteIds: [],
    panelLayouts: {
      "entity-palette": defaultPanelLayout(60, 60, 250, 400),
      "asset-manager": defaultPanelLayout(100, 80, 500, 450),
      "entity-editor": defaultPanelLayout(150, 80, 500, 450),
      inspector: defaultPanelLayout(window.innerWidth - 310, 60, 280, 350),
      layers: defaultPanelLayout(window.innerWidth - 310, 430, 280, 300),
      settings: defaultPanelLayout(200, 100, 320, 250),
      "signal-timeline": defaultPanelLayout(120, 100, 480, 520),
    },
    gridEnabled: true,
    gridSize: 32,
    snapToGrid: true,
    placingEntityId: null,
    activeLayerId: "midground",
    routeCreationPreview: null,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: EditorState = createDefault();
const listeners: Listener[] = [];

/** Get current editor state. */
export function getEditorState(): EditorState {
  return state;
}

/** Replace the entire editor state and notify. */
export function setEditorState(next: EditorState): void {
  state = next;
  notify();
}

/** Partially update editor state (shallow merge) and notify. */
export function updateEditorState(partial: Partial<EditorState>): void {
  state = { ...state, ...partial };
  notify();
}

/** Set the active workspace view (Signal / Orchestrator / Visual). */
export function setActiveView(view: ViewId): void {
  state = { ...state, currentView: view };
  notify();
}

/** Set the active tool. */
export function setActiveTool(tool: ToolId): void {
  state = { ...state, activeTool: tool };
  notify();
}

/** Set selected element IDs. */
export function setSelection(ids: string[]): void {
  state = { ...state, selectedIds: ids };
  notify();
}

/** Toggle a panel's visibility. */
export function togglePanel(panelId: PanelId): void {
  const layouts = { ...state.panelLayouts };
  layouts[panelId] = { ...layouts[panelId], visible: !layouts[panelId].visible };
  state = { ...state, panelLayouts: layouts };
  notify();
}

/** Ensure a panel is visible (show without toggling). */
export function showPanel(panelId: PanelId): void {
  const layouts = { ...state.panelLayouts };
  if (layouts[panelId].visible) return;
  layouts[panelId] = { ...layouts[panelId], visible: true };
  state = { ...state, panelLayouts: layouts };
  notify();
}

/** Update a panel's layout (position/size). */
export function updatePanelLayout(panelId: PanelId, partial: Partial<PanelLayout>): void {
  const layouts = { ...state.panelLayouts };
  layouts[panelId] = { ...layouts[panelId], ...partial };
  state = { ...state, panelLayouts: layouts };
  notify();
}

/** Set the entity to place on next canvas click. */
export function setPlacingEntity(id: string | null): void {
  state = { ...state, placingEntityId: id };
  notify();
}

/** Set the active layer for new content placement. */
export function setActiveLayer(layerId: string | null): void {
  state = { ...state, activeLayerId: layerId };
  notify();
}

/** Set selected position IDs (position tool). */
export function setPositionSelection(ids: string[]): void {
  state = { ...state, selectedPositionIds: ids };
  notify();
}

/** Set selected route IDs (route tool). */
export function setRouteSelection(ids: string[]): void {
  state = { ...state, selectedRouteIds: ids };
  notify();
}

/** Toggle grid visibility. */
export function toggleGrid(): void {
  state = { ...state, gridEnabled: !state.gridEnabled };
  notify();
}

/** Set grid cell size (clamped 4–128). */
export function setGridSize(size: number): void {
  state = { ...state, gridSize: Math.max(4, Math.min(128, size)) };
  notify();
}

/** Enable or disable snap-to-grid. */
export function setSnapToGrid(enabled: boolean): void {
  state = { ...state, snapToGrid: enabled };
  notify();
}

/** Subscribe to editor state changes. Returns unsubscribe function. */
export function subscribeEditor(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}
