### Run Mode Guide

Run mode = live choreography execution. The scene becomes alive.

**Lifecycle -- startRunMode():**
1. Snapshot entity transforms (position, scale, rotation, opacity, visible)
2. Lazy-import `@sajou/core` (Choreographer, BrowserClock)
3. Create RenderAdapter (Three.js bridge) + CommandSink + Clock + Choreographer
4. Convert editor ChoreographyDefs -> runtime ChoreographyDefinitions
   - Choreos with filtered wires -> registered under synthetic type `__f:<choreoId>`
   - Choreos without filters -> registered with original `on` type
5. Create BindingExecutor (peer of choreographer for property bindings)
6. Subscribe to `onSignal()` -- wire-aware dispatch with filter chains
7. Activate run mode UI (workspace--running class)
8. Start spritesheet animations (idle cycles)

**Lifecycle -- stopRunMode():**
0. Stop spritesheet animations (restore original textures)
1. Dispose choreographer
2. Dispose binding executor
3. Unsubscribe signal listener
4. Restore entity snapshot (position, scale, rotation, opacity, visible)
5. Dispose filter chains
6. Clean up state

**Signal dispatch flow in run mode:**
```
Signal arrives
  |
  for each choreography:
  |
  +-- Check if signal.type is in effectiveTypes
  |
  +-- If filtered choreo:
  |     For each input wire matching signal.type:
  |       Run FilterChain.process(signal)
  |       If passes -> dispatch "__f:<choreoId>"
  |
  +-- If unfiltered choreo:
        Dispatch original type (once per type)
  |
  +-- Binding executor evaluates in parallel
  +-- Signal counter incremented
```

**Bindings:**
- Peer of choreographer -- evaluates on every signal dispatch
- Direct property assignments: `animation.state`, `visible`, `opacity`, `rotation`, `scale`, `position.x`, `position.y`, `teleportTo`
- Mapping functions: `lerp`, `clamp`, `step`, `smoothstep`
- Uses `when` clause matching for conditional execution

**Editor -> Runtime conversion:**
- Strips editor-only fields (id, nodeX, nodeY, collapsed)
- Flattens `params` bag into step object
- Resolves `defaultTargetEntityId` -> step `entity` field
- Structural actions (parallel, onArrive, onInterrupt) convert recursively

**Key files:**
- `tools/scene-builder/src/run-mode/run-mode-controller.ts` -- lifecycle manager
- `tools/scene-builder/src/run-mode/run-mode-bindings.ts` -- binding executor
- `tools/scene-builder/src/run-mode/run-mode-state.ts` -- snapshot/state
- `tools/scene-builder/src/run-mode/run-mode-sink.ts` -- CommandSink adapter
- `tools/scene-builder/src/run-mode/run-mode-animator.ts` -- spritesheet animations
