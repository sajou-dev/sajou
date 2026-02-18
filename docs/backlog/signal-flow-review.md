# Signal Flow Review
Tiers: core
---

Review and harden the choreographer signal flow in run mode. Identify gaps in entity resolution, command dispatch, and binding execution.

## Issues

### Multi-instance semanticId resolution — RESOLVED

**Problem:** Entity resolution assumed a 1:1 mapping between semanticId and placed entity. When multiple entities shared the same semanticId, only the first match was used. This prevented entity grouping (swarms, NPC groups, environmental effects).

**Resolution:** Introduced `resolveAllEntityIds()` and `resolveAllEntities()` in `run-mode-resolve.ts`. Updated the CommandSink (`run-mode-sink.ts`) and BindingExecutor (`run-mode-bindings.ts`) to fan out every command and binding to all matching instances. Animation state is keyed by `performanceId:placedId` so each instance animates independently.

**UI changes:** Removed the uniqueness constraint on Actor ID in the inspector. Added a `×N` shared badge. Deduplicated the entity dropdown in choreography step editors.

**Implemented in:** `fix/multi-instance-resolve` branch (commits `ed509a5`, `0b882d2`).
