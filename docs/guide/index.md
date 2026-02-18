# Architecture

sajou is a **visual choreographer for AI agents**. It translates agent events -- signals -- into animated visual scenes via declarative choreographies. Think of it as a stage director that watches a stream of machine events and orchestrates a live visual performance in response.

sajou is not a dashboard. It is not a monitoring tool. It is a scene engine where signals are the music, choreographies are the score, and the stage is where the performance happens.

## The 3-layer architecture

The entire system is built on three layers. This separation is sacred -- never shortcut from signal directly to render. The choreography layer is the product.

```
Signals (data)  -->  Choreographer (sequences)  -->  Stage (render)
```

### Signals

Typed JSON events emitted by AI agent backends. Task dispatches, tool calls, state changes, streaming text, token usage, errors, user interactions.

The signal protocol is **open**: any string is a valid signal type. There are 14 well-known types with typed payloads (`task_dispatch`, `tool_call`, `tool_result`, `token_usage`, `agent_state_change`, `error`, `completion`, `text_delta`, `thinking`, and 5 `user.*` interaction types), but the bus accepts arbitrary types with `Record<string, unknown>` payloads. This means sajou can consume events from any backend without protocol changes.

Signals arrive over WebSocket, SSE, OpenAI-compatible streaming, Anthropic API, or the OpenClaw protocol. The transport is pluggable.

### Choreographer

The choreographer receives signals and triggers **performances** -- declarative step sequences described in JSON, not imperative code. This is what makes sajou composable by both humans and AIs.

A choreography looks like this:

```json
{
  "on": "task_dispatch",
  "steps": [
    { "action": "move", "entity": "agent", "to": "forge", "duration": 800 },
    { "action": "spawn", "entity": "pigeon", "at": "barracks" },
    { "action": "fly", "entity": "pigeon", "to": "oracle", "duration": 1200, "easing": "arc" },
    {
      "action": "onArrive",
      "steps": [
        { "action": "destroy", "entity": "pigeon" },
        { "action": "flash", "target": "oracle", "color": "gold" }
      ]
    }
  ]
}
```

The runtime supports concurrent performances with tween-based timing, step chaining (`onArrive`), interruption handling (`onInterrupt`), parallel execution, and a typed `CommandSink` interface that decouples choreography logic from any renderer.

The choreographer lives in `@sajou/core`. It has **zero external dependencies** and is framework-agnostic -- it runs in the browser and in Node.js. All choreographer logic is unit-testable without any rendering.

### Stage

The stage is the renderer. It takes commands from the choreographer and draws them on screen using Three.js.

Entities live on a 2D top-down board (orthographic camera, `scene(x, y)` mapped to `world(x, 0, z)`). The stage handles spritesheet animation (UV frame cycling), lights (ambient, directional, point lights with flicker), CPU-simulated particles, and shader effects.

The renderer library lives in `@sajou/stage`. The visual editor is `tools/scene-builder`.

## Package map

| Package | Role | Dependencies |
|---|---|---|
| `@sajou/schema` | Signal protocol types, scene format JSON Schema, TypeScript types generated from schemas | None |
| `@sajou/core` | Choreographer runtime -- zero deps, framework-agnostic, browser + Node.js | `@sajou/schema` |
| `@sajou/stage` | Three.js renderer library (EntityManager, LightManager, TextureLoader, cameras, CommandSink) | Three.js |
| `@sajou/emitter` | Test signal emitter with predefined scenarios (WebSocket, speed control, replay loop) | `@sajou/schema` |

::: tip Schema is the shared contract
`@sajou/schema` is the single source of truth for all declarative formats. Any change to schemas must be discussed and validated before implementation. If you need a schema change, propose it as a separate commit with justification.
:::

## Tools

| Tool | Description |
|---|---|
| **scene-builder** | Main authoring tool. Visual scene editor with entity placement, wiring (patch bay), node canvas, step chain editing, shader editor, run mode with live preview, and ZIP export/import. Built with Vite + Three.js + Canvas2D overlay. |
| **player** | Plays exported scene files produced by the scene-builder. |

## Key concepts

### Entities

Visual actors on the stage. Sprites, animated spritesheets, or GIF sequences placed at `(x, y)` positions on the board. Each entity has properties like position, scale, rotation, opacity, animation state, and billboard mode. Entities are defined in the scene and referenced by choreographies.

### Choreographies

Declarative step sequences triggered by signal types. The available step actions form a finite vocabulary:

| Action | Purpose |
|---|---|
| `move` | Move an entity to a position over a duration with easing |
| `spawn` | Create a new entity at a location |
| `destroy` | Remove an entity from the stage |
| `fly` | Move with a trajectory (arc, line, bezier) |
| `flash` | One-shot visual effect on a target |
| `pulse` | Repeating visual effect |
| `drawBeam` | Draw a visible connection between two points |
| `typeText` | Progressively reveal text at a location |
| `playSound` | Trigger an audio sample |
| `wait` | Pause in the sequence |
| `parallel` | Run multiple steps concurrently |
| `onArrive` | Chain steps after an animation completes |
| `onInterrupt` | Handle cancellation or error mid-flight |

### Wiring (Patch Bay)

A TouchDesigner-style connection graph that links signals to choreographies to renderers. The wiring system has three layers:

1. **Signal to signal-type** -- routes incoming signals to typed channels
2. **Signal-type to choreographer** -- connects signal types to choreography triggers
3. **Choreographer to theme/shader** -- connects choreography outputs to visual effects

### Positions and routes

Named waypoints and navigable paths on the stage. Entities move along routes between positions. Positions are semantic labels (e.g., "forge", "barracks", "oracle") that map to `(x, y)` coordinates.

### Bindings

Direct property assignments triggered by signals -- a peer of the choreographer in the dispatch path. While choreographies describe multi-step sequences, bindings handle immediate property changes: set opacity to 0.5, change animation state to "idle", rotate by 45 degrees. Bindings are simpler and faster than choreographies for single-property reactions.

### Signal filters

Wire-level processing pipelines that transform signals before they reach the choreographer. Filters are chained on individual wires:

- **throttle** -- limit signal rate
- **sample** -- take the latest value at intervals
- **delta** -- only pass when value changes
- **when** -- conditional gate (pass only if predicate is true)
- **map** -- transform payload fields

### Run mode

Live execution of the scene. When entering run mode, the scene-builder snapshots the current entity state, instantiates the choreographer, subscribes to the active signal sources, and dispatches incoming signals in real-time through the wiring graph. The choreographer triggers performances, the command sink forwards commands to the Three.js renderer, and the stage animates.

## Data flow

```
Signal Source (WebSocket / SSE / OpenClaw / Simulator)
    |
    v
Signal Bus (onSignal listeners)
    |
    |---> Signal Log (raw display, 10k retention)
    |
    +---> Run Mode Controller
              |
              |---> Wire Filter Chains (throttle, sample, delta, when, map)
              |
              |---> Choreographer (handleSignal -> trigger performances)
              |         |
              |         +---> CommandSink -> RenderAdapter -> Three.js
              |
              +---> Binding Executor (direct property assignments)
```

Signals enter through one of the supported transports, hit the signal bus, and fan out. The signal log captures everything for inspection (10,000 entries in memory, 500 rendered in the DOM with virtual scrolling). The run mode controller routes signals through the wiring graph: filter chains process them first, then the choreographer matches signal types to choreographies and triggers performances. The command sink is the bridge between the framework-agnostic choreographer and the Three.js renderer. In parallel, the binding executor applies direct property assignments that bypass the choreography system.

::: warning The choreography layer is not optional
Even for simple "set property X when signal Y arrives" cases, the data flows through the dispatch system (bindings), not directly from signal to renderer. The 3-layer separation is an invariant, not a guideline.
:::

## Architecture Decision Records

The foundational design decisions are documented in ADRs:

| ADR | Topic |
|---|---|
| [001 -- Signal Protocol](/reference/signal-protocol) | Envelope + typed payload, open protocol, `correlationId` grouping |
| 002 -- Choreographer Runtime | Concurrent performances, tween-based timing, typed CommandSink, TestClock |
| 002 -- Entity Format | Extensible entity format (sprites to spritesheets to 3D models) |
| 003 -- Renderer Stack | Three.js as the rendering foundation |
