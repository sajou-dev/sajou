/**
 * Shared application state for the entity editor.
 *
 * Simple observable state — modules subscribe to changes and the UI
 * re-renders when the state updates. No framework needed.
 */

// ---------------------------------------------------------------------------
// Types matching @sajou/schema entity-visual format
// ---------------------------------------------------------------------------

/** Source rectangle for static sprite cropping. */
export interface SourceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Static visual state. */
export interface StaticState {
  type: "static";
  asset: string;
  sourceRect?: SourceRect;
}

/** Spritesheet visual state. */
export interface SpritesheetState {
  type: "spritesheet";
  asset: string;
  frameSize: number;
  frameCount: number;
  frameRow: number;
  fps: number;
  loop: boolean;
}

/** A visual state — discriminated union. */
export type VisualState = StaticState | SpritesheetState;

/** Entity visual entry — mutable for editing. */
export interface EntityEntry {
  displayWidth: number;
  displayHeight: number;
  fallbackColor: string;
  states: Record<string, VisualState>;
}

/** An imported asset file with its data. */
export interface AssetFile {
  /** Full relative path from the asset root (e.g. "Factions/Knights/Pawn.png"). */
  path: string;
  /** File name only. */
  name: string;
  /** Object URL for display. */
  objectUrl: string;
  /** The original File reference for zip export. */
  file: File;
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

/** The entire editor state. */
export interface AppState {
  /** All entities, keyed by entity ID. */
  entities: Record<string, EntityEntry>;
  /** Currently selected entity ID (null if none). */
  selectedEntityId: string | null;
  /** Currently selected state name within the selected entity. */
  selectedStateName: string | null;
  /** All imported asset files. */
  assets: AssetFile[];
  /** Currently highlighted asset path in the asset browser. */
  selectedAssetPath: string | null;
}

/** Create an empty initial state. */
export function createInitialState(): AppState {
  return {
    entities: {},
    selectedEntityId: null,
    selectedStateName: null,
    assets: [],
    selectedAssetPath: null,
  };
}

// ---------------------------------------------------------------------------
// Simple pub/sub
// ---------------------------------------------------------------------------

type Listener = () => void;

let state = createInitialState();
const listeners: Listener[] = [];

/** Get the current state (read-only reference). */
export function getState(): AppState {
  return state;
}

/** Replace the entire state and notify listeners. */
export function setState(next: AppState): void {
  state = next;
  for (const fn of listeners) fn();
}

/** Update state partially (shallow merge at top level) and notify. */
export function updateState(partial: Partial<AppState>): void {
  setState({ ...state, ...partial });
}

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribe(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the currently selected entity entry, or null. */
export function getSelectedEntity(): EntityEntry | null {
  const { selectedEntityId, entities } = state;
  if (!selectedEntityId) return null;
  return entities[selectedEntityId] ?? null;
}

/** Get the currently selected visual state, or null. */
export function getSelectedState(): VisualState | null {
  const entity = getSelectedEntity();
  if (!entity) return null;
  const { selectedStateName } = state;
  if (!selectedStateName) return null;
  return entity.states[selectedStateName] ?? null;
}

/** Create a default new entity entry. */
export function createDefaultEntity(): EntityEntry {
  return {
    displayWidth: 64,
    displayHeight: 64,
    fallbackColor: "#888888",
    states: {
      idle: {
        type: "static",
        asset: "",
      },
    },
  };
}

/** Create a default visual state. */
export function createDefaultState(): VisualState {
  return {
    type: "static",
    asset: "",
  };
}
