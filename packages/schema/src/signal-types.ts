/**
 * TypeScript types for the Sajou signal protocol.
 *
 * These types are aligned with signal.schema.json — the JSON Schema is the source of truth.
 * When updating, change the schema first, then update these types to match.
 *
 * The protocol is **open**: any string is a valid signal type. Well-known types
 * have typed payloads; unknown types get `Readonly<Record<string, unknown>>`.
 */

// ---------------------------------------------------------------------------
// Signal types
// ---------------------------------------------------------------------------

/**
 * Well-known signal types with typed payloads.
 * Uses snake_case per convention (signals are data, not code).
 */
export type WellKnownSignalType =
  | "task_dispatch"
  | "tool_call"
  | "tool_result"
  | "token_usage"
  | "agent_state_change"
  | "error"
  | "completion"
  | "text_delta"
  | "thinking"
  | "user.click"
  | "user.move"
  | "user.zone"
  | "user.command"
  | "user.point";

/**
 * Signal type discriminator — any string is valid.
 *
 * Well-known types get IDE autocomplete; custom types (e.g., `"my_event"`)
 * are accepted without error. The `(string & {})` trick preserves
 * autocomplete for the known literal values.
 */
export type SignalType = WellKnownSignalType | (string & {});

/**
 * Possible states for an agent in the Sajou protocol.
 *
 * - `idle`: no active task
 * - `thinking`: processing/reasoning
 * - `acting`: executing a tool or action
 * - `waiting`: blocked on external input
 * - `done`: task completed successfully
 * - `error`: task failed
 */
export type AgentState =
  | "idle"
  | "thinking"
  | "acting"
  | "waiting"
  | "done"
  | "error";

/**
 * Severity levels for error signals.
 * Affects visual intensity in the choreographer.
 */
export type ErrorSeverity = "warning" | "error" | "critical";

// ---------------------------------------------------------------------------
// Payload types (one per well-known signal type)
// ---------------------------------------------------------------------------

/**
 * Payload for `task_dispatch` signals.
 * A task is assigned to an agent — the starting point of most choreographies.
 */
export interface TaskDispatchPayload {
  /** Unique identifier for the task being dispatched. */
  readonly taskId: string;
  /** The entity dispatching the task (orchestrator ID, parent agent ID). */
  readonly from: string;
  /** The entity receiving the task (agent ID). */
  readonly to: string;
  /** Human-readable description of the task. */
  readonly description?: string;
}

/**
 * Payload for `tool_call` signals.
 * An agent invokes a tool.
 */
export interface ToolCallPayload {
  /** Name of the tool being invoked. */
  readonly toolName: string;
  /** The agent making the tool call. */
  readonly agentId: string;
  /** Unique ID for this call, used to correlate with tool_result. */
  readonly callId?: string;
  /** The input/arguments passed to the tool. */
  readonly input?: Record<string, unknown>;
}

/**
 * Payload for `tool_result` signals.
 * A tool returns a result.
 */
export interface ToolResultPayload {
  /** Name of the tool that returned. */
  readonly toolName: string;
  /** The agent that made the original call. */
  readonly agentId: string;
  /** Correlates with the tool_call signal's callId. */
  readonly callId?: string;
  /** Whether the tool call succeeded. */
  readonly success: boolean;
  /** The tool's output. */
  readonly output?: Record<string, unknown>;
}

/**
 * Payload for `token_usage` signals.
 * Token consumption report.
 */
export interface TokenUsagePayload {
  /** The agent consuming tokens. */
  readonly agentId: string;
  /** Number of tokens in the prompt. */
  readonly promptTokens: number;
  /** Number of tokens in the completion. */
  readonly completionTokens: number;
  /** The model used (e.g., 'claude-opus-4-6'). */
  readonly model?: string;
  /** Estimated cost in USD. */
  readonly cost?: number;
}

/**
 * Payload for `agent_state_change` signals.
 * Agent transitions between lifecycle states.
 */
export interface AgentStateChangePayload {
  /** The agent changing state. */
  readonly agentId: string;
  /** The previous state. */
  readonly from: AgentState;
  /** The new state. */
  readonly to: AgentState;
  /** Why the state changed. */
  readonly reason?: string;
}

/**
 * Payload for `error` signals.
 * Something went wrong.
 */
export interface ErrorPayload {
  /** The agent that encountered the error. */
  readonly agentId?: string;
  /** Machine-readable error code. */
  readonly code?: string;
  /** Human-readable error message. */
  readonly message: string;
  /** Severity level — affects visual intensity. */
  readonly severity: ErrorSeverity;
}

/**
 * Payload for `completion` signals.
 * A task or workflow finishes.
 */
export interface CompletionPayload {
  /** The task that completed. */
  readonly taskId: string;
  /** The agent that completed the task. */
  readonly agentId?: string;
  /** Whether the task completed successfully. */
  readonly success: boolean;
  /** Summary of the result. */
  readonly result?: string;
}

/**
 * Payload for `text_delta` signals.
 * A streaming text chunk from an AI model.
 */
export interface TextDeltaPayload {
  /** The agent producing this text. */
  readonly agentId: string;
  /** The text chunk (delta, not cumulative). */
  readonly content: string;
  /** Hint about the content format. Defaults to 'text'. */
  readonly contentType?: "text" | "code" | "markdown";
  /** Chunk index within the current stream (0-based). */
  readonly index?: number;
}

/**
 * Payload for `thinking` signals.
 * An AI model's internal reasoning/thinking step.
 */
export interface ThinkingPayload {
  /** The agent thinking. */
  readonly agentId: string;
  /** The thinking/reasoning text chunk. */
  readonly content: string;
}

// ---------------------------------------------------------------------------
// User interaction payload types (Stage → host, bidirectional loop)
// ---------------------------------------------------------------------------

/** 2D position on the board. */
export interface BoardPosition {
  readonly x: number;
  readonly y: number;
}

/** Rectangular bounds on the board. */
export interface BoardBounds {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Payload for `user.click` signals.
 * The user clicked on an entity in the Stage.
 */
export interface UserClickPayload {
  /** The entity that was clicked. */
  readonly target: string;
  /** Board position of the click. */
  readonly position?: BoardPosition;
}

/**
 * Payload for `user.move` signals.
 * The user dragged an entity to a slot.
 */
export interface UserMovePayload {
  /** The entity being moved. */
  readonly entityId: string;
  /** The destination slot ID. */
  readonly toSlot: string;
  /** The destination zone ID. */
  readonly toZone?: string;
}

/**
 * Payload for `user.zone` signals.
 * The user drew a zone on the board.
 */
export interface UserZonePayload {
  /** Bounds of the drawn zone. */
  readonly bounds: BoardBounds;
  /** Semantic intent (e.g., "patrol_area", "build_zone"). */
  readonly intent?: string;
}

/**
 * Payload for `user.command` signals.
 * The user selected an action from a context menu.
 */
export interface UserCommandPayload {
  /** The entity the command targets. */
  readonly entityId: string;
  /** The action identifier (e.g., "assign_task", "inspect"). */
  readonly action: string;
  /** Additional parameters for the action. */
  readonly params?: Record<string, unknown>;
}

/**
 * Payload for `user.point` signals.
 * The user clicked on an empty spot on the board.
 */
export interface UserPointPayload {
  /** Board position of the click. */
  readonly position: BoardPosition;
  /** The zone containing the click, if any. */
  readonly zone?: string;
}

// ---------------------------------------------------------------------------
// Payload type map (maps well-known signal type string to its payload)
// ---------------------------------------------------------------------------

/** Maps each well-known signal type to its corresponding payload interface. */
export interface SignalPayloadMap {
  task_dispatch: TaskDispatchPayload;
  tool_call: ToolCallPayload;
  tool_result: ToolResultPayload;
  token_usage: TokenUsagePayload;
  agent_state_change: AgentStateChangePayload;
  error: ErrorPayload;
  completion: CompletionPayload;
  text_delta: TextDeltaPayload;
  thinking: ThinkingPayload;
  "user.click": UserClickPayload;
  "user.move": UserMovePayload;
  "user.zone": UserZonePayload;
  "user.command": UserCommandPayload;
  "user.point": UserPointPayload;
}

// ---------------------------------------------------------------------------
// Signal envelope
// ---------------------------------------------------------------------------

/**
 * A typed signal event — the envelope wrapping a specific payload.
 *
 * Use this as a discriminated union: check `event.type` to narrow the payload.
 *
 * @example
 * ```ts
 * function handleSignal(signal: SignalEvent) {
 *   switch (signal.type) {
 *     case "task_dispatch":
 *       // signal.payload is TaskDispatchPayload
 *       console.log(signal.payload.taskId);
 *       break;
 *     case "error":
 *       // signal.payload is ErrorPayload
 *       console.log(signal.payload.severity);
 *       break;
 *   }
 * }
 * ```
 */
export type SignalEvent = {
  [K in WellKnownSignalType]: SignalEnvelope<K>;
}[WellKnownSignalType];

/**
 * The signal envelope — standard wrapper around a typed payload.
 *
 * For well-known types, the payload is strongly typed via `SignalPayloadMap`.
 * For custom/unknown types, the payload is `Readonly<Record<string, unknown>>`.
 *
 * @typeParam T - The signal type discriminator (any string)
 */
export interface SignalEnvelope<T extends string = string> {
  /** Unique signal ID (UUID or adapter-generated). */
  readonly id: string;
  /** Signal type discriminator. */
  readonly type: T;
  /** Unix epoch in milliseconds. */
  readonly timestamp: number;
  /** Identifies the adapter/producer (e.g., 'adapter:openclaw'). */
  readonly source: string;
  /** Groups related signals into an episode. */
  readonly correlationId?: string;
  /** Adapter-specific debug info, ignored by the choreographer. */
  readonly metadata?: Record<string, unknown>;
  /** The typed payload — shape depends on `type`. */
  readonly payload: T extends keyof SignalPayloadMap
    ? SignalPayloadMap[T]
    : Readonly<Record<string, unknown>>;
}
