# sajou

**A visual choreographer for AI agents.**

sajou translates AI agent events (tasks, tool calls, costs, errors) into animated visual scenes through a declarative choreography system.

> *The signals are the music. The stage is the theater. sajou is the choreographer.*

## What is this?

Every AI agent today shares the same interface: a chat. sajou offers something different — a visual runtime that maps agent data streams onto rich, animated, artistic interfaces.

Think of it like MadMapper for AI agents: signals come in (MIDI/OSC/ArtNet style), choreographies define the visual sequences, and the stage renders them on screen.

- **Signals**: standardized JSON events from any agent backend (OpenClaw, LangChain, custom) — plus MIDI controllers and local AI services
- **Choreographer**: declarative JSON sequences that describe what happens visually when a signal arrives — authored with interlocking blocks
- **Stage**: Three.js renderer with lighting, particles, and a full GLSL shader editor with auto-detect

Same data, different scene, completely different experience.

Read the full vision in [SAJOU-MANIFESTO.md](./SAJOU-MANIFESTO.md)

## Current state (v0.6)

### MCP server — published on npm

The sajou state server (`@sajou/mcp-server`) is [published on npm](https://www.npmjs.com/package/@sajou/mcp-server) and works standalone. It provides 16 MCP tools, a REST API, and SSE streams. AI agents can compose scenes without any browser open.

```bash
npx -y @sajou/mcp-server --http       # standalone server (port 3001)
npx -y @sajou/mcp-server              # stdio mode for Claude Code
```

### Tauri desktop app

Native desktop shell via Tauri v2 — bypasses browser mixed-content restrictions for localhost connections. ~3.4 MB production build.

### Sketch editor — dual-mode p5.js + Three.js

Built-in sketch editor with live preview, supporting both p5.js instance mode and Three.js `setup(ctx)/draw(ctx, state)` API. 6 presets, `// @param:` annotations, wirable to the choreographer.

### Speech bubbles

Canvas2D overlay rendering speech bubbles above entities in run mode — streaming typewriter effect for `text_delta`/`thinking`, per-entity config (colors, tail position, retention).

### Binding transitions

Temporal animation engine for choreographer bindings — easing, smooth interrupt, revert to snapshot. Float properties (scale, opacity, rotation, position) animate; non-float properties stay immediate.

### Also

- **Auto-wire**: connected signal sources automatically wired to active choreography signal types
- **Selective import**: ZIP import dialog lets you pick sections independently
- **OpenClaw integration**: challenge/response handshake (protocol v3), delta-first streaming
- **Lighting**: ambient, directional, point lights with flicker modulation
- **Particles**: CPU-simulated emitters with color-over-life, glow
- **Full-window preview**: press `F` for immersive run mode

See [CHANGELOG.md](./CHANGELOG.md) for the full release history.

## Architecture

```
Signals (data)  →  Choreographer (sequences)  →  Stage (render)
```

The choreographer is the core product. Everything is declarative JSON — designed to be composed by humans or by AIs.

```json
{
  "on": "task_dispatch",
  "steps": [
    { "action": "move", "entity": "agent", "to": "signal.to", "duration": 800 },
    { "action": "spawn", "entity": "pigeon", "at": "signal.from" },
    { "action": "fly", "entity": "pigeon", "to": "signal.to", "duration": 1200, "easing": "arc" },
    { "action": "onArrive", "steps": [
      { "action": "destroy", "entity": "pigeon" },
      { "action": "flash", "target": "signal.to", "color": "gold" }
    ]}
  ]
}
```

## Project Structure

```
sajou/
├── packages/
│   ├── core/              # Signal bus + Choreographer runtime (vanilla TS, zero deps)
│   ├── schema/            # JSON Schemas + TypeScript types for signal protocol
│   ├── stage/             # Three.js renderer library (EntityManager, LightManager, cameras)
│   ├── mcp-server/        # MCP server — 16 tools for AI agent integration (npm: @sajou/mcp-server)
│   ├── emitter/           # Test signal emitter (WebSocket)
│   └── (theme-api, theme-citadel, theme-office removed — were PixiJS prototypes)
├── adapters/
│   └── tap/               # Signal tap — CLI + adapters to connect Claude Code → scene-builder
├── tools/
│   ├── scene-builder/     # Visual scene editor — main authoring tool (Vite + Three.js + Tauri)
│   ├── site/              # Web deployment (docs, sajou.app static build)
│   └── entity-editor/     # Entity editor (frozen — superseded by scene-builder)
├── docs/
│   ├── guide/             # User-facing guides (signal flow, shaders, wiring, etc.)
│   ├── reference/         # Reference docs (scene format, signal protocol, shortcuts)
│   ├── backlog/           # Raw ideas — one markdown file per idea
│   ├── active/            # Ideas currently in development
│   ├── done/              # Completed and merged ideas
│   ├── specs/             # Technical reference documents
│   ├── decisions/         # Session-level technical choices
│   ├── adr/               # Architecture Decision Records
│   └── brand/             # Brand guide and assets
├── scripts/               # Release and deploy scripts
└── SAJOU-MANIFESTO.md     # Project vision and design principles
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed package descriptions and current state.

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Core**: Vanilla TS, zero framework dependency — the choreographer is framework-agnostic
- **Stage**: Three.js (WebGLRenderer + Canvas2D overlay)
- **Signal sources**: WebSocket, SSE, OpenAI-compatible, Anthropic API, OpenClaw gateway, MIDI
- **MCP**: Model Context Protocol server (stdio + Streamable HTTP) — 16 tools, published as `@sajou/mcp-server`
- **Code editors**: CodeMirror 6 (GLSL + JavaScript)
- **Monorepo**: pnpm workspaces
- **Build**: Vite
- **Test**: Vitest

## Signal Sources

The scene-builder connects to multiple signal sources simultaneously:

| Protocol | Auto-detect | Description |
|---|---|---|
| **WebSocket** | `ws://` / `wss://` URL | sajou emitter, generic real-time sources |
| **SSE** | HTTP/S URL (fallback) | Server-Sent Events streaming |
| **OpenAI** | Probes `/v1/models` | LM Studio, Ollama, vLLM, any OpenAI-compatible API |
| **Anthropic** | URL contains "anthropic" | Anthropic Messages API with streaming |
| **OpenClaw** | Port 18789 or "openclaw" in URL | Multi-channel agent gateway (Telegram, WhatsApp, Slack, Discord...) |
| **MIDI** | Web MIDI API | Hardware controllers — knobs, faders, pads mapped to uniforms and parameters |
| **Local** | Automatic | Claude Code hooks via tap adapter (`/__signals__/stream`) |
| **MCP** | stdio | AI agents interact via MCP tools — read state, compose scenes, emit signals |

Local sources (Claude Code, OpenClaw, LM Studio, Ollama) are auto-discovered at startup.

## Scene-builder

The main authoring tool — a visual editor for building sajou scenes.

- **Pipeline layout**: node-based workspace with signal, choreographer, visual, and shader nodes
- **Interlocking blocks**: choreography authoring with sentence-blocks, drag-reorder, and action palette
- **Shader editor**: CodeMirror 6 with GLSL highlighting, live preview canvas, multi-pass ping-pong feedback, 3 built-in presets, JSON export/import
- **Sketch editor**: dual-mode p5.js + Three.js, CodeMirror 6, `@param:` annotations, live param bridge, 6 presets
- **Uniform/param annotations**: `@ui` / `@param:` (slider, color, toggle, xy), `@bind` (choreographer wiring), `@object` (grouped controls)
- **GLSL auto-detect**: static analysis finds extractable literals (vec constructors, smoothstep, mix, pow, time multipliers, SDF radii...) with confidence scoring and Expose/Unexpose toggle
- **Choreo→shader/p5 wiring**: bind choreography actions to shader uniforms and p5 params
- **Lighting**: ambient, directional, point lights with flicker modulation
- **Particles**: CPU-simulated emitters with color-over-life, radial/directional modes, glow
- **State persistence**: IndexedDB + localStorage, auto-save, scene ZIP import/export with selective import
- **Auto-wire**: connected signal sources automatically wired to active choreography signal types
- **Speech bubbles**: Canvas2D overlay with streaming typewriter effect, per-entity config
- **Binding transitions**: temporal animation (easing, interrupt, revert) for choreographer bindings
- **Shared Actor IDs**: multiple entities can share an Actor ID for group choreography (×N badge in inspector)
- **Tauri desktop**: native shell via Tauri v2 — bypasses browser mixed-content restrictions for localhost
- **Full-window preview**: press `F` for immersive run mode

## Status

This is a personal project. If it turns out well, it will become public.

See [CHANGELOG.md](./CHANGELOG.md) for the full release history.

## Development

```bash
# Install dependencies
pnpm install

# Launch the scene-builder (main dev tool)
pnpm --filter scene-builder dev

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## Domains

|| sajou.dev | sajou.org | sajou.app ||

---

*sajou - a visual choreographer for AI agents.*
