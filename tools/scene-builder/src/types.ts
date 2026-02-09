/**
 * All TypeScript interfaces for the Scene Builder.
 *
 * Aligned with @sajou/theme-api (EntityDefinition, ThemeManifest, ThemeLayout).
 * The Scene Builder is entity-centric: the canvas contains placed entities,
 * not raw assets. Assets are source material; entities are what lives in the scene.
 */

// ---------------------------------------------------------------------------
// Scene data
// ---------------------------------------------------------------------------

/** Scene dimensions. */
export interface SceneDimensions {
  width: number;
  height: number;
}

/** Background configuration — just a base fill color. */
export interface SceneBackground {
  /** Base fill color (always rendered underneath all layers). */
  color: string;
}

/**
 * A generic scene layer (Photoshop/Tiled-style).
 *
 * A layer is a Z-group: a named, ordered, hideable, lockable container.
 * Content (entities, background images, routes...) is placed on layers.
 * The Layers panel manages the layer stack — not the content on it.
 */
export interface SceneLayer {
  /** Unique layer ID. */
  id: string;
  /** Display name in the Layers panel. */
  name: string;
  /** Layer order (higher = rendered on top). */
  order: number;
  /** Whether the layer is visible. */
  visible: boolean;
  /** Whether the layer is locked (prevents selection/editing of its contents). */
  locked: boolean;
}

/**
 * A placed entity instance on the scene.
 *
 * References an entity definition in the entity-store by `entityId`.
 * Each placed entity has its own position, scale, rotation, and active
 * visual state — these override the entity definition's defaults.
 */
export interface PlacedEntity {
  /** Unique instance ID (e.g., "peon-01", "tree-03"). */
  id: string;
  /** Reference to entity definition in entity-store (e.g., "peon", "tree"). */
  entityId: string;
  x: number;
  y: number;
  /** Uniform scale (overrides entity defaults). */
  scale: number;
  /** Rotation in degrees. */
  rotation: number;
  /** Reference to SceneLayer.id. Determines rendering order group. */
  layerId: string;
  /** Opacity 0-1. */
  opacity: number;
  flipH: boolean;
  flipV: boolean;
  locked: boolean;
  visible: boolean;
  /** Which visual state to display (e.g., "idle", "walk"). */
  activeState: string;
}

/** Position type hints for choreography semantics. */
export type PositionTypeHint = "spawn" | "waypoint" | "destination" | "generic";

/**
 * A named position marker on the scene.
 *
 * Positions are semantic — they map to `ThemeLayout.positions` in the
 * exported ThemeManifest. Choreographies reference positions by name
 * (e.g., "forge", "spawnPoint", "oracle").
 */
export interface ScenePosition {
  id: string;
  /** Semantic name used by choreographies. */
  name: string;
  x: number;
  y: number;
  /** Editor visual color (not exported to runtime). */
  color: string;
  /** Optional entity ID — "this position spawns this entity type". */
  entityBinding?: string;
  /** Semantic hint for how this position is used. */
  typeHint: PositionTypeHint;
}

/**
 * A route connecting two positions.
 *
 * Routes are semantic paths that entities can follow. In the runtime,
 * a choreography `move` action animates an entity along a route.
 */
export interface SceneRoute {
  id: string;
  name: string;
  /** Position ID of the start point. */
  from: string;
  /** Position ID of the end point. */
  to: string;
  style: "solid" | "dashed";
  color: string;
  /** If true, the route can be traversed in both directions. */
  bidirectional: boolean;
}

/** Full scene state (data layer). */
export interface SceneState {
  dimensions: SceneDimensions;
  background: SceneBackground;
  /** Scene layers — ordered Z-groups that content is placed on. */
  layers: SceneLayer[];
  entities: PlacedEntity[];
  positions: ScenePosition[];
  routes: SceneRoute[];
}

// ---------------------------------------------------------------------------
// Editor state (UI layer)
// ---------------------------------------------------------------------------

/** Available canvas tools. */
export type ToolId = "select" | "hand" | "background" | "place" | "position" | "route";

/** Panel identifiers. */
export type PanelId = "entity-palette" | "asset-manager" | "entity-editor" | "inspector" | "layers" | "settings";

/** Saved panel position and size. */
export interface PanelLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

/** Editor UI state (transient, not saved to scene file). */
export interface EditorState {
  activeTool: ToolId;
  selectedIds: string[];
  panelLayouts: Record<PanelId, PanelLayout>;
  gridEnabled: boolean;
  gridSize: number;
  snapToGrid: boolean;
  /** Entity ID to place on next canvas click (null = not placing). */
  placingEntityId: string | null;
  /** The active layer for new content placement. */
  activeLayerId: string | null;
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/** Supported asset file types. */
export type AssetFormat = "png" | "svg" | "webp" | "gif" | "jpeg" | "unknown";

/** An imported asset file. */
export interface AssetFile {
  path: string;
  name: string;
  objectUrl: string;
  file: File;
  category: string;
  /** Detected format. */
  format: AssetFormat;
  /** Image width in pixels (detected on import). */
  naturalWidth?: number;
  /** Image height in pixels (detected on import). */
  naturalHeight?: number;
  /** For animated GIFs: frame count. */
  frameCount?: number;
}

// ---------------------------------------------------------------------------
// Entity definitions (aligned with @sajou/theme-api EntityDefinition)
// ---------------------------------------------------------------------------

/** Source rectangle for cropping a sub-region of a static sprite. */
export interface SourceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Static image visual (single sprite). */
export interface SpriteVisual {
  type: "sprite";
  /** Asset path relative to asset base. */
  source: string;
  /** Optional crop rectangle. */
  sourceRect?: SourceRect;
}

/** A single animation definition within a spritesheet. */
export interface SpriteAnimation {
  /** Ordered frame indices from the spritesheet. */
  frames: number[];
  /** Playback speed in frames per second. */
  fps: number;
  /** Whether the animation loops. Defaults to true. */
  loop?: boolean;
}

/** Spritesheet-based animated visual. */
export interface SpritesheetVisual {
  type: "spritesheet";
  /** Asset path to the spritesheet image. */
  source: string;
  /** Width of a single frame in pixels. */
  frameWidth: number;
  /** Height of a single frame in pixels. */
  frameHeight: number;
  /** Named animations defined as frame sequences. */
  animations: Record<string, SpriteAnimation>;
}

/** Animated GIF visual (Scene Builder convenience type — converted on export). */
export interface GifVisual {
  type: "gif";
  /** Asset path to the GIF file. */
  source: string;
  /** Override GIF's native timing. */
  fps?: number;
  /** Whether the animation loops. */
  loop?: boolean;
}

/** Discriminated union of all visual representations. */
export type EntityVisual = SpriteVisual | SpritesheetVisual | GifVisual;

/**
 * Default presentation properties for an entity.
 * Applied on spawn, can be overridden per-instance.
 * Aligned with @sajou/theme-api EntityDefaults.
 */
export interface EntityDefaults {
  /** Scale factor. 1.0 is original size. */
  scale?: number;
  /** Anchor point as [x, y] normalized (0-1). [0.5, 1.0] = bottom-center. */
  anchor?: [number, number];
  /** Drawing order. Higher values render on top. */
  zIndex?: number;
  /** Initial opacity (0-1). */
  opacity?: number;
}

/**
 * Entity definition with display properties and visual configuration.
 *
 * Aligned with @sajou/theme-api EntityDefinition:
 * - id, tags, defaults, visual (discriminated union), sounds
 *
 * The Scene Builder adds displayWidth/displayHeight/fallbackColor
 * for editor rendering. These map to the entity-visuals.json legacy format.
 */
export interface EntityEntry {
  /** Unique entity identifier within the theme. */
  id: string;
  /** Tags for grouping and filtering (e.g., "unit", "building", "decoration"). */
  tags: string[];
  /** Display width in scene pixels. */
  displayWidth: number;
  /** Display height in scene pixels. */
  displayHeight: number;
  /** CSS hex color fallback when asset fails to load. */
  fallbackColor: string;
  /** Default presentation properties. */
  defaults: EntityDefaults;
  /** Visual representation — discriminated union on visual.type. */
  visual: EntityVisual;
  /** Sound effects keyed by event name. Values are asset paths. */
  sounds?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Theme metadata (for Settings panel and export)
// ---------------------------------------------------------------------------

/** Theme capabilities (what the theme's renderer supports). */
export interface ThemeCapabilities {
  visualTypes: string[];
  sound: boolean;
  perspective: boolean;
}

/** Theme metadata for the exported ThemeManifest. */
export interface ThemeMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: ThemeCapabilities;
  assetBasePath: string;
}

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

/** A command that can be executed and undone. */
export interface UndoableCommand {
  execute(): void;
  undo(): void;
  description: string;
}
