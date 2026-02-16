# Architecture — current state of the code

## Overview

```
Signals (data) → Choreographer (sequences) → Theme (render)
```

See [SAJOU-MANIFESTO.md](./SAJOU-MANIFESTO.md) for the full vision.

## Runtime packages

### @sajou/schema

TypeScript types + JSON Schema for the signal protocol.

- **Open protocol**: any string is a valid signal type — no enum gate
- 9 well-known types: `task_dispatch`, `tool_call`, `tool_result`, `token_usage`, `agent_state_change`, `error`, `completion`, `text_delta`, `thinking`
- `WellKnownSignalType` (typed union) vs `SignalType` (any string with autocomplete)
- `SignalEnvelope<T>`: well-known types get typed payloads; custom types get `Record<string, unknown>`
- `SignalEvent`: discriminated union on `type` field for type narrowing (well-known types only)
- Envelope + typed payload pattern (see [ADR-001](./docs/adr/001-signal-protocol.md))
- All payload fields are `readonly` (immutable signals)

### @sajou/core

Choreographer runtime — zero external dependencies, runs in browser and Node.js.

- Concurrent performances with tween-based timing ([ADR-002](./docs/adr/002-choreographer-runtime.md))
- Typed `CommandSink` for theme communication
- `TestClock` for deterministic unit tests
- `toPerformanceSignal()` bridge: `SignalEnvelope` (schema) → `PerformanceSignal` (core)

### @sajou/theme-api

Theme contract interfaces.

- `ThemeContract`, `ThemeManifest`, `EntityDefinition`, `ThemeRenderer`

### @sajou/theme-citadel

WC3/Tiny Swords theme — PixiJS v8.

- 6 entities, 4 choreographies, grid-based layout
- Spritesheets: 192x192 cells, `frameRow` selects animation row
- Assets from `tiny-swords/` (original) and `tiny-swords-update-010/` (faction-based)

### @sajou/theme-office

Corporate/office theme — PixiJS v8.

- LimeZu Modern Interiors pixel art
- 4 zones: manager office, server room, open space, entrance/break room
- Entities: workers, server racks, office furniture

### @sajou/emitter

WebSocket signal emitter for testing.

- 3 predefined scenarios, replay loop, speed control

## Tools

### scene-builder (active)

Visual scene editor — the main authoring tool for creating and testing choreographies.

- Vite + Three.js + Canvas2D overlay + vanilla TypeScript
- Dual-canvas architecture: WebGLRenderer (3D scene) + Canvas2D (editor overlays, markers, labels)
- 3-zone workflow: Signal → Choreographer → Theme
- Wiring system (patch bay), node canvas, step chain with popover editing
- Zone painting for semantic regions on background
- Export/import ZIP, run mode with live preview
- Multi-source signal connections: WebSocket, SSE, OpenAI-compatible, Anthropic API, OpenClaw
- OpenClaw integration: challenge/response handshake (protocol v3), channel metadata extraction, delta-first text streaming, exponential backoff reconnect
- HTTP POST ingestion (`POST /api/signal`) + SSE broadcast (`GET /__signals__/stream`)
- Signal log: 10k entries in memory, 500 rendered, "Load older" button for virtual scrolling
- Dependencies: `@sajou/core`, `three`, `fflate`, `gifuct-js`

#### Camera

- `CameraController` with top-down (orthographic) and isometric modes (toggle: `I` shortcut)
- Top-down: scene(x,y) → world(x, 0, z), OrthographicCamera looking down
- Isometric: 45° azimuth, 35.264° elevation, billboard entities face camera
- Billboard: entities stand up by default (`billboard: true`), can be flattened per entity

#### Lighting system

Three.js lights driven by `SceneState.lighting`:
- **Ambient**: `THREE.AmbientLight` — color + intensity
- **Directional**: `THREE.DirectionalLight` — color + intensity + angle/elevation (spherical coords)
- **Point lights**: `THREE.PointLight` array — position, color, intensity, range, height, flicker
- `light-renderer.ts`: module state pattern — init/sync/tick/dispose, state diff (add/update/remove)
- `light-tool.ts`: click to create, select, drag, delete — all mutations via undo commands
- `lighting-panel.ts`: Canvas2D angle/elevation dials, numeric inputs, color pickers, flicker controls
- Flicker: double sine wave modulation (fast + slow frequencies), intensity oscillation around base value
- Editor overlay: sun icon (directional), circle markers (point lights), angle/range indicators

#### Particle system

CPU-simulated particles rendered via `THREE.Points` + `BufferGeometry`:
- **Emitter types**: radial (random velocity in X/Z ranges) or directional (direction vector + 17° spread cone)
- **Per-particle state**: age, lifetime, position (x,z), velocity (vx,vz)
- **Visual**: color-over-life gradient (multi-stop linear interpolation), size fade-out, optional additive blending (glow)
- **Rendering**: `PointsMaterial` with `vertexColors`, `sizeAttenuation: false`, `depthWrite: false`; particles at Y=0.5
- `particle-renderer.ts`: module state pattern — init/sync/tick/dispose, pre-allocated Float32BufferAttributes
- `particle-tool.ts`: click to create (preset: 30 particles, orange→red gradient, glow), select, drag, delete — undo
- `particle-panel.ts`: type radio, count, lifetime, velocity/direction with Canvas2D compass dial, color stops (up to 4), size, glow
- Editor overlay: diamond markers, direction arrows, dashed extent circles
- Preview mode: particles simulated in preview loop with same CPU logic

#### Canvas2D dial widgets

Reusable interactive pattern for angle/direction input:
- Compass rose with cardinal labels (N/E/S/W), drag to set angle, numeric input fallback
- Used in lighting panel (angle, elevation) and particle panel (direction)
- Direction convention: 0°=N, 90°=E, 180°=S, 270°=W

#### Editor tools

| Tool | Shortcut | Description |
|------|----------|-------------|
| Select | V | Select/move entities |
| Entity | E | Place entities |
| Route | R | Draw movement routes |
| Zone | Z | Paint semantic zones |
| Light | L | Place/configure lights |
| Particle | K | Place/configure particle emitters |

### player (active)

Plays exported scene files from the scene-builder.

### entity-editor (frozen)

Entity editor — superseded by scene-builder's integrated entity management.

## Integration tests

`tests/integration/pipeline.test.ts` — end-to-end proof of the signal → choreographer → commands pipeline.

## Architecture Decision Records

| ADR | Topic |
|-----|-------|
| [001-signal-protocol](./docs/adr/001-signal-protocol.md) | Envelope + typed payload, 7 signal types, `correlationId` grouping |
| [002-choreographer-runtime](./docs/adr/002-choreographer-runtime.md) | Concurrent performances, tween-based timing, typed `CommandSink`, `TestClock` |
| [002-entity-format](./docs/adr/002-entity-format.md) | Extensible entity format (sprites → spritesheets → 3D) |
| [003-renderer-stack](./docs/adr/003-renderer-stack.md) | PixiJS v8 as renderer for V1 themes |

## Brand

Full guide: [docs/brand/sajou-brand_dev-kit_001/SAJOU-BRAND.md](./docs/brand/sajou-brand_dev-kit_001/SAJOU-BRAND.md)

Key assets in `docs/brand/sajou-brand_dev-kit_001/`: logomark, logotype, lockup (dark/light variants), favicon, 3 layer icons (`icon-signal.svg`, `icon-choreographer.svg`, `icon-theme.svg`).
