# Choreographer Signal Flow

Technical specification for how signals flow through the scene-builder's run-mode choreographer, including entity resolution, command dispatch, and binding execution.

---

## Overview

When run mode is active, incoming signals are dispatched through two parallel paths:

```
Signal arrives
  ├──→ Choreographer.handleSignal()     [steps: move, fly, flash, followRoute…]
  └──→ BindingExecutor.handleSignal()   [bindings: animation.state, opacity…]
       └──→ resolveAllEntityIds(semanticId) → apply to every instance
```

Both paths use the same entity resolution mechanism to translate semantic IDs (the Actor ID authored in the scene) into concrete placed entity IDs (instance UUIDs on the canvas).

---

## Entity Resolution

Entity resolution is the process of mapping a `semanticId` (e.g. `"peon"`) from a choreography step or binding to the actual placed entity instances on the canvas.

### Resolution chain

```
semanticId → PlacedEntity[] (scene-state) → placedId[]
```

### Resolution functions (`run-mode-resolve.ts`)

| Function | Returns | Use case |
|----------|---------|----------|
| `resolveEntityId(semanticId)` | `string \| null` | Legacy — returns the first matching placed ID |
| `resolveEntity(semanticId)` | `PlacedEntity \| null` | Legacy — returns the first matching entity object |
| `resolveAllEntityIds(semanticId)` | `string[]` | **Multi-instance** — returns all matching placed IDs |
| `resolveAllEntities(semanticId)` | `PlacedEntity[]` | **Multi-instance** — returns all matching entity objects |

### Multi-instance fan-out

When multiple placed entities share the same `semanticId`, `resolveAllEntityIds()` returns all of them. Every command sink handler and binding executor iterates over the full list, applying the action to each instance independently.

**Example:** Three peon entities on the canvas all have `semanticId: "peon"`. A `move` step targeting `"peon"` resolves to three placed IDs, and all three peons move simultaneously.

### Position resolution

Position names from choreography params (`to`, `at`, `from`) are resolved separately:

```
position name → ScenePosition (scene-state) → { x, y }
```

This is handled by `resolvePosition(name)` and is unaffected by multi-instance — positions are unique by name.

---

## Track A: Command Sink (Choreography Steps)

The `RunModeSink` implements `@sajou/core`'s `CommandSink` interface. It receives action commands from the Choreographer runtime and applies them to display objects via a `RenderAdapter`.

### Fan-out behavior

Every handler in the sink uses `resolveAllEntityIds(cmd.entityRef)` to resolve the target. The action is then applied to **all** matching instances in a `for` loop:

```
onActionStart(cmd)
  → placedIds = resolveAllEntityIds(cmd.entityRef)
  → for each placedId:
      → adapter.getHandle(placedId)
      → create animation entry keyed by performanceId:placedId
```

### Animation state keying

Each instance gets its own independent animation state. The key format is:

```
performanceId:placedId
```

This ensures that when three peons move simultaneously from the same choreography performance, each tracks its own start position, progress, and completion independently.

### Supported actions

| Action | Start | Update | Complete |
|--------|-------|--------|----------|
| `move` | Record start/target positions | Linear interpolation | Snap to target |
| `fly` | Record start/target positions | Arc interpolation (sin curve) | Snap to target |
| `flash` | Save original tint | Blend tint with flash color | Restore tint |
| `followRoute` | Build polyline, teleport to start | Interpolate along path with flip | Snap to end, restore flip |
| `spawn` | Show entity, teleport to position | — | — |
| `destroy` | Hide entity | — | — |
| `setAnimation` | Switch spritesheet animation | — | — |
| `wait` | No-op (timing handled by scheduler) | — | — |

All of these fan out to every instance sharing the target `semanticId`.

---

## Track B: Binding Executor

The `BindingExecutor` is a peer of the Choreographer in the signal dispatch path. It evaluates entity bindings when signals match a choreography's type and `when` clause.

### Fan-out behavior

When a binding matches, `executeBinding()` calls `resolveAllEntityIds(binding.targetEntityId)` and applies the property change to every matching instance:

```
executeBinding(binding, signal)
  → placedIds = resolveAllEntityIds(binding.targetEntityId)
  → for each placedId:
      → apply property change (animation.state, opacity, scale, etc.)
```

### Binding modes

- **Instant**: Immediate property assignment. The value is set on every instance in the same frame.
- **Temporal**: Smooth animation to a target value with easing and optional revert. Each instance gets its own `ActivePropertyAnim` entry keyed by `placedId:prop`.

### Supported binding properties

`animation.state`, `visible`, `opacity`, `rotation`, `scale`, `position.x`, `position.y`, `teleportTo`

All properties fan out to every instance sharing the target semantic ID.

---

## Shared semanticId (Entity Grouping)

Multiple placed entities can share the same `semanticId`. This is the mechanism for entity grouping — a single choreography step or binding targets a logical role (e.g. `"peon"`, `"guard"`, `"torch"`) and all physical instances respond.

### Design properties

- **No uniqueness constraint**: The inspector allows any `semanticId` value, including values already used by other entities. There is no validation or warning.
- **Shared badge**: When an entity's `semanticId` is shared with other entities, the inspector shows a `×N` badge indicating the count.
- **Deduplicated dropdowns**: Entity reference controls in choreography step editors deduplicate shared `semanticId` values — the dropdown shows `"peon"` once, not three times.
- **Independent animation state**: Each instance tracks its own animation progress. They start together but can diverge if interrupted independently.

### Resolution guarantees

- `resolveAllEntityIds()` returns entities in scene order (insertion order in the entities array).
- An empty array is returned when no entity matches — callers handle this with a warning log.
- The single-match variants (`resolveEntityId`, `resolveEntity`) return only the first match for backward compatibility.
