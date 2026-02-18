# Signal Filter Reference

Source of truth: `docs/guide/wiring-patchbay.md`, `tools/scene-builder/src/types.ts` (WhenClauseDef), `tools/scene-builder/src/run-mode/run-mode-bindings.ts` (matchesWhen)

---

## Filter Config Types

Five filter types can be composed into a chain on each wire connection:

```typescript
type SignalFilterConfig =
  | { type: "throttle"; intervalMs: number }
  | { type: "sample"; every: number }
  | { type: "delta"; path: string; threshold: number }
  | { type: "when"; clause: WhenClauseDef }
  | { type: "map"; mappings: Array<{ from: string; to: string }> };
```

Filters are declared in `WireConnection.filters`:

```typescript
interface WireConnection {
  id: string;
  fromZone: "signal" | "signal-type" | "choreographer";
  fromId: string;
  toZone: "signal-type" | "choreographer" | "theme" | "shader";
  toId: string;
  mapping?: { fn: string; args: number[] };
  filters?: SignalFilterConfig[];
}
```

---

## Filter Types

### throttle -- rate-limit by time interval

Pass at most one signal per `intervalMs` milliseconds. Stateful: tracks `lastPass` timestamp.

```typescript
{ type: "throttle", intervalMs: 500 }
```

Use case: a `text_delta` stream at 60 msg/s throttled to ~2 msg/s for animation pacing.

---

### sample -- pass every Nth signal

Pass one signal out of every `every` signals. Stateful: tracks `count`.

```typescript
{ type: "sample", every: 10 }
```

Use case: token usage updates -- only animate every 10th report.

---

### delta -- pass on significant change

Pass a signal only when the numeric value at `path` changes by at least `threshold` compared to the last passed value. Stateful: tracks `lastValue`.

```typescript
{ type: "delta", path: "stats.cpu", threshold: 5 }
```

Use case: CPU metric signals -- only trigger animation when CPU changes by 5 or more points.

---

### when -- conditional pass

Pass only when the signal payload matches the when-clause. Stateless.

```typescript
{ type: "when", clause: { status: { equals: "done" } } }
```

Use case: route a `completion` signal only when `success` is true.

---

### map -- transform payload fields

Rename or extract payload fields. Always passes (it is a transformation, not a gate). Stateless.

```typescript
{ type: "map", mappings: [{ from: "raw_data.value", to: "value" }] }
```

Use case: flatten a nested payload structure before it reaches the choreographer.

---

## FilterChain

- Evaluates filters in sequence (array order).
- Short-circuits on the first filter that drops the signal.
- Shallow-copies the payload before mutation (map filter does not modify the original).
- The `map` filter always passes -- it transforms but never drops.

---

## When Clause Syntax

The `when` clause is the conditional expression system used by both choreography triggers and wire filters.

### Structure

```typescript
type WhenClauseDef = WhenConditionDef | WhenConditionDef[];
type WhenConditionDef = Record<string, WhenOperatorDef>;
```

- **Object form** = AND: all entries in the object must match.
- **Array form** = OR: at least one entry in the array must match.

### Operators

```typescript
interface WhenOperatorDef {
  equals?: unknown;           // strict equality
  contains?: string;          // substring match
  matches?: string;           // regex match
  gt?: number;                // greater than
  lt?: number;                // less than
  exists?: boolean;           // field exists (true) or absent (false)
  not?: WhenOperatorDef;      // negation of inner operator
}
```

Multiple operator keys in the same `WhenOperatorDef` are AND-combined.

### Path resolution

- Paths like `"signal.content"` or just `"content"` resolve against the signal payload.
- The `signal.` prefix is stripped if present (both forms are equivalent).

### Examples

Single condition (AND -- all must match):
```json
{
  "signal.content": { "contains": "error" },
  "signal.severity": { "equals": "critical" }
}
```

Multiple conditions (OR -- at least one must match):
```json
[
  { "status": { "equals": "done" } },
  { "status": { "equals": "error" } }
]
```

Negation:
```json
{ "agentId": { "not": { "equals": "system" } } }
```

Range:
```json
{ "promptTokens": { "gt": 100, "lt": 10000 } }
```

Existence check:
```json
{ "output": { "exists": true } }
```

---

## Synthetic Types for Filtered Dispatch

When a choreography has filtered wires, it is registered under a synthetic type `__f:<choreoId>` instead of its original signal type. The run-mode controller evaluates the filter chain per-wire and dispatches the synthetic type when filters pass. Choreographies without filters keep normal behavior.

---

## Implicit Combinators

No special configuration required -- wire topology creates these patterns:

| Pattern | Topology | Effect |
|---|---|---|
| **Merge** | Multiple wires to the same choreography | All signal types trigger it |
| **Split** | `when` filters on parallel wires to different choreographies | Conditional routing |
| **Map** | `map` filter on a wire | Payload transformation before choreography |

---

## Key Files

- `tools/scene-builder/src/state/wiring-state.ts` -- wire store and mutations
- `tools/scene-builder/src/state/wiring-queries.ts` -- derived lookups (effective types)
- `tools/scene-builder/src/run-mode/run-mode-bindings.ts` -- `matchesWhen()` implementation
- `tools/scene-builder/src/types.ts` -- `WhenClauseDef`, `WhenConditionDef`, `WhenOperatorDef`
- `docs/guide/wiring-patchbay.md` -- wiring and filter architecture guide
