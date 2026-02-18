# Signal Protocol Reference

Source of truth: `packages/schema/src/signal-types.ts` and `packages/schema/src/signal.schema.json`

---

## Envelope

Every signal is wrapped in a `SignalEnvelope`. The `type` field discriminates the payload shape.

```typescript
interface SignalEnvelope<T extends string = string> {
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
  /** The typed payload -- shape depends on `type`. */
  readonly payload: T extends keyof SignalPayloadMap
    ? SignalPayloadMap[T]
    : Readonly<Record<string, unknown>>;
}
```

---

## Well-Known Types

14 types total: 9 agent lifecycle + 5 user interaction.

| Type | Required Payload Fields | Optional Payload Fields |
|---|---|---|
| `task_dispatch` | `taskId`, `from`, `to` | `description` |
| `tool_call` | `toolName`, `agentId` | `callId`, `input` |
| `tool_result` | `toolName`, `agentId`, `success` | `callId`, `output` |
| `token_usage` | `agentId`, `promptTokens`, `completionTokens` | `model`, `cost` |
| `agent_state_change` | `agentId`, `from` (AgentState), `to` (AgentState) | `reason` |
| `error` | `message`, `severity` (ErrorSeverity) | `agentId`, `code` |
| `completion` | `taskId`, `success` | `agentId`, `result` |
| `text_delta` | `agentId`, `content` | `contentType`, `index` |
| `thinking` | `agentId`, `content` | -- |
| `user.click` | `target` | `position` (BoardPosition) |
| `user.move` | `entityId`, `toSlot` | `toZone` |
| `user.zone` | `bounds` (BoardBounds) | `intent` |
| `user.command` | `entityId`, `action` | `params` |
| `user.point` | `position` (BoardPosition) | `zone` |

---

## Enums

**AgentState** -- lifecycle states for an agent:
```typescript
type AgentState = "idle" | "thinking" | "acting" | "waiting" | "done" | "error";
```

**ErrorSeverity** -- affects visual intensity in the choreographer:
```typescript
type ErrorSeverity = "warning" | "error" | "critical";
```

---

## Shared Geometry Types

```typescript
interface BoardPosition {
  readonly x: number;
  readonly y: number;
}

interface BoardBounds {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
```

---

## Open Protocol

Any string is a valid signal type. Well-known types get typed payloads via `SignalPayloadMap`. Unknown types accept `Readonly<Record<string, unknown>>` as payload.

```typescript
type SignalType = WellKnownSignalType | (string & {});
```

The `(string & {})` trick preserves IDE autocomplete for the 14 known literals while accepting arbitrary strings.

---

## Discriminated Union Usage

```typescript
function handleSignal(signal: SignalEvent) {
  switch (signal.type) {
    case "task_dispatch":
      // signal.payload is TaskDispatchPayload
      console.log(signal.payload.taskId);
      break;
    case "error":
      // signal.payload is ErrorPayload
      console.log(signal.payload.severity);
      break;
  }
}
```

---

## Key Files

- `packages/schema/src/signal-types.ts` -- TypeScript types (aligned with JSON Schema)
- `packages/schema/src/signal.schema.json` -- JSON Schema (source of truth)
