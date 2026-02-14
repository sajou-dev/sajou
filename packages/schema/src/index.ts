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
} from "./signal-types.js";

export type {
  EntityVisualConfig,
  EntityVisualEntry,
  EntityVisualState,
  StaticVisualState,
  SpritesheetVisualState,
  SourceRect,
} from "./entity-visual-types.js";
