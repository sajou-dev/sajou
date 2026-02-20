# ADR-001: Signal Protocol Design

**Status:** Proposed
**Date:** 2026-02-07
**Author:** schema+core agent

## Context

Sajou needs a standardized signal format — the data layer that feeds the choreographer. Signals represent events emitted by AI agent orchestrators (task dispatches, tool calls, errors, token usage, etc.). The signal protocol is the contract between:

- **Adapters** (producers): translate backend-specific events into Sajou signals
- **Signal bus** (consumer): receives, normalizes, and dispatches signals to the choreographer

The protocol must be:
1. **Backend-agnostic** — works with OpenClaw, LangChain, custom orchestrators
2. **Extensible** — new signal types can be added without breaking existing consumers
3. **Declarative** — JSON-serializable, no code in the payload
4. **LLM-friendly** — simple enough for an AI to generate signals or reason about them
5. **Ordered** — signals carry enough info to reconstruct temporal ordering

## Options Considered

### Option A: Flat event model

Every signal is a flat JSON object with a `type` discriminator and all fields at the top level.

```json
{
  "type": "task_dispatch",
  "taskId": "t-42",
  "agentId": "a-1",
  "from": "orchestrator",
  "to": "agent-solver",
  "description": "Solve the equation",
  "timestamp": 1738900000000
}
```

**Pros:** Simple, easy to parse, minimal nesting.
**Cons:** No separation between envelope (routing/meta) and payload (domain data). Hard to add protocol-level fields without colliding with payload fields. Validation is type-by-type with no shared base.

### Option B: Envelope + typed payload (recommended)

Every signal has a standard envelope (id, type, timestamp, source, metadata) wrapping a typed payload. The envelope is the same for all signals; the payload varies by type.

```json
{
  "id": "sig-001",
  "type": "task_dispatch",
  "timestamp": 1738900000000,
  "source": "adapter:openclaw",
  "payload": {
    "taskId": "t-42",
    "from": "orchestrator",
    "to": "agent-solver",
    "description": "Solve the equation"
  }
}
```

**Pros:** Clean separation of concerns. Envelope can carry protocol fields (id, ordering, source) without touching payload. Easy to validate: validate envelope once, then validate payload by type. Extensible — new types only need a new payload schema. LLM-friendly: the structure is predictable and self-describing.
**Cons:** Slightly more nesting. Slightly more verbose.

### Option C: Event sourcing model

Signals as immutable events with explicit causality chain (parentId, correlationId, sequence numbers).

```json
{
  "id": "sig-003",
  "type": "tool_result",
  "timestamp": 1738900002000,
  "parentId": "sig-002",
  "correlationId": "task-42",
  "sequence": 3,
  "payload": { ... }
}
```

**Pros:** Full causal graph, replay-friendly, robust ordering.
**Cons:** Overkill for V1. Adds complexity to adapters (they must track parent IDs). The choreographer doesn't need event sourcing — it needs temporal ordering and entity resolution.

## Decision

**Option B: Envelope + typed payload**, with selective elements from Option C.

Specifically:
- Every signal has an **envelope** with `id`, `type`, `timestamp`, `source`
- The `payload` is typed per signal type and is the only part that varies
- We add an optional `correlationId` (from Option C) to group related signals (e.g., all signals from the same task execution) — useful for the choreographer to track entity lifecycles
- We do NOT add `parentId` or `sequence` in V1 — timestamp ordering is sufficient for visual choreography
- We add an optional `metadata` bag for adapter-specific or debug info that the choreographer can ignore

## Signal Types for V1

The minimal set of signals that covers the agent lifecycle visible in the manifesto:

| Type | Description | Key Payload Fields |
|------|-------------|-------------------|
| `task_dispatch` | A task is assigned to an agent | taskId, from, to, description |
| `tool_call` | An agent invokes a tool | toolName, agentId, input |
| `tool_result` | A tool returns a result | toolName, agentId, output, success |
| `token_usage` | Token consumption report | agentId, promptTokens, completionTokens, model |
| `agent_state_change` | Agent transitions state | agentId, from, to (states: idle, thinking, acting, waiting, done, error) |
| `error` | Something went wrong | agentId, code, message, severity |
| `completion` | A task or workflow finishes | taskId, agentId, result, success |

These 7 types cover:
- The manifesto's example table (task_dispatch, tool_call, token_usage, error)
- Agent lifecycle (agent_state_change, completion)
- Tool interaction loop (tool_call → tool_result)

## Envelope Schema

```
SignalEnvelope {
  id: string              — unique signal ID (UUID or adapter-generated)
  type: SignalType         — discriminator, one of the 7 types above
  timestamp: number        — Unix epoch milliseconds
  source: string           — identifies the adapter/producer (e.g., "adapter:openclaw")
  correlationId?: string   — groups related signals (e.g., same task execution)
  metadata?: Record<string, unknown>  — adapter-specific debug info, ignored by choreographer
  payload: <varies by type>
}
```

## Consequences

- Adapters must map their native events to this envelope format
- The signal bus validates envelope structure, then dispatches by type
- The choreographer matches on `type` to trigger choreographies
- New signal types can be added by defining a new payload schema — no changes to envelope or bus
- `correlationId` lets the choreographer group signals into "episodes" for entity lifecycle tracking
- `metadata` provides an escape hatch for adapter-specific data without polluting the protocol

## Open Questions (for later ADRs)

- Should we support **signal acknowledgment** (choreographer confirms receipt)? Probably not in V1.
- Should signals carry **priority** levels? Might be useful for error signals interrupting animations.
- Should we formalize **agent identity** beyond a string `agentId`? (name, role, capabilities)
