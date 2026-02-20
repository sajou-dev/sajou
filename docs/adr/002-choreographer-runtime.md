# ADR-002: Choreographer Runtime Design

**Status:** Proposed
**Date:** 2026-02-07
**Author:** core/choreographer agent

## Context

The choreographer is the heart of Sajou — the layer between signals (data) and themes (render). It reads declarative choreography definitions (JSON) and executes them as timed sequences of visual actions when signals arrive.

The manifesto defines 12 primitives (`move`, `spawn`, `destroy`, `fly`, `flash`, `pulse`, `drawBeam`, `typeText`, `playSound`, `wait`, `onArrive`, `onInterrupt`) and shows a choreography JSON format where steps execute sequentially with chaining via `onArrive`.

This ADR addresses the four open questions from CLAUDE.md:

1. How do we handle **concurrent choreographies**?
2. How do we handle **interruptions**?
3. What is the **timing/easing system**?
4. How does the choreographer **communicate with theme renderers**?

### Constraints

- `@sajou/core` has **zero external dependencies** — vanilla TypeScript only
- Must run in **browser and Node.js**
- Must be fully **unit-testable without rendering**
- The choreographer must not know about specific themes, entities, or renderers
- All choreography logic is declared in **JSON, not imperative code**

## 1. Concurrent Choreographies

### Problem

Multiple signals can arrive simultaneously or overlap. A `task_dispatch` may trigger a 2-second choreography, and a `tool_call` may arrive 500ms later. Both want to animate entities.

### Options Considered

**Option A: Total independence**
Each signal creates an independent choreography instance ("performance"). Performances run in parallel with no awareness of each other. Entity conflicts (two performances moving the same entity) are the theme's problem.

*Pros:* Simple. No coordination overhead. Easy to reason about.
*Cons:* Can cause visual glitches (entity teleporting between two destinations).

**Option B: Entity-level locking**
Only one performance can act on a given entity at a time. New performances targeting a locked entity queue until the lock is released.

*Pros:* Prevents visual conflicts. Predictable.
*Cons:* Can cause visual stalls (animation waits for unrelated work). Complex lock management. Deadlock risk if two choreographies lock each other's entities.

**Option C: Priority + preemption**
Each choreography has a priority. Higher-priority performances can interrupt lower-priority ones acting on the same entity.

*Pros:* Most flexible. Error choreographies naturally preempt normal ones.
*Cons:* Priority assignment is complex. Hard to predict behavior. Overkill for V1.

### Decision: Option A (independence) + correlation-scoped interruption

Performances run independently. No entity locking. The choreographer tracks active performances indexed by `correlationId`. When an interrupting signal arrives (e.g., `error`), it can cancel all performances sharing the same `correlationId` — triggering their `onInterrupt` handlers.

This is simple, predictable, and covers the main use case (error interrupts a running task choreography) without the complexity of entity locking or priority management.

**V2 consideration:** If visual conflicts become a problem in practice, we can add optional entity-level guards as a choreography-level declaration (not a runtime mechanism).

## 2. Interruptions

### Problem

An `error` signal arrives while a `task_dispatch` choreography is mid-animation (the peon is walking, the pigeon is flying). The error choreography must:
- Cancel the running choreography's remaining steps
- Trigger the `onInterrupt` handler if defined
- Start its own choreography (explosion, red flash, etc.)

### Design

A choreography definition can declare `interrupts`:

```json
{
  "on": "error",
  "interrupts": true,
  "steps": [
    { "action": "flash", "target": "signal.agentId", "color": "red", "duration": 300 },
    { "action": "playSound", "sound": "error_alert" }
  ]
}
```

When `interrupts: true`, the choreographer:

1. Finds all active performances with the same `correlationId` as the incoming signal
2. For each, cancels remaining steps and fires their `onInterrupt` handlers (if any)
3. Starts the interrupting choreography

The `onInterrupt` handler is defined inline in the choreography being interrupted:

```json
{
  "on": "task_dispatch",
  "steps": [
    { "action": "fly", "entity": "pigeon", "to": "signal.to", "duration": 1200, "easing": "arc" },
    {
      "action": "onInterrupt",
      "steps": [
        { "action": "destroy", "entity": "pigeon" },
        { "action": "flash", "target": "signal.from", "color": "red", "duration": 200 }
      ]
    }
  ]
}
```

`onInterrupt` is **not a step** in the sequence — it's a handler attached to the performance. If the performance completes normally, `onInterrupt` is never executed.

## 3. Timing & Easing System

### Options Considered

**Option A: Keyframe-based (CSS animations)**
Define start/end states with easing. Familiar to web developers.
*Cons:* Requires state descriptions, not just progress. Couples to rendering properties.

**Option B: Tween-based (progress 0→1)**
The choreographer manages elapsed time and easing, producing a `progress` value from 0 to 1. The theme interprets what progress means visually.
*Pros:* Framework-agnostic. Clean separation. Easy to test (advance time, check progress).
*Cons:* Theme must do its own interpolation.

**Option C: Physics-based (springs, decay)**
Natural-feeling motion. Used by React Spring, Framer Motion.
*Cons:* Non-deterministic duration. Hard to sequence. Overkill for V1.

### Decision: Option B — tween-based with built-in easing functions

The choreographer owns **time**. For each animated action, it:

1. Records `startTime` when the action begins
2. On each frame tick, computes `elapsed = now - startTime`
3. Computes `rawProgress = clamp(elapsed / duration, 0, 1)`
4. Applies the easing function: `progress = easing(rawProgress)`
5. Emits an action command with the progress value
6. When `rawProgress >= 1`, the action is complete

**Built-in easing functions** (V1):

| Name | Function | Use case |
|------|----------|----------|
| `linear` | `t` | Constant speed |
| `easeIn` | `t²` | Accelerate from rest |
| `easeOut` | `1 - (1-t)²` | Decelerate to rest |
| `easeInOut` | Smooth S-curve | Most natural movement |
| `arc` | Parabolic Y offset | Projectile trajectories (fly, pigeon) |

Easings are **pure functions** `(t: number) => number` where `t ∈ [0, 1]` and the result is typically in `[0, 1]`. Themes can register custom easings if needed.

### Clock Abstraction

To run in browser, Node.js, and tests, the runtime uses an injectable `Clock` interface:

```ts
interface Clock {
  /** Current time in milliseconds (monotonic). */
  now(): number;
  /** Request a callback on the next frame. Returns a cancel handle. */
  requestFrame(callback: (timestamp: number) => void): CancelHandle;
}

interface CancelHandle {
  cancel(): void;
}
```

Three implementations:
- **`BrowserClock`**: wraps `performance.now()` + `requestAnimationFrame`
- **`NodeClock`**: wraps `performance.now()` + `setTimeout(cb, 16)`
- **`TestClock`**: manual time advancement — `clock.advance(500)` jumps 500ms, synchronously firing all scheduled callbacks. This makes choreographer tests deterministic.

## 4. Choreographer ↔ Theme Communication

### Options Considered

**Option A: Direct renderer callbacks**
The choreographer calls `renderer.move(entity, progress, params)` directly.
*Cons:* Tight coupling. Choreographer must hold references to renderers. Hard to test.

**Option B: Event emitter pattern**
The choreographer emits events (`"actionStart"`, `"actionUpdate"`, `"actionComplete"`). The theme subscribes.
*Pros:* Loose coupling. Easy to test (subscribe and assert events). Multiple listeners.
*Cons:* Untyped events can be fragile. Ordering guarantees needed.

**Option C: Command dispatch**
The choreographer produces typed `ActionCommand` objects. A `Dispatcher` routes them to the theme's registered handlers.
*Pros:* Strongly typed. Testable (collect commands, assert). Clean contract.
*Cons:* Slightly more ceremony than events.

### Decision: Option C — typed command dispatch

The choreographer produces **action commands** via a `CommandSink` interface:

```ts
interface CommandSink {
  /** An animated action begins. */
  onActionStart(command: ActionStartCommand): void;
  /** Frame update for an animated action. */
  onActionUpdate(command: ActionUpdateCommand): void;
  /** An animated action completes normally. */
  onActionComplete(command: ActionCompleteCommand): void;
  /** An instant action should be executed. */
  onActionExecute(command: ActionExecuteCommand): void;
  /** A performance was interrupted. */
  onInterrupt(command: InterruptCommand): void;
}
```

Action commands carry:
- `performanceId` — which choreography instance
- `action` — the action name (`"move"`, `"spawn"`, etc.)
- `entityRef` — the entity reference (resolved from signal)
- `params` — action-specific parameters
- `progress` — (for update commands) the eased progress [0, 1]

The theme registers a `CommandSink` implementation with the choreographer. In tests, a `RecordingSink` captures all commands for assertion.

**Two categories of actions:**

| Category | Lifecycle | Examples |
|----------|-----------|---------|
| **Animated** | start → update* → complete | `move`, `fly`, `flash`, `pulse`, `drawBeam`, `typeText` |
| **Instant** | execute (one-shot) | `spawn`, `destroy`, `playSound` |

`wait` is internal to the choreographer — it advances time but emits no commands.
`onArrive` is not an action — it's a continuation (the next steps after the parent completes).
`onInterrupt` is not an action — it's a handler attached to the performance.

## 5. Runtime Architecture

### Core Components

```
┌─────────────────────────────────────────────────┐
│  Choreographer                                   │
│                                                  │
│  ┌──────────────┐    ┌───────────────────────┐  │
│  │ Registry     │    │ Scheduler             │  │
│  │              │    │                       │  │
│  │ choreography │───▶│ active performances   │  │
│  │ definitions  │    │ frame loop            │  │
│  │ (JSON)       │    │ clock abstraction     │  │
│  └──────────────┘    └───────┬───────────────┘  │
│                              │                   │
│  ┌──────────────┐            │                   │
│  │ Resolver     │            │                   │
│  │              │◀───────────┘                   │
│  │ signal.*     │                                │
│  │ interpolation│──────────▶ CommandSink         │
│  └──────────────┘            (theme implements)  │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Registry** — Stores choreography definitions (JSON). Indexed by signal type. Multiple choreographies can trigger on the same signal type.

**Resolver** — Resolves `signal.*` references in choreography steps. When a step says `"to": "signal.to"`, the resolver looks up `signal.payload.to` from the incoming signal. Also resolves `"signal.agentId"`, `"signal.from"`, etc.

**Scheduler** — Manages the frame loop and active performances. Each performance is an in-progress choreography instance with:
- The choreography definition
- The resolved signal that triggered it
- A cursor pointing to the current step
- The current animated action's timing state (startTime, duration, easing)

**Performance lifecycle:**
1. Signal arrives → Registry finds matching choreographies
2. For each match: create a Performance with resolved signal references
3. Scheduler adds performance to active set, starts frame loop if not running
4. Each frame: advance all active performances (compute progress, emit commands)
5. When a step completes: advance cursor to next step
6. When all steps complete (or interrupted): remove performance from active set
7. When no active performances remain: stop frame loop

### Step Sequencing

Steps in a choreography execute **sequentially** by default. Each step waits for the previous to complete.

For parallel execution, a `parallel` meta-action groups steps that run concurrently:

```json
{
  "action": "parallel",
  "steps": [
    { "action": "move", "entity": "agent", "to": "forge", "duration": 800 },
    { "action": "flash", "target": "forge", "color": "gold", "duration": 400 }
  ]
}
```

The `parallel` group completes when all its children complete.

### Signal Reference Resolution

Choreography steps reference signal data via `signal.<path>` strings:

| Reference | Resolves to |
|-----------|-------------|
| `signal.from` | `signal.payload.from` |
| `signal.to` | `signal.payload.to` |
| `signal.agentId` | `signal.payload.agentId` |
| `signal.taskId` | `signal.payload.taskId` |
| `signal.toolName` | `signal.payload.toolName` |

Resolution is a simple dot-path lookup on the signal's payload. Unknown paths resolve to `undefined` and the choreographer logs a warning.

## Consequences

- The choreographer is **pure logic** — no DOM, no Canvas, no framework. Fully testable.
- Theme integration is a single interface (`CommandSink`). Themes don't need to understand timing.
- The `TestClock` enables deterministic tests: advance time, assert commands, no flaky timeouts.
- Choreographies remain pure JSON — the `parallel`, `onArrive`, `onInterrupt` constructs are interpreted by the runtime, not by theme code.
- Adding new primitives means: (1) add to schema, (2) classify as animated or instant, (3) implement resolver in the scheduler. No changes to the core runtime loop.
- The `interrupts` mechanism is scoped to `correlationId` — simple and predictable. No global priority system.

## V1 Limitations

- **No entity-level conflict resolution.** If two independent performances animate the same entity simultaneously (e.g., two `move` actions targeting entity `"agent"` from different choreographies), both command streams are emitted and the theme receives both. The visual result depends on how the theme's renderer handles conflicting updates — typically last-write-wins. This is a known tradeoff: V1 favours simplicity over coordination. In practice, choreography authors should avoid concurrent triggers on the same entity, or use `correlationId`-scoped interruption to prevent overlap. Entity-level guards may be explored in V2 if this proves problematic.

## Open Questions (for later ADRs)

- **Entity identity in the choreographer:** When a step says `"entity": "agent"`, how does the choreographer map that to a theme entity instance? Likely the theme maintains an entity registry and the choreographer uses logical names.
- **Choreography composition:** Can choreographies include/extend other choreographies? Useful for themes that want to build on a base set.
- **Conditional steps:** Should choreographies support `if` conditions? (e.g., only flash if `signal.payload.severity === "critical"`). Useful but adds complexity.
- **Custom easing registration:** How does a theme register custom easing functions? Probably via the choreographer constructor options.
