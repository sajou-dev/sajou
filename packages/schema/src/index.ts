/**
 * @sajou/schema — JSON Schemas and TypeScript types for the Sajou signal protocol.
 *
 * This package is the shared contract between all Sajou packages.
 * Schemas are the source of truth; TypeScript types are aligned with them.
 */

export type {
  SignalEvent,
  SignalEnvelope,
  SignalType,
  WellKnownSignalType,
  SignalPayloadMap,
  AgentState,
  ErrorSeverity,
  TaskDispatchPayload,
  ToolCallPayload,
  ToolResultPayload,
  TokenUsagePayload,
  AgentStateChangePayload,
  ErrorPayload,
  CompletionPayload,
  TextDeltaPayload,
  ThinkingPayload,
  BoardPosition,
  BoardBounds,
  UserClickPayload,
  UserMovePayload,
  UserZonePayload,
  UserCommandPayload,
  UserPointPayload,
} from "./signal-types.js";

export type {
  StageScene,
  StageBoard,
  StageZone,
  StageSlot,
  StageZoneAmbiance,
  StageZoneConnection,
  StageLightingConfig,
  StageLightGlobal,
  StageLightSource,
  StageLightFlicker,
  StageParticleSystem,
  StageEntity,
  StageEntityVisual,
  StageEntityAnimation,
  StageEntityInteraction,
  StageContextMenuOption,
} from "./stage-scene-types.js";

export type {
  StageBridgeCommand,
  SpawnEntityCommand,
  MoveEntityCommand,
  RemoveEntityCommand,
  PlayAnimationCommand,
  SetLightingCommand,
  StageBridgeEvent,
  SajouBridge,
} from "./stage-bridge-types.js";

export type {
  EntityVisualConfig,
  EntityVisualEntry,
  EntityVisualState,
  StaticVisualState,
  SpritesheetVisualState,
  SourceRect,
} from "./entity-visual-types.js";
