# Architecture — current state of the code

## Overview

```
Signals (data) → Choreographer (sequences) → Theme (render)
```

See [SAJOU-MANIFESTO.md](./SAJOU-MANIFESTO.md) for the full vision.

## Runtime packages

### @sajou/schema

TypeScript types + JSON Schema for the signal protocol.

- 7 V1 signal types: `task_dispatch`, `tool_call`, `tool_result`, `token_usage`, `agent_state_change`, `error`, `completion`
- `SignalEvent`: discriminated union on `type` field for type narrowing
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

- Vite + PixiJS v8 + vanilla TypeScript
- 3-zone workflow: Signal → Choreographer → Theme
- Wiring system (patch bay), node canvas, step chain with popover editing
- Zone painting for semantic regions on background
- Export/import ZIP, run mode with live preview
- Dependencies: `@sajou/core`, `pixi.js`, `fflate`, `gifuct-js`

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
