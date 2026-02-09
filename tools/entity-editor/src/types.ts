/**
 * Shared types for the theme editor.
 *
 * Scene layout types, export format, and re-exported entity types
 * used across all tabs.
 */

// ---------------------------------------------------------------------------
// Re-export entity types from app-state
// ---------------------------------------------------------------------------

export type {
  SourceRect,
  StaticState,
  SpritesheetState,
  VisualState,
  EntityEntry,
  AssetFile,
} from "./app-state.js";

// ---------------------------------------------------------------------------
// Tab system
// ---------------------------------------------------------------------------

/** Which tab is currently active. */
export type ActiveTab = "assets" | "entities" | "scene";

// ---------------------------------------------------------------------------
// Scene types
// ---------------------------------------------------------------------------

/** Ground fill configuration: simple background color. */
export interface GroundConfig {
  color: string;
}

/** A placed decoration in the scene. */
export interface SceneDecoration {
  id: string;
  asset: string;
  x: number;
  y: number;
  displayWidth: number;
  displayHeight: number;
  rotation: number;
  layer: number;
}

/** A wall segment defined by a polyline (legacy — kept for backward compat). */
export interface SceneWall {
  id: string;
  points: Array<{ x: number; y: number }>;
  thickness: number;
  color: string;
}

/** A route connecting two named positions. */
export interface SceneRoute {
  id: string;
  from: string;
  to: string;
  name?: string;
}

/** A named position marker in the scene. */
export interface ScenePosition {
  x: number;
  y: number;
  color?: string;
}

/** The complete scene layout state. */
export interface SceneState {
  sceneWidth: number;
  sceneHeight: number;
  ground: GroundConfig;
  positions: Record<string, ScenePosition>;
  decorations: SceneDecoration[];
  walls: SceneWall[];
  routes: SceneRoute[];
}

/** Editor mode for the scene tab. */
export type SceneEditorMode =
  | "build"
  | "positions"
  | "routes"
  | "select";

/** Transient scene editor state (not persisted in export). */
export interface SceneEditorState {
  mode: SceneEditorMode;
  selectedIds: string[];
  selectedType: "decoration" | "wall" | "position" | "route" | null;
  showGrid: boolean;
  gridSize: number;
  clipboard: SceneDecoration[];
  activeAssetPath: string | null;
}

// ---------------------------------------------------------------------------
// Scene layout export format
// ---------------------------------------------------------------------------

/** JSON structure written to scene-layout.json in the export zip. */
export interface SceneLayoutJson {
  sceneWidth: number;
  sceneHeight: number;
  ground: { color: string };
  positions: Record<string, { x: number; y: number; color?: string }>;
  decorations: Array<{
    id: string;
    asset: string;
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
    rotation: number;
    layer: number;
  }>;
  walls: Array<{
    id: string;
    points: Array<{ x: number; y: number }>;
    thickness: number;
    color: string;
  }>;
  routes: Array<{
    id: string;
    from: string;
    to: string;
    name?: string;
  }>;
}
