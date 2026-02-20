# Choreographer Pipeline

How signals become entity animations and property assignments.

Once a signal passes through [wiring and filters](./wiring-patchbay), it enters the choreographer pipeline. Two execution tracks run in parallel on every matched signal — step sequences (Track A) and direct property bindings (Track B). Both tracks share the same render adapter and entity handles.

---

## Dual-Track Dispatch

```
dispatchSignal()
       |
  +----+------------------------+
  |                             |
  v                             v
Track A: Choreographer       Track B: BindingExecutor
(step sequences)             (direct property assignments)
  |                             |
  v                             v
RunModeSink                  handle.property = value
(CommandSink)
  |
  v
DisplayObjectHandle
(Three.js mesh)
```

**Track A** executes declarative step sequences: move, fly, flash, spawn, wait, parallel, and structural actions. Steps are authored in the step chain editor and exported as `ChoreographyDef.steps[]`.

**Track B** evaluates entity bindings created via drag-and-drop from a choreography node to an entity on the canvas. Each binding maps a signal payload value to a specific entity property.

Both tracks evaluate the same `when` condition and respond to the same effective signal types (wiring-driven).

---

## Track A — Step Sequences

### Choreographer Runtime

The choreographer lives in `@sajou/core` — framework-agnostic, zero dependencies.

When a signal matches a choreography's effective types:

1. **When-clause evaluation** — if `when` is defined, the signal payload must satisfy all conditions (AND form) or at least one condition (OR form, array syntax).
2. **Interruption check** — if `interrupts: true` and the signal carries a `correlationId`, any running performance with the same correlation is interrupted.
3. **Performance creation** — a new `Performance` is spawned, executing steps in sequence.

### Performance Lifecycle

```
Performance
  └─ StepCursor
       ├─ step 1: move   (animated: start → update(progress) → complete)
       ├─ step 2: flash  (animated: start → update(progress) → complete)
       ├─ step 3: spawn  (instant: execute)
       └─ step 4: wait   (pure timing, no command)
```

**Animated actions** (with `duration`): the sink receives `onActionStart()` at the beginning, `onActionUpdate(progress)` every frame (0 → 1), and `onActionComplete()` at the end.

**Instant actions**: the sink receives `onActionExecute()` immediately and the cursor advances.

**Structural actions**: `parallel` fans out to concurrent child steps. `onArrive` fires a continuation when a move completes. `onInterrupt` steps are extracted at performance start and only execute if the performance is interrupted.

### Entity Resolution

Each step targets an entity via a reference string:

```
entityRef (e.g. "agent", "signal.from")
  → resolveEntityRef(ref, signal)
  → if "signal.*": lookup in signal.payload
  → else: return as semantic ID
```

The `defaultTargetEntityId` on the choreography provides a fallback when a step doesn't specify its own entity.

### RunModeSink — Commands to Three.js

The sink implements `CommandSink` from `@sajou/core`. It bridges abstract commands to Three.js mesh operations.

**Entity resolution chain:**
```
semantic ID ("peon")
  → resolveEntityId()    // lookup in scene entities
  → placed instance ID ("peon-01")
  → adapter.getHandle()
  → DisplayObjectHandle  // Three.js mesh wrapper
```

**Implemented commands:**

| Command | Type | Action |
|---------|------|--------|
| `move` | Animated | `handle.x/y = lerp(start, target, progress)` |
| `fly` | Animated | Move + `sin(progress*PI)` arc height |
| `flash` | Animated | Blend tint round-trip |
| `followRoute` | Animated | Interpolation along a polyline path |
| `spawn` | Instant | `handle.visible = true` + teleport to position |
| `destroy` | Instant | `handle.visible = false` |
| `setAnimation` | Instant | `switchAnimation(state)` |

---

## Track B — Entity Bindings

### BindingExecutor

For each incoming signal:

1. Iterate all choreographies.
2. For each choreography, retrieve its bindings (`getBindingsFromChoreography()`).
3. Check if the signal type matches the choreography's effective types (wiring-driven).
4. Evaluate the `when` clause.
5. Execute each binding.

Bindings are read lazily on every signal — bindings added during run mode take effect immediately without restart.

### Value Extraction

Four strategies, evaluated in cascade:

1. **Explicit `sourceField`** — `payload[binding.sourceField]`
2. **Property name as path** — `payload[lastSegmentOfPropertyName]`
3. **Convention `payload.value`** — generic value field
4. **First numeric field** — scan payload for the first number

### Value Mapping

An optional `BindingMapping` transforms the extracted value:

```typescript
interface BindingMapping {
  inputRange: [number, number];
  outputRange: [number, number];
  fn: "lerp" | "clamp" | "step" | "smoothstep";
}
```

### Continuous vs Event-Driven Bindings

Float properties support two mutually exclusive modes, determined at binding creation time:

**Continuous (MIDI / live input):** When a binding has a `sourceField`, the executor reads the numeric value from every matching signal payload and applies it (with optional mapping) directly to the entity property. Each signal updates the property instantly — no animation, no fixed target. This is the path for MIDI CC faders, pitch bend wheels, and any other continuous-value source.

**Event-driven (AI signals):** When a binding has a `transition` (and no `sourceField`), the executor animates from the current property value to a fixed `targetValue` over `durationMs` with easing. This is the path for AI event signals where the signal means "something happened" rather than "here is a value".

The two modes are mutually exclusive by design: the UI creates `sourceField` bindings for MIDI float properties and `transition` bindings for non-MIDI float properties.

Dispatch priority in `executeBinding()`:

1. `sourceField` present + float property → `executeValueBinding()` (continuous)
2. `transition` present + float property → `startTransition()` (event-driven)
3. All other properties → instant assignment (switch/case fallback)

### Temporal Transitions

Float properties (`scale`, `opacity`, `rotation`, `position.x`, `position.y`) support animated transitions:

```
startTransition()
  → snapshot current value as fromValue
  → queue ActivePropertyAnim
  → rAF loop: tickAnims()
    → elapsed / durationMs → t
    → easingFn(t) → progress
    → handle.prop = lerp(fromValue, targetValue, progress)
    → on complete: optional revert to snapshot original
```

Available easings: `linear`, `easeIn`, `easeOut`, `easeInOut`, `arc`.

If a new signal arrives while a transition is in progress, the animation interrupts from the current interpolated value (not the original).

### Instant Property Assignment

Non-float properties are assigned immediately:

| Property | Action |
|----------|--------|
| `animation.state` | `switchAnimation(placedId, animState)` |
| `visible` | Toggle `handle.visible` |
| `opacity` | `handle.alpha = value` |
| `rotation` | `handle.rotation = value` |
| `scale` | `handle.scale.set(value)` |
| `position.x` / `position.y` | `handle.x/y = value` |
| `teleportTo` | Resolve waypoint → `handle.x/y` |
| `moveTo` | Same as teleportTo |
| `followRoute` | Route resolution + path follow |

---

## Binding Creation (UI)

Bindings are created by **dragging from a choreography node to an entity** on the canvas. The drop opens a radial menu with available properties:

1. **Topological actions** (if entity has routes/waypoints): `followRoute`, `teleportTo`, `moveTo`
2. **Animation states** (from spritesheet): `idle`, `walk`, `attack`...
3. **Spatial properties**: `position.x`, `position.y`, `rotation`, `scale`
4. **Visual properties**: `opacity`, `visible`

For float properties, the UI path depends on the signal source:
- **MIDI (sourceField selected):** creates an instant continuous binding with `sourceField` + auto-suggested mapping. No transition popup.
- **AI / generic (no sourceField):** opens a transition config popup (target value, duration, easing, revert toggle).

Non-float properties always create the binding immediately.

---

## Visual Structure

The step chain in the scene-builder maps directly to the data model:

```
┌─ on [task_dispatch ▼]  ▼ ✖ ──────────┐   hat block = ChoreographyDef.on
├─ ◧ filter  content contains "hello" ─┤   C-shape = ChoreographyDef.when
│  ├─ → move  agent  800ms  easeInOut ─┤   steps[] inside the jaw
│  ├─ ⚡ flash  #E8A851  300ms ─────────┤
│  └─ + ────────────────────────────────┤   drop zone
└───────────────────────────────────────┘   C-shape foot
```

| Visual element | Data field |
|----------------|------------|
| Hat: `on [task_dispatch]` | `ChoreographyDef.on` |
| Detail: target badge | `ChoreographyDef.defaultTargetEntityId` |
| Detail: interrupts checkbox | `ChoreographyDef.interrupts` |
| C-shape: `filter always` | `ChoreographyDef.when` (absent = always) |
| Steps in the jaw | `ChoreographyDef.steps[]` |
| Wires (source → hat) | `WireConnection[]` in wiring state |
| Wires (choreo → entity) | `EntityBinding[]` in binding store |

---

## Key Files

| File | Purpose |
|------|---------|
| `packages/core/src/choreographer/` | Runtime: Choreographer, Scheduler, Matcher, Resolver |
| `run-mode/run-mode-controller.ts` | Lifecycle, gate, dual-track dispatch |
| `run-mode/run-mode-sink.ts` | CommandSink → Three.js bridge |
| `run-mode/run-mode-bindings.ts` | BindingExecutor + temporal animations |
| `state/wiring-queries.ts` | `getChoreoInputInfo()`, effective types |
| `state/binding-store.ts` | EntityBinding CRUD |
| `workspace/binding-drop-menu.ts` | Radial menu for binding creation |
| `views/step-chain.ts` | Step chain renderer |
| `views/filter-block.ts` | C-shape filter block (when conditions) |
