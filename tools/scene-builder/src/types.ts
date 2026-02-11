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
  /** Per-instance z-order within its layer (higher = rendered on top). */
  zIndex: number;
  /** Opacity 0-1. */
  opacity: number;
  flipH: boolean;
  flipV: boolean;
  locked: boolean;
  visible: boolean;
  /** Which visual state to display (e.g., "idle", "walk"). */
  activeState: string;
  /**
   * Optional semantic identifier for choreographies.
   * When set, this entity becomes an "actor" — choreographies can target it
   * by this name (e.g. setState "door-kitchen" → "open").
   * Must be unique across all placed entities. Undefined = passive decor.
   */
  semanticId?: string;
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
 * A point along a route path.
 *
 * Routes are standalone vector paths defined by an ordered sequence of points.
 * Each point has a corner style that determines how the path bends:
 * - "sharp": hard angle (corridor corner, right-angle turn)
 * - "smooth": quadratic curve through this point (natural outdoor path)
 */
export interface RoutePoint {
  /** Position in scene coordinates. */
  x: number;
  /** Position in scene coordinates. */
  y: number;
  /**
   * Corner style at this point.
   * - "sharp": hard angle (right-angle turn, corridor corner)
   * - "smooth": quadratic curve through this point (natural outdoor path)
   */
  cornerStyle: "sharp" | "smooth";
  /**
   * Curve tension for "smooth" corners. 0 = straight, 1 = maximum curve.
   * Ignored for "sharp" corners. Default: 0.5
   */
  tension?: number;
}

/**
 * A standalone navigable path on the scene.
 *
 * Routes are freeform vector paths that entities can follow during
 * choreographed animations. A route is self-contained — it does not
 * depend on position markers. The path is defined by an ordered sequence
 * of points. A route needs at least 2 points.
 *
 * Routes can optionally be named for choreography reference
 * (e.g., "corridor-north", "bridge-path").
 */
export interface SceneRoute {
  id: string;
  /** Semantic name for choreographies. */
  name: string;
  /**
   * Ordered points that define the path geometry.
   * Minimum 2 points. The path follows: points[0] → points[1] → ... → points[N].
   */
  points: RoutePoint[];
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

/** Workspace view identifiers (top-level tab navigation). */
export type ViewId = "signal" | "orchestrator" | "visual";

/** Available canvas tools. */
export type ToolId = "select" | "hand" | "background" | "place" | "position" | "route";

/** Panel identifiers. */
export type PanelId = "entity-palette" | "asset-manager" | "entity-editor" | "inspector" | "layers" | "settings" | "signal-timeline";

/** Saved panel position and size. */
export interface PanelLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

/**
 * Live preview state for route creation.
 * Stored in editor state so the renderer can draw the in-progress path.
 */
export interface RouteCreationPreview {
  /** Points placed so far. */
  points: Array<{ x: number; y: number; cornerStyle: "sharp" | "smooth" }>;
  /** Current cursor position (for the dashed preview line from last point). */
  cursor: { x: number; y: number } | null;
}

/** Editor UI state (transient, not saved to scene file). */
export interface EditorState {
  /** Currently active workspace view. */
  currentView: ViewId;
  activeTool: ToolId;
  /** Selected entity instance IDs (select tool). */
  selectedIds: string[];
  /** Selected position IDs (position tool). */
  selectedPositionIds: string[];
  /** Selected route IDs (route tool). */
  selectedRouteIds: string[];
  panelLayouts: Record<PanelId, PanelLayout>;
  gridEnabled: boolean;
  gridSize: number;
  snapToGrid: boolean;
  /** Entity ID to place on next canvas click (null = not placing). */
  placingEntityId: string | null;
  /** The active layer for new content placement. */
  activeLayerId: string | null;
  /** Live preview for route creation (null = not creating). */
  routeCreationPreview: RouteCreationPreview | null;
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
  /** For animated GIFs: detected native FPS from frame delays. */
  detectedFps?: number;
  /** Auto-detected spritesheet grid hint (set during enrichAssetMetadata). */
  spritesheetHint?: SpritesheetHint;
}

// ---------------------------------------------------------------------------
// Spritesheet auto-detection hints
// ---------------------------------------------------------------------------

/** A row of animation frames detected in a spritesheet grid. */
export interface DetectedRowAnimation {
  /** Row index in the grid (0-based). */
  row: number;
  /** Number of non-empty frames in this row. */
  frameCount: number;
  /** Global frame indices (row * cols + col) of non-empty frames. */
  frames: number[];
}

/** Result of spritesheet grid auto-detection. */
export interface SpritesheetHint {
  /** Detected frame width in pixels. */
  frameWidth: number;
  /** Detected frame height in pixels. */
  frameHeight: number;
  /** Number of columns in the grid. */
  cols: number;
  /** Number of rows in the grid. */
  rows: number;
  /** Total non-empty frames across all rows. */
  totalNonEmptyFrames: number;
  /** Per-row animation data with non-empty frame indices. */
  rowAnimations: DetectedRowAnimation[];
  /** Detection confidence from 0 to 1 (higher = more confident). */
  confidence: number;
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

// ---------------------------------------------------------------------------
// Signal Timeline (aligned with @sajou/schema + @sajou/emitter, local copies)
// ---------------------------------------------------------------------------

/**
 * Signal types supported in V1.
 * Mirrors `@sajou/schema` SignalType — kept local to avoid adding a dependency.
 */
export type SignalType =
  | "task_dispatch"
  | "tool_call"
  | "tool_result"
  | "token_usage"
  | "agent_state_change"
  | "error"
  | "completion";

/** Agent lifecycle states (mirrors @sajou/schema AgentState). */
export type AgentState = "idle" | "thinking" | "acting" | "waiting" | "done" | "error";

/** Error severity levels (mirrors @sajou/schema ErrorSeverity). */
export type ErrorSeverity = "warning" | "error" | "critical";

/** Maps each signal type to its corresponding payload interface. */
export interface SignalPayloadMap {
  task_dispatch: { taskId: string; from: string; to: string; description?: string };
  tool_call: { toolName: string; agentId: string; callId?: string; input?: Record<string, unknown> };
  tool_result: { toolName: string; agentId: string; callId?: string; success: boolean; output?: Record<string, unknown> };
  token_usage: { agentId: string; promptTokens: number; completionTokens: number; model?: string; cost?: number };
  agent_state_change: { agentId: string; from: AgentState; to: AgentState; reason?: string };
  error: { agentId?: string; code?: string; message: string; severity: ErrorSeverity };
  completion: { taskId: string; agentId?: string; success: boolean; result?: string };
}

/** A single step in a signal scenario timeline. */
export interface SignalTimelineStep {
  /** Editor-internal unique ID (stripped on export). */
  id: string;
  /** Milliseconds to wait before emitting this signal (relative delay). */
  delayMs: number;
  /** The signal type. */
  type: SignalType;
  /** The typed payload for this signal type. */
  payload: SignalPayloadMap[SignalType];
  /** Optional correlation ID for grouping related signals. */
  correlationId?: string;
}

/** Full state for the signal timeline editor. */
export interface SignalTimelineState {
  /** Scenario name. */
  name: string;
  /** Scenario description. */
  description: string;
  /** Ordered list of timeline steps. */
  steps: SignalTimelineStep[];
  /** Currently selected step ID (null = none). */
  selectedStepId: string | null;
}
