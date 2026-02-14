/**
 * Scene data state.
 *
 * Holds the persistent scene data (placed entities, positions, routes, background).
 * Pub/sub pattern — subscribe to get notified on every change.
 */

import type { SceneState, ZoneTypeDef, ZoneGrid } from "../types.js";

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

/** Default zone types aligned with MCP server design §4. */
const DEFAULT_ZONE_TYPES: ZoneTypeDef[] = [
  { id: "command", name: "Command", description: "Centre de la base, point focal", color: "#E8A851", capacity: 2 },
  { id: "production", name: "Production", description: "Zone de production et artisanat", color: "#5B8DEF", capacity: 4 },
  { id: "perimeter", name: "Perimeter", description: "Défense et patrouille périmétrique", color: "#C44040", capacity: 6 },
  { id: "resource", name: "Resource", description: "Collecte et stockage de ressources", color: "#4EC9B0", capacity: 3 },
  { id: "sacred", name: "Sacred", description: "Zone rituelle, accès restreint", color: "#C586C0", capacity: 1 },
];

/** Default cell size for the zone grid. */
const DEFAULT_CELL_SIZE = 32;

/** Create an empty zone grid for given dimensions. */
function createZoneGrid(width: number, height: number, cellSize: number = DEFAULT_CELL_SIZE): ZoneGrid {
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  return { cellSize, cols, rows, cells: new Array(cols * rows).fill(null) as (string | null)[] };
}

function createDefault(): SceneState {
  return {
    dimensions: { width: 960, height: 640 },
    background: { color: "#1a1a2e" },
    layers: [
      { id: "background", name: "Background", order: 0, visible: true, locked: false },
      { id: "midground", name: "Midground", order: 1, visible: true, locked: false },
      { id: "foreground", name: "Foreground", order: 2, visible: true, locked: false },
    ],
    entities: [],
    positions: [],
    routes: [],
    zoneTypes: [...DEFAULT_ZONE_TYPES],
    zoneGrid: createZoneGrid(960, 640),
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: SceneState = createDefault();
const listeners: Listener[] = [];

/** Get current scene state (read-only reference). */
export function getSceneState(): SceneState {
  return state;
}

/** Replace the entire scene state and notify listeners. */
export function setSceneState(next: SceneState): void {
  state = next;
  notify();
}

/** Partially update the scene state (shallow merge) and notify listeners. */
export function updateSceneState(partial: Partial<SceneState>): void {
  state = { ...state, ...partial };
  notify();
}

/** Reset scene state to defaults. */
export function resetSceneState(): void {
  state = createDefault();
  notify();
}

/** Subscribe to scene state changes. Returns unsubscribe function. */
export function subscribeScene(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

// ---------------------------------------------------------------------------
// Zone helpers
// ---------------------------------------------------------------------------

/** Add a new zone type. */
export function addZoneType(partial: Partial<ZoneTypeDef> & { id: string }): void {
  const zt: ZoneTypeDef = {
    name: partial.name ?? partial.id,
    description: partial.description ?? "",
    color: partial.color ?? "#888888",
    capacity: partial.capacity ?? 4,
    ...partial,
  };
  state = { ...state, zoneTypes: [...state.zoneTypes, zt] };
  notify();
}

/** Update an existing zone type by ID (shallow merge). */
export function updateZoneType(id: string, partial: Partial<Omit<ZoneTypeDef, "id">>): void {
  state = {
    ...state,
    zoneTypes: state.zoneTypes.map((zt) => (zt.id === id ? { ...zt, ...partial } : zt)),
  };
  notify();
}

/** Remove a zone type by ID. Also clears any grid cells referencing it. */
export function removeZoneType(id: string): void {
  const grid = state.zoneGrid;
  const cells = grid.cells.map((c) => (c === id ? null : c));
  state = {
    ...state,
    zoneTypes: state.zoneTypes.filter((zt) => zt.id !== id),
    zoneGrid: { ...grid, cells },
  };
  notify();
}

/**
 * Resize the zone grid to match current scene dimensions.
 * Preserves existing cell values that fit within the new bounds.
 */
export function resizeZoneGrid(): void {
  const { dimensions, zoneGrid } = state;
  const cellSize = zoneGrid.cellSize;
  const newCols = Math.ceil(dimensions.width / cellSize);
  const newRows = Math.ceil(dimensions.height / cellSize);

  if (newCols === zoneGrid.cols && newRows === zoneGrid.rows) return;

  const newCells: (string | null)[] = new Array(newCols * newRows).fill(null) as (string | null)[];
  const copyRows = Math.min(zoneGrid.rows, newRows);
  const copyCols = Math.min(zoneGrid.cols, newCols);

  for (let r = 0; r < copyRows; r++) {
    for (let c = 0; c < copyCols; c++) {
      newCells[r * newCols + c] = zoneGrid.cells[r * zoneGrid.cols + c] ?? null;
    }
  }

  state = { ...state, zoneGrid: { cellSize, cols: newCols, rows: newRows, cells: newCells } };
  notify();
}

function notify(): void {
  for (const fn of listeners) fn();
}
