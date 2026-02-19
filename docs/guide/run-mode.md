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
0. Clear speech bubbles + stop spritesheet animations (restore original textures)
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
- **Speech**: `speech` property routes text to Canvas2D speech bubbles above entities. Streaming signals (`text_delta`, `thinking`) use `appendSpeechText()` (typewriter effect); non-streaming use `setSpeechText()` (full replace). Per-entity visual config via `SpeechBubbleConfig` on `PlacedEntity` (colors, font size, opacity, tail position, retention delay)
- Mapping functions: `lerp`, `clamp`, `step`, `smoothstep`
- Uses `when` clause matching for conditional execution

**Editor -> Runtime conversion:**
- Strips editor-only fields (id, nodeX, nodeY, collapsed)
- Flattens `params` bag into step object
- Resolves `defaultTargetEntityId` -> step `entity` field
- Structural actions (parallel, onArrive, onInterrupt) convert recursively

**Binding transitions:**

Float properties (`scale`, `opacity`, `rotation`, `position.x`, `position.y`) support animated transitions instead of instant assignment. When a binding has a `transition` field, the property animates smoothly to the target value.

```typescript
transition: {
  targetValue: number;     // final value
  durationMs: number;      // animation duration
  easing: ChoreographyEasing; // linear | easeIn | easeOut | easeInOut | arc
  revert?: boolean;        // return to original value after?
  revertDelayMs?: number;  // wait before reverting
}
```

The animation engine (`run-mode-bindings.ts`) uses `requestAnimationFrame` for smooth interpolation. Interrupts are handled gracefully — a new signal starts the transition from the current interpolated value, not the original.

Easing functions:
- **linear** — constant speed
- **easeIn** — slow start, accelerating
- **easeOut** — fast start, decelerating
- **easeInOut** — slow start and end
- **arc** — overshoot and settle

Non-float properties (`visible`, `animation.state`, `moveTo`, `followRoute`, `teleportTo`) remain instant assignment.

The transition config popup appears in the radial binding menu when binding a float property. It provides range hints: scale (0.1–10), opacity (0–1), rotation (0–360°), position in pixels.

**Full-window preview mode:**

Press <kbd>F</kbd> to toggle full-window preview. This expands the Visual node to fill the entire browser window, automatically activates run mode and the hand tool. Press <kbd>Escape</kbd> or <kbd>F</kbd> again to exit.

Full-window mode is useful for presentations, demos, and focused monitoring of a running scene.

**Key files:**
- `tools/scene-builder/src/run-mode/run-mode-controller.ts` -- lifecycle manager
- `tools/scene-builder/src/run-mode/run-mode-bindings.ts` -- binding executor
- `tools/scene-builder/src/run-mode/run-mode-state.ts` -- snapshot/state
- `tools/scene-builder/src/run-mode/run-mode-sink.ts` -- CommandSink adapter
- `tools/scene-builder/src/run-mode/run-mode-animator.ts` -- spritesheet animations
- `tools/scene-builder/src/run-mode/speech-bubble-state.ts` -- speech bubble state + tick
- `tools/scene-builder/src/canvas/speech-bubble-renderer.ts` -- Canvas2D bubble rendering
