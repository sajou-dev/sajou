### Wiring & Filters Guide

**Patch Bay concept:** TouchDesigner-style connection graph between signal sources, signal types, choreographies, and outputs (theme/shader).

**Wire Zones:**
| Zone | Description |
|---|---|
| `signal` | Signal source endpoints |
| `signal-type` | Signal type channels (task_dispatch, tool_call, etc.) |
| `choreographer` | Choreography definitions |
| `theme` | Theme output slots |
| `shader` | Shader uniform endpoints |

**Three wire layers:**
1. `signal -> signal-type`: "this source feeds this channel"
2. `signal-type -> choreographer`: "this channel triggers this choreography"
3. `choreographer -> theme/shader`: "this choreography outputs to theme/shader"

**WireConnection structure:**
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

**Implicit combinators (no special config needed):**
- **Merge** = multiple wires to the same choreography -- all signal types trigger it
- **Split** = `when` filters on parallel wires to different choreos -- conditional routing
- **Map** = `map` filter on a wire -- payload transformation

**Signal Filters (wire-level processing):**

5 filter types can be composed into a chain on each wire:

| Filter | Purpose | Stateful |
|---|---|---|
| `throttle` | Rate-limit by time interval (`intervalMs`) | Yes (`lastPass`) |
| `sample` | Pass every Nth signal (`every`) | Yes (`count`) |
| `delta` | Pass when numeric value at `path` changes by `threshold` | Yes (`lastValue`) |
| `when` | Conditional pass via when-clause evaluation | No |
| `map` | Transform payload fields (`from` -> `to`). Always passes. | No |

**FilterChain:** evaluates filters in sequence, short-circuits on first drop. Shallow-copies payload before mutation.

**Synthetic types for filtered dispatch:**
When a choreography has filtered wires, it's registered under `__f:<choreoId>` instead of its original signal type. The run-mode controller evaluates filter chains per-wire and dispatches the synthetic type when filters pass. Unfiltered choreographies keep normal behavior.

**Effective types resolution:**
- If signal-type->choreographer wires exist -- those are authoritative
- If no wires -- fallback to choreography's `on` field

**Key files:**
- `tools/scene-builder/src/state/wiring-state.ts` -- wire store + mutations
- `tools/scene-builder/src/state/wiring-queries.ts` -- derived lookups
- `tools/scene-builder/src/run-mode/signal-filters.ts` -- filter engine
- `tools/scene-builder/src/run-mode/when-matcher.ts` -- when-clause evaluator
