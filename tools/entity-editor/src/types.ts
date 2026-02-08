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

/** Ground fill configuration. */
export interface GroundConfig {
  type: "color" | "tile";
  color: string;
  tileAsset: string;
  tileSize: number;
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

/** A wall segment defined by a polyline. */
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
}

/** The complete scene layout state. */
export interface SceneState {
  sceneWidth: number;
  sceneHeight: number;
  ground: GroundConfig;
  positions: Record<string, { x: number; y: number }>;
  decorations: SceneDecoration[];
  walls: SceneWall[];
  routes: SceneRoute[];
}

/** Editor mode for the scene tab. */
export type SceneEditorMode =
  | "ground"
  | "decor"
  | "walls"
  | "positions"
  | "routes"
  | "select";

/** Transient scene editor state (not persisted in export). */
export interface SceneEditorState {
  mode: SceneEditorMode;
  selectedIds: string[];
  selectedType: "decoration" | "wall" | "position" | "route" | null;
}

// ---------------------------------------------------------------------------
// Scene layout export format
// ---------------------------------------------------------------------------

/** JSON structure written to scene-layout.json in the export zip. */
export interface SceneLayoutJson {
  sceneWidth: number;
  sceneHeight: number;
  ground: GroundConfig;
  positions: Record<string, { x: number; y: number }>;
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
  }>;
}
