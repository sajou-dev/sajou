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

- Vite + Three.js + Canvas2D overlay + vanilla TypeScript + Tauri v2 desktop shell
- Dual-canvas architecture: WebGLRenderer (3D scene) + Canvas2D (editor overlays, markers, labels)
- Pipeline layout: Signal ─rail─ Choreo ─rail─ Visual ─rail─ [ Shader │ p5.js ]
- Shader and p5.js share a single pipeline slot (`.pl-node-group`) with vertical split; mini nodes show rotated headers
- Wiring system (patch bay), node canvas, step chain with popover editing
- Zone painting for semantic regions on background
- Export/import ZIP (selective import dialog: choose visual layout, entities, choreographies, shaders, p5 sketches independently), run mode with live preview, binding transitions
- Auto-wire: on import or source connection, `signal → signal-type` wires are created automatically for connected sources × active choreography signal types
- Signal sources split into **LOCAL** (auto-discovered) and **REMOTE** (manually added) categories
- Local discovery: client-side browser probes for Claude Code (relative SSE, dev only), OpenClaw (WebSocket 18789), LM Studio (HTTP 1234), Ollama (HTTP 11434)
- OpenClaw token auto-fill from `~/.openclaw/openclaw.json` → `gateway.auth.token` (CORS-restricted endpoint)
- Remote transports: WebSocket, SSE, OpenAI-compatible, Anthropic API, OpenClaw
- OpenClaw integration: challenge/response handshake (protocol v3), channel metadata extraction, delta-first text streaming, exponential backoff reconnect
- HTTP POST ingestion (`POST /api/signal`) + SSE broadcast (`GET /__signals__/stream`)
- Signal log: 10k entries in memory, 500 rendered, "Load older" button for virtual scrolling
- `platformFetch()`: Tauri-aware fetch wrapper — uses `tauri-plugin-http` (Rust-side) in desktop, Vite CORS proxy in dev, native fetch in browser prod
- Vite dev plugins: `corsProxyPlugin`, `signalIngestionPlugin`, `tapHookPlugin`, `openclawTokenPlugin`, `localDiscoveryPlugin`
- Dependencies: `@sajou/core`, `three`, `fflate`, `gifuct-js`, `@tauri-apps/api`, `@tauri-apps/plugin-http`

#### Tauri desktop app

Native desktop shell via Tauri v2 (WKWebView on macOS, WebView2 on Windows):
- **Dev mode** (`pnpm tauri:dev`): Vite dev server + native webview — full Claude Code integration, HMR, MCP server
- **Production** (`pnpm tauri:build`): self-contained `.app`/`.dmg` (~3.4 MB) — LM Studio, Ollama, OpenClaw work via `tauri-plugin-http`; no Claude Code (requires Vite dev server)
- `tauri-plugin-http` bypasses webview mixed-content restrictions for HTTP requests to localhost
- HTTP scope: `http://*:*` and `https://*:*` (any host, any port)
- `window.confirm()` replaced by HTML dialog (WKWebView doesn't support native JS dialogs)
- Webview data: `~/Library/WebKit/dev.sajou.scene-builder/` (may need clearing between builds)
- Key files: `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`

#### State persistence

Auto-saves all scene-builder state to IndexedDB and restores on startup:
- **IndexedDB** (`sajou-scene-builder`, 8 stores): scene state, entity definitions, choreographies, wires, bindings, signal timeline, assets (as `ArrayBuffer`), p5 sketches
- **localStorage**: remote signal sources (`sajou:remote-sources`), editor preferences (`sajou:editor-prefs`)
- `persistence-db.ts`: minimal IndexedDB wrapper (singleton connection, CRUD helpers)
- `persistence.ts`: orchestrator — debounced auto-save (500ms IDB, 300ms localStorage), `restoreState()` blocking on startup, `forcePersistAll()` after ZIP import, `newScene()` to clear all stores
- `auto-wire.ts`: auto-creates `signal → signal-type` wires for connected sources on import and connection transitions
- `beforeunload` handler flushes pending debounced saves
- **Not persisted**: undo stack, local sources (re-discovered), connection status, active selections
- Local sources have fixed identity colors (`LOCAL_SOURCE_COLORS`) to prevent visual drift across sessions
- "New" button (Ctrl+N) in header: HTML confirm dialog → `dbClearAll()` → reset all stores → re-discover local sources

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

#### Binding system

Dynamic bindings connect choreographer triggers to entity properties:

- **Binding types**: instant assignment (MIDI, continuous) or temporal transition (AI events, triggers)
- **Temporal transitions** (`BindingTransition`): target value, duration, easing, optional revert with delay
- **Animation engine**: rAF-driven interpolation in `run-mode-bindings.ts`, supports smooth interrupt (re-trigger from current value), revert (animate back to snapshot original), concurrent multi-property animations
- **Easing**: linear, easeIn, easeOut, easeInOut, arc — local implementation (no `@sajou/core` dependency)
- **Config popup**: radial menu shows a transition config popup for float properties (scale, opacity, rotation, position.x, position.y) with range hints; non-float properties (visible, animation.state, moveTo) use immediate binding
- **Store**: `binding-store.ts` — `addBinding()`, `updateBindingTransition()`, `updateBindingMapping()`, `updateBindingAction()`
- **Persistence**: `BindingState` serialized to IndexedDB; optional `transition` field is backward-compatible

#### Shader system

Built-in GLSL shader editor with live preview, compiled on a dedicated Three.js canvas (`RawShaderMaterial` on a fullscreen quad, GLSL ES 3.0):
- **Auto-injected uniforms**: `iTime`, `iTimeDelta`, `iResolution`, `iMouse`, `iFrame` (+ `iChannel0` for multi-pass)
- **Uniform annotations**: `// @ui: slider`, `// @ui: color`, `// @ui: toggle`, `// @ui: xy` — parsed from GLSL source
- **Object grouping**: `// @object: name, label: Display Name` — groups uniforms in collapsible panels
- **Semantic binding**: `// @bind: intensity` — marks uniforms for choreographer wiring
- **Shader analyzer**: static analysis detects extractable numeric literals (vec constructors, function args, time patterns)
- **Shadertoy import**: auto-detects `mainImage()` signature and wraps it
- **Multi-pass**: `passes: 2+` enables ping-pong feedback via `iChannel0`
- **Wiring target format**: `{shaderId}:{uniformName}` in wire connections
- **External control**: MCP `set-uniform` commands update both the state store and the Three.js material uniforms in real-time; DOM slider controls sync to reflect external changes

Key files: `shader-canvas.ts` (compilation + rendering), `shader-uniforms-panel.ts` (UI controls + external value sync), `shader-code-panel.ts` (editor + compile trigger), `shader-uniform-parser.ts` (annotation parser), `shader-defaults.ts` (auto-injected block)

#### p5.js editor

Built-in p5.js sketch editor with live preview, running in instance mode (`new p5(sketch, container)`):
- **Instance mode**: no global pollution — sketch function receives `p` instance, user code writes `p.setup`, `p.draw`
- **Params bridge**: `p.sajou.speed`, `p.sajou.color` etc. — injected object on the p5 instance for live parameter control
- **Auto-injected params**: `p.sajou._width`, `p.sajou._height`, `p.sajou._time` (ms since start), `p.sajou._mouse` ({x, y})
- **Param annotations**: `// @param: name, control [, key: value, ...]` in JS comments — parsed to generate editor controls
- **Control types**: `slider`, `color`, `toggle`, `xy` — same set as shader uniforms
- **Semantic binding**: `// @bind: intensity` — marks params for choreographer wiring (inline or next line)
- **Presets**: 3 built-in sketches (Particles, Wave, Grid) with predefined params
- **Code editor**: CodeMirror 6 with JavaScript syntax, sketch selector, debounced re-run (500ms), Ctrl+Enter for immediate run
- **Error handling**: `try/catch` around `new Function()` execution, errors displayed in status bar
- **Wiring target format**: `p5:{sketchId}:{paramName}` in wire connections
- **External control**: MCP `set-param` commands update both the state store and the live `p.sajou` object

Key files: `p5-canvas.ts` (runtime instance management), `p5-params-panel.ts` (UI controls), `p5-code-panel.ts` (editor), `p5-param-parser.ts` (annotation parser), `p5-presets.ts` (default sketches), `p5-state.ts` (store), `p5-view.ts` (pipeline node integration)

#### MCP command pipeline

External tools (MCP server, `curl`, any HTTP client) control the scene-builder through a command queue system:
- **Write path**: `POST /api/scene/entities`, `/api/choreographies`, `/api/wiring`, `/api/shaders`, `/api/shaders/:id/uniforms`, `/api/p5`, `/api/p5/:id/params` → server enqueues `SceneCommand` → broadcasts via SSE (`/__commands__/stream`) → client `command-consumer.ts` executes against stores → ACK via `POST /api/commands/ack`
- **Read path**: `GET /api/scene/state`, `/api/choreographies`, `/api/wiring`, `/api/shaders`, `/api/p5`, `/api/bindings` — reads from latest state pushed by browser
- **State push**: browser pushes full state snapshot via `POST /api/state/push` (debounced 300ms)
- **SSE fallback**: if SSE disconnects, client polls `GET /api/commands/pending` every 500ms
- **Signal ingestion**: `POST /api/signal` accepts JSON, normalizes it, broadcasts to all SSE clients on `/__signals__/stream`

Key files: `command-consumer.ts` (client-side executor), `vite.config.ts` (server-side endpoints + command queue)

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

#### Pipeline layout

```
Signal ─rail─ Choreo ─rail─ Visual ─rail─ [ Shader │ p5.js ]
  1              2             3             4         5
```

- 3 rails with chevron arrows and badge stacks (source badges, signal-type badges)
- Shader + p5.js grouped in a single slot (`.pl-node-group`, vertical split)
- Mini nodes: 48px wide, rotated header (-90°, animated transition)
- Extended: fills available space, other nodes collapse
- Inside the code group: extended node takes all space, sibling collapses to 28px horizontal bar
- Keyboard: 1–5 toggle nodes, double-click header to solo-focus

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
