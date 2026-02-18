# Signal Flow Pipeline

How signals travel from source to visual output in sajou.

sajou's architecture is a strict three-layer pipeline: **Signal -> Choreographer -> Stage**. Signals are the raw data emitted by AI agent backends. The choreographer interprets them as declarative animation sequences. The stage renders them visually. This document covers the first layer and its path into the choreographer.

---

## Signal Sources

sajou connects to multiple signal sources simultaneously. Each source is an independent connection with its own transport protocol, identity color, connection status, and optional API key.

Sources are split into two categories:

- **LOCAL** -- auto-discovered services running on the developer's machine. These have fixed identity colors that remain stable across sessions.
- **REMOTE** -- manually added endpoints. These receive rotating palette colors on creation.

### Transport Protocols

Six transport protocols are supported:

| Protocol | Detection | Use case |
|----------|-----------|----------|
| `websocket` | URL starts with `ws://` or `wss://` | sajou emitter, real-time backends |
| `sse` | Default fallback for HTTP URLs | Generic streaming endpoints |
| `openai` | Probed via `GET /v1/models` | LM Studio, Ollama, vLLM, any OpenAI-compatible API |
| `anthropic` | URL contains "anthropic" | Anthropic Messages API |
| `openclaw` | Port 18789 or "openclaw" in URL | OpenClaw gateway |
| `midi` | URL starts with `midi://` | Hardware MIDI controllers |

Protocol detection happens at connection time. For SSE-detected URLs, the connection manager first probes for OpenAI compatibility (`GET /v1/models`). If the probe returns a model list, the protocol is upgraded to `openai`. Otherwise it falls back to plain SSE streaming.

### Connection States

Each source tracks one of five states:

- `disconnected` -- idle, ready to connect
- `connecting` -- handshake or probe in progress
- `connected` -- actively receiving signals
- `error` -- connection failed (with error message)
- `unavailable` -- discovered but not reachable (grayed out in UI)

---

## Local Discovery

The scene-builder's Vite dev server exposes a discovery endpoint:

```
GET /api/discover/local
```

This endpoint probes four well-known local services:

| Service | Probe method | Default address |
|---------|-------------|-----------------|
| Claude Code | SSE availability | Local dev server SSE stream |
| OpenClaw | TCP probe | `localhost:18789` |
| LM Studio | HTTP `GET /v1/models` | `localhost:1234` |
| Ollama | HTTP `GET /v1/models` | `localhost:11434` |

Probes run with a 300ms timeout using `Promise.allSettled()` -- no single slow service blocks the others. MIDI devices are discovered separately via the browser's Web MIDI API.

Discovery creates source entries in the state store but does not auto-connect, with two exceptions:

- **Claude Code** auto-connects if detected (installs hooks via `POST /api/tap/connect`, then opens an SSE stream on `/__signals__/stream`).
- **OpenClaw** auto-connects if detected *and* a token is available (fetched from `~/.openclaw/openclaw.json` via `GET /api/openclaw/token`).

Source IDs for local services are fixed strings:

```
local:claude-code
local:openclaw
local:lm-studio
local:ollama
```

The UI provides a Rescan button that re-runs discovery. MIDI devices also trigger automatic rescans on hot-plug/unplug events.

### Source Synchronization

When discovery runs, `upsertLocalSources()` reconciles the fresh probe results with existing state:

- New services get source entries created.
- Existing available services get their model lists updated.
- Disappeared services are marked `unavailable`.
- Connected or connecting sources are never touched -- active connections are not interrupted.

---

## Signal Envelope

Every signal conforms to a standard envelope. The JSON Schema is the source of truth (`packages/schema/src/signal.schema.json`), with TypeScript types aligned to it.

```typescript
interface SignalEnvelope<T extends string = string> {
  readonly id: string;             // UUID or adapter-generated
  readonly type: T;                // Discriminator (open protocol -- any string is valid)
  readonly timestamp: number;      // Unix epoch in milliseconds
  readonly source: string;         // Producer ID (e.g. "adapter:openclaw")
  readonly correlationId?: string; // Groups related signals into an episode
  readonly metadata?: Record<string, unknown>; // Adapter-specific, ignored by choreographer
  readonly payload: object;        // Shape depends on type
}
```

The protocol is **open**: any string is a valid signal type. Well-known types get strongly typed payloads via a discriminated union. Custom types (e.g. `"my_custom_event"`) are accepted with a generic `Record<string, unknown>` payload.

---

## Well-Known Signal Types

### Agent orchestration (9 types)

| Type | Description | Key payload fields |
|------|-------------|--------------------|
| `task_dispatch` | Task assigned to an agent | `taskId`, `from`, `to`, `description?` |
| `tool_call` | Agent invokes a tool | `toolName`, `agentId`, `callId?`, `input?` |
| `tool_result` | Tool returns a result | `toolName`, `agentId`, `callId?`, `success`, `output?` |
| `token_usage` | Token consumption report | `agentId`, `promptTokens`, `completionTokens`, `model?`, `cost?` |
| `agent_state_change` | Agent transitions state | `agentId`, `from`, `to` (both `AgentState`), `reason?` |
| `error` | Something went wrong | `agentId?`, `code?`, `message`, `severity` (warning/error/critical) |
| `completion` | Task finished | `taskId`, `agentId?`, `success`, `result?` |
| `text_delta` | Streaming text chunk | `agentId`, `content`, `contentType?`, `index?` |
| `thinking` | AI reasoning step | `agentId`, `content` |

Agent states follow this lifecycle: `idle` -> `thinking` -> `acting` -> `waiting` -> `done` (or `error`).

### User interaction (5 types)

These flow in the opposite direction -- from the Stage back to the host application, forming a bidirectional loop.

| Type | Description | Key payload fields |
|------|-------------|--------------------|
| `user.click` | Clicked on an entity | `target`, `position?` |
| `user.move` | Dragged entity to a slot | `entityId`, `toSlot`, `toZone?` |
| `user.zone` | Drew a zone on the board | `bounds` (`{x, y, w, h}`), `intent?` |
| `user.command` | Selected context menu action | `entityId`, `action`, `params?` |
| `user.point` | Clicked on empty spot | `position` (`{x, y}`), `zone?` |

---

## Dispatch Pipeline

When a signal arrives from any source, it flows through these stages:

```
Source connection
  |
  v
1. Parse raw message into ReceivedSignal
  |
  v
2. dispatchSignal() broadcasts to all onSignal listeners
  |   |
  |   +-- Signal log (appends to in-memory buffer, up to 10,000 entries)
  |   +-- Run mode controller
  |
  v
3. Run mode controller checks effective types per choreography (wiring-driven)
  |
  v
4. Wire filter chains evaluate (throttle, sample, delta, when, map)
  |
  v
5. Filtered signals dispatched to choreographer (with synthetic types for filtered choreos)
  |
  v
6. Binding executor evaluates in parallel (direct property assignments)
  |
  v
7. Signal counter incremented
```

Step 1 depends on the transport protocol. Each protocol has its own parser:

- **WebSocket / SSE**: `parseMessage()` -- expects sajou envelope JSON or NDJSON.
- **OpenAI**: `parseOpenAIChunk()` -- translates SSE delta chunks into `text_delta`, `completion`, and `token_usage` signals.
- **Anthropic**: `parseAnthropicEvent()` -- translates `message_start`, `content_block_delta`, `message_delta`, and `message_stop` events into sajou signals.
- **OpenClaw**: `parseOpenClawEvent()` -- prefers `data.delta` over `data.text` for incremental streaming. Heartbeat and cron events are tagged with `_meta.heartbeat` / `_meta.cron` for UI filtering.
- **MIDI**: `parseMIDIMessage()` -- translates MIDI note/CC messages into sajou signals.

Steps 3-6 are wiring-driven. The scene-builder's node canvas defines which signal types feed which choreographies and bindings. Only signals matching the wired types pass through. Wire filters can throttle, sample, compute deltas, apply conditions, or remap signals before they reach the choreographer.

---

## OpenClaw Integration

OpenClaw is a local AI agent gateway. sajou treats it as a first-class transport.

### Connection Handshake

1. Open WebSocket to `ws://localhost:18789` (or configured URL).
2. Receive `connect.challenge` event (may arrive as `{type:"connect.challenge"}` or wrapped in an envelope `{type:"event", event:"connect.challenge", payload:{nonce, ts}}`).
3. Send `connect` request with protocol v3, auth token, and client metadata:
   ```json
   {
     "type": "req",
     "method": "connect",
     "params": {
       "minProtocol": 3,
       "maxProtocol": 3,
       "client": { "id": "gateway-client", "platform": "web", "mode": "backend" },
       "role": "operator",
       "scopes": ["operator.read"],
       "auth": { "token": "<token>" }
     }
   }
   ```
4. Receive `{type:"res", ok:true}` -- connection established.

### Reconnection

On unclean disconnect, OpenClaw connections attempt exponential backoff reconnection: up to 10 attempts, starting at 1 second and capping at 30 seconds. Successful reconnection resets the attempt counter.

### Token Auto-Fill

The Vite dev server reads `~/.openclaw/openclaw.json` and exposes the gateway auth token at `GET /api/openclaw/token`. At scan time, if the OpenClaw source has no API key set, the token is auto-filled. The UI shows a "token auto-filled" badge and provides a manual "Paste from config" button in the source popover.

### Event Parsing

After handshake, all incoming events (except `pong` and `res` frames) are passed to `parseOpenClawEvent()`. Each parsed signal carries channel metadata (`channel`, `channelLabel`, `sessionKey`) on its payload. Internal events (heartbeat, cron) are tagged in `_meta` so the UI can filter them out of the signal log.

---

## Key Files

| File | Purpose |
|------|---------|
| `packages/schema/src/signal.schema.json` | JSON Schema -- the source of truth for the signal protocol |
| `packages/schema/src/signal-types.ts` | TypeScript types aligned with the schema |
| `tools/scene-builder/src/views/signal-connection.ts` | Multi-protocol connection manager, signal dispatch |
| `tools/scene-builder/src/state/signal-source-state.ts` | Source state store (identity colors, status, upsert logic) |
| `tools/scene-builder/src/state/local-discovery.ts` | Local service discovery client, OpenClaw token fetch |
| `tools/scene-builder/src/simulator/signal-parser.ts` | Protocol-specific parsers (WebSocket, OpenAI, Anthropic, OpenClaw) |
| `tools/scene-builder/src/midi/midi-parser.ts` | MIDI message parser |
| `tools/scene-builder/src/midi/midi-discovery.ts` | Web MIDI device discovery |
