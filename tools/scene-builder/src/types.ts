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
  /**
   * Optional topology: spatial relationships to scene positions.
   * Only meaningful for actors (entities with semanticId set).
   */
  topology?: EntityTopology;
}

/**
 * Topology describes an entity's spatial relationships to scene positions.
 * Only meaningful for actors (entities with a semanticId).
 */
export interface EntityTopology {
  /** Home position ID — the entity's default/resting waypoint. */
  home?: string;
  /** Accessible position IDs — positions the entity can reach. */
  waypoints: string[];
  /** Context-to-animation-state mapping (e.g., "idle" → "sitting"). */
  stateMapping?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Level 2 — Dynamic bindings (Choreographer → Entity properties)
// ---------------------------------------------------------------------------

/** Output type from a choreographer node. */
export type BindingValueType = "float" | "point2D" | "bool" | "enum" | "event" | "color" | "int";

/**
 * Category of bindable property on an entity.
 * Used to group properties in the radial palette and inspector.
 */
export type BindablePropertyCategory = "spatial" | "visual" | "topological";

/**
 * A property on an entity that can receive a binding from the Choreographer.
 * This is a static definition — the registry of all possible targets.
 */
export interface BindablePropertyDef {
  /** Property key (e.g. "rotation", "position.x", "followRoute"). */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Category for UI grouping. */
  category: BindablePropertyCategory;
  /** Accepted input types from choreographer output. */
  acceptsTypes: readonly BindingValueType[];
}

/**
 * Mapping function applied between a choreographer output and an entity property.
 * Converts source range to target range (e.g. 0→1 mapped to 0°→360°).
 */
export interface BindingMapping {
  /** Function name (lerp, clamp, step, curve, map, smoothstep, quantize). */
  fn: string;
  /** Input range [min, max]. */
  inputRange: [number, number];
  /** Output range [min, max] (for lerp/clamp) or output values (for step). */
  outputRange: [number, number];
}

/**
 * Action config for event→action bindings (moveTo, followRoute, etc.).
 * Used when a choreographer event triggers a topological action.
 */
export interface BindingAction {
  /** Route reference (e.g. "spawnPoint→forge") for followRoute. */
  route?: string;
  /** Target waypoint ID for moveTo/teleportTo. */
  waypoint?: string;
  /** Animation state during the action. */
  animationDuring?: string;
  /** Animation state on arrival/completion. */
  animationOnArrival?: string;
  /** Duration in ms ("auto" = route length based). */
  duration?: number | "auto";
}

/**
 * A single binding from a choreographer output to an entity property.
 * Stored in the binding-store, serialized in choreographies.json.
 */
export interface EntityBinding {
  /** Unique binding ID. */
  id: string;
  /** Target entity's semantic ID (actor name). */
  targetEntityId: string;
  /** Target property key (e.g. "rotation", "followRoute"). */
  property: string;
  /** Source choreography ID. */
  sourceChoreographyId: string;
  /** Source output type from the choreographer node. */
  sourceType: BindingValueType;
  /** Optional mapping function (for value bindings). */
  mapping?: BindingMapping;
  /** Optional action config (for event→action bindings). */
  action?: BindingAction;
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
  /** Optional waypoint name for choreography reference (e.g., "gate", "bridge-mid"). */
  name?: string;
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
  /** Optional origin position ID — links this route's start to a named position. */
  fromPositionId?: string;
  /** Optional destination position ID — links this route's end to a named position. */
  toPositionId?: string;
}

// ---------------------------------------------------------------------------
// Semantic zones (aligned with MCP server design §4)
// ---------------------------------------------------------------------------

/** A semantic zone type definition (command, production, perimeter…). */
export interface ZoneTypeDef {
  /** Unique zone type identifier (e.g. "command", "production"). */
  id: string;
  /** Display name. */
  name: string;
  /** Description for LLM/MCP context. */
  description: string;
  /** Paint color (hex). */
  color: string;
  /** Maximum entities allowed in this zone (MCP concept). */
  capacity: number;
}

/** Grid of painted zone cells — each cell references a zone type ID or null. */
export interface ZoneGrid {
  /** Pixels per cell (default = gridSize, typically 32). */
  cellSize: number;
  /** Number of columns: ceil(dimensions.width / cellSize). */
  cols: number;
  /** Number of rows: ceil(dimensions.height / cellSize). */
  rows: number;
  /** Flat row-major array of zone type IDs (null = unpainted). */
  cells: (string | null)[];
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
  /** Available zone types for painting. */
  zoneTypes: ZoneTypeDef[];
  /** Painted zone grid (cell → zone type mapping). */
  zoneGrid: ZoneGrid;
}

// ---------------------------------------------------------------------------
// Editor state (UI layer)
// ---------------------------------------------------------------------------

/** Workspace view identifiers (top-level tab navigation — V1 compat). */
export type ViewId = "signal" | "orchestrator" | "visual";

/** Zone identifiers for the V2 spatial layout. */
export type ZoneId = "signal" | "choreographer" | "theme";

/**
 * Interface state — progressive revelation (V2).
 *
 * 0 = virgin (only Signal toolbar)
 * 1 = sources configured (Signal zone deployed)
 * 2 = signal connected to choreographer (Signal compact, Choreographer active)
 * 3 = full pipeline (all three zones active)
 */
export type InterfaceState = 0 | 1 | 2 | 3;

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

/** Choreographer node canvas viewport state. */
export interface NodeCanvasViewport {
  /** Pan offset X in canvas coordinates. */
  panX: number;
  /** Pan offset Y in canvas coordinates. */
  panY: number;
  /** Zoom level (1.0 = 100%). */
  zoom: number;
}

/** Editor UI state (transient, not saved to scene file). */
export interface EditorState {
  /** Currently active workspace view (V1 compat — used for keyboard focus zone). */
  currentView: ViewId;
  /** Progressive revelation state (V2). Default: 3 = full pipeline. */
  interfaceState: InterfaceState;
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
  /** Rideau split ratio: 0 = full preview (theme only), 1 = full workspace (choreo only). Default: 0.5. */
  rideauSplit: number;
  /** Choreographer node canvas viewport (pan/zoom). */
  nodeCanvasViewport: NodeCanvasViewport;
  /** Live preview for topology association drag (null = not associating). */
  topologyAssociationPreview: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  } | null;
  /** Whether a binding drag is active (choreographer → entity). */
  bindingDragActive: boolean;
  /** Entity semantic ID hovered during binding drag (null = none). */
  bindingDropHighlightId: string | null;
  /** Active zone type brush for painting (null = no painting). */
  activeZoneTypeId: string | null;
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
 * `"event"` is a catch-all for generic backend events (OpenClaw, custom APIs…)
 * that don't map to a known sajou type. The full JSON is preserved as payload.
 */
export type SignalType =
  | "task_dispatch"
  | "tool_call"
  | "tool_result"
  | "token_usage"
  | "agent_state_change"
  | "error"
  | "completion"
  | "event";

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
  event: Record<string, unknown>;
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

// ---------------------------------------------------------------------------
// Choreography Editor (local copies aligned with @sajou/core, not imported)
// ---------------------------------------------------------------------------

/** Easing function names supported by the choreographer runtime. */
export type ChoreographyEasing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "arc";

/**
 * A comparison operator applied to a resolved signal value.
 * Multiple keys in the same object are AND-combined.
 *
 * @example
 * ```json
 * { "contains": "amour" }
 * { "gt": 5, "lt": 100 }
 * ```
 */
export interface WhenOperatorDef {
  /** Strict equality: `resolved === operand`. */
  equals?: unknown;
  /** Substring match: `resolved.includes(operand)`. */
  contains?: string;
  /** Regex match: `new RegExp(operand).test(resolved)`. */
  matches?: string;
  /** Greater than: `resolved > operand`. */
  gt?: number;
  /** Less than: `resolved < operand`. */
  lt?: number;
  /** Field exists and is not null/undefined. Set to `false` to check absence. */
  exists?: boolean;
  /** Negation: inverts the result of the inner operator. */
  not?: WhenOperatorDef;
}

/**
 * A single when condition: signal paths mapped to operators (AND-combined).
 * Multiple keys mean all must match.
 *
 * @example
 * ```json
 * { "signal.content": { "contains": "amour" }, "signal.model": { "equals": "glm-4.7" } }
 * ```
 */
export type WhenConditionDef = Record<string, WhenOperatorDef>;

/**
 * The `when` clause for conditional choreography triggering.
 * Object form = AND, array form = OR (at least one must match).
 */
export type WhenClauseDef = WhenConditionDef | WhenConditionDef[];

/**
 * Known action types for the V1 choreography editor.
 * Structural actions (parallel, onArrive, onInterrupt) have nested children.
 */
export type ChoreographyActionType =
  | "move" | "spawn" | "destroy" | "fly" | "flash"
  | "wait" | "playSound"
  | "parallel" | "onArrive" | "onInterrupt";

/** Structural action types that contain nested steps. */
export const STRUCTURAL_ACTIONS: readonly string[] = ["parallel", "onArrive", "onInterrupt"];

/**
 * A single step in a choreography, editor-friendly mutable version.
 * On export, `id` is stripped and `params` are merged into the step object.
 */
export interface ChoreographyStepDef {
  /** Editor-internal unique ID (stripped on export). */
  id: string;
  /** The action to perform. */
  action: string;
  /** Logical entity reference. May contain `signal.*` references. */
  entity?: string;
  /** Target entity reference (for actions like flash). */
  target?: string;
  /** Delay in ms before the action starts. Defaults to 0. */
  delay?: number;
  /** Duration in ms. Absent = instant action. */
  duration?: number;
  /** Easing function name. */
  easing?: string;
  /** Additional action-specific parameters (to, at, color, sound, etc.). */
  params: Record<string, unknown>;
  /** Nested steps for structural actions (parallel, onArrive, onInterrupt). */
  children?: ChoreographyStepDef[];
}

/**
 * A full choreography definition as stored in the editor.
 * On export, converted to the `@sajou/core` ChoreographyDefinition format.
 */
export interface ChoreographyDef {
  /** Editor-internal unique ID (stripped on export). */
  id: string;
  /**
   * Default signal type trigger (bootstrap/fallback).
   * When signal-type→choreographer wires target this choreography, those are authoritative.
   * When no wires exist, `on` is used as the implicit trigger.
   */
  on: string;
  /** Optional condition filter on signal payload. */
  when?: WhenClauseDef;
  /** Whether this choreography interrupts active performances. */
  interrupts: boolean;
  /** Ordered sequence of steps. */
  steps: ChoreographyStepDef[];
  /** Editor-only: node X position on the choreographer canvas. */
  nodeX: number;
  /** Editor-only: node Y position on the choreographer canvas. */
  nodeY: number;
  /** Editor-only: whether the node is collapsed (header only). */
  collapsed: boolean;
  /** Default target entity assigned by dragging choreography → entity on canvas. */
  defaultTargetEntityId?: string;
}

/** Full state for the choreography editor. */
export interface ChoreographyEditorState {
  /** All choreography definitions being edited. */
  choreographies: ChoreographyDef[];
  /** Currently selected choreography ID (null = none). */
  selectedChoreographyId: string | null;
  /** Currently selected step ID within the selected choreography (null = none). */
  selectedStepId: string | null;
}

// ---------------------------------------------------------------------------
// Signal Sources (V2 multi-source)
// ---------------------------------------------------------------------------

/** Connection status for a signal source. */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/** Transport protocol for a signal source. */
export type TransportProtocol = "websocket" | "sse" | "openai";

/**
 * A single signal source in the V2 multi-source architecture.
 * Each source has its own connection, protocol, and status.
 */
export interface SignalSource {
  /** Unique source ID. */
  id: string;
  /** Display name (user-editable). */
  name: string;
  /** Identity color — visually distinguishes this source across the UI. */
  color: string;
  /** Transport protocol. */
  protocol: TransportProtocol;
  /** Connection URL. */
  url: string;
  /** API key (for OpenAI or authenticated sources). */
  apiKey: string;
  /** Connection status. */
  status: ConnectionStatus;
  /** Error message (null = no error). */
  error: string | null;
  /** Rolling average of events per second. */
  eventsPerSecond: number;
  /** Available models (OpenAI mode only). */
  availableModels: string[];
  /** Currently selected model (OpenAI mode only). */
  selectedModel: string;
  /** Whether this source is currently streaming (OpenAI mode only). */
  streaming: boolean;
}

/** Full state for the signal sources panel (V2 multi-source). */
export interface SignalSourcesState {
  /** All configured signal sources. */
  sources: SignalSource[];
  /** Currently selected source ID for editing (null = none). */
  selectedSourceId: string | null;
  /** Whether the signal zone is in expanded mode (true) or compact mode (false). */
  expanded: boolean;
}
