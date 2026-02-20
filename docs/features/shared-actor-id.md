# Shared Actor IDs

Multiple entities on the canvas can share the same **Actor ID** (semantic ID). When they do, choreography steps and bindings target all of them simultaneously — one command, many instances.

---

## What are shared Actor IDs?

Every placed entity can have an Actor ID — a semantic name like `"peon"`, `"guard"`, or `"torch"` that choreographies use to reference it. Previously, Actor IDs had to be unique: one name, one entity.

With shared Actor IDs, you can give the **same** Actor ID to multiple entities. They become a logical group: a choreography step that says "move peon to camp" will move **all** peon instances at once.

---

## How to use them

### 1. Place multiple entities on the canvas

Drag several instances of the same (or different) entity types onto your scene. For example, place three peon sprites at different positions.

### 2. Set the same Actor ID

Select each entity and type the same Actor ID in the inspector — e.g. `peon` for all three. There is no uniqueness check; the field accepts any value.

### 3. Check the badge

When an Actor ID is shared, the inspector shows a **badge** next to the Actor ID field: `×3` means three entities share that ID. This confirms grouping is active.

### 4. Author choreographies as usual

In your choreography steps, reference the Actor ID (`peon`). The entity dropdown in the step editor shows each Actor ID only once, even when multiple entities share it.

---

## What happens in choreographies

When a choreography step targets a shared Actor ID:

- **All instances receive the command.** A `move` step moves every entity with that Actor ID.
- **Each instance animates independently.** They all start at the same time, but each tracks its own position, progress, and animation state. If one is closer to the target, it still follows the same easing curve.
- **Bindings fan out too.** If a binding maps a signal to `opacity` on `"peon"`, all peon instances change opacity together.

### Supported actions

All choreography actions support multi-instance fan-out:

| Action | Behavior with shared Actor ID |
|--------|-------------------------------|
| `move` | All instances move to the same target position |
| `fly` | All instances fly (arc trajectory) to the same target |
| `flash` | All instances flash the same color simultaneously |
| `followRoute` | All instances follow the same route path |
| `spawn` | All instances become visible (and teleport if `at` is specified) |
| `destroy` | All instances are hidden |
| `setAnimation` | All instances switch to the same animation state |

### Bindings

Entity bindings (opacity, rotation, scale, animation state, teleport, etc.) also apply to all instances. Both instant and temporal (eased) bindings fan out.

---

## The badge indicator

In the inspector panel, when you select an entity whose Actor ID is shared:

- A small badge appears next to the Actor ID field: **×N** (where N is the total count of entities sharing that ID).
- Hovering the badge shows a tooltip: "N entities share this actor ID".
- The badge updates live as you add or remove entities with the same Actor ID.

If the Actor ID is unique (only one entity uses it), no badge is shown.

---

## Example use cases

### Swarm of agents
Place 5 peon entities across the map, all with Actor ID `worker`. A single choreography step can make them all walk to the forge simultaneously when a `task_dispatch` signal arrives.

### Group of NPCs
Three guard entities share Actor ID `guard`. When an `alert` signal fires, a binding flashes all guards red and switches their animation to `alert_idle`.

### Environmental effects
Multiple torch entities share Actor ID `torch`. A `night_falls` signal triggers a binding that reduces their opacity to 0.6 and switches animation to `flicker_dim`.

### Synchronized decoration
Several flag entities share Actor ID `banner`. A choreography makes them all wave when a `victory` signal arrives, creating a coordinated visual effect across the scene.

---

## Technical details

- Entity resolution uses `resolveAllEntityIds(semanticId)` which returns all placed entity IDs matching the given Actor ID, in scene order.
- Animation state is keyed by `performanceId:placedId`, so each instance tracks independently even when driven by the same choreography performance.
- The entity reference dropdown in choreography step editors deduplicates shared Actor IDs — you see `"peon"` once, not three times.
- There is no limit on how many entities can share an Actor ID.
