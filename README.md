# sajou

**A visual choreographer for AI agents.**

sajou translates AI agent events (tasks, tool calls, costs, errors) into animated visual scenes through a declarative, themeable choreography system.

> *The signals are the music. The themes are the dancers. sajou is the choreographer.*

## What is this?

Every AI agent today shares the same interface: a chat. sajou offers something different — a visual runtime that maps agent data streams onto rich, animated, artistic interfaces.

Think of it like MadMapper for AI agents: signals come in (MIDI/OSC/ArtNet style), choreographies define the visual sequences, and themes render them on screen.

- **Signals**: standardized JSON events from any agent backend (OpenClaw, LangChain, custom) — plus MIDI controllers and local AI services
- **Choreographer**: declarative JSON sequences that describe what happens visually when a signal arrives — authored with interlocking blocks
- **Stage**: Three.js renderer with lighting, particles, and a full GLSL shader editor with auto-detect

Same data, different scene, completely different experience.

Read the full vision in [SAJOU-MANIFESTO.md](./SAJOU-MANIFESTO.md)

## What's new in v0.4.0

### p5.js Editor — creative coding in the pipeline

Built-in p5.js sketch editor with live preview, running in instance mode. Write sketches with `p.setup`/`p.draw`, control parameters via `// @param:` annotations, and wire them to the choreographer — just like shaders.

- **Params bridge**: `p.sajou.speed`, `p.sajou.color` — live parameter control without re-run
- **Annotations**: `// @param: speed, slider, min: 0.1, max: 5.0` generates interactive controls
- **Wiring**: p5 params appear as badges on the connector bar, wireable to choreographer outputs
- **MCP**: 4 new tools (`create_p5_sketch`, `update_p5_sketch`, `delete_p5_sketch`, `set_p5_param`)
- **3 presets**: Particles, Wave, Grid

Shader and p5.js share a pipeline slot — press `4` for Shader, `5` for p5.js.

### Auto-wire & selective import

- **Auto-wire**: connected signal sources are automatically wired to choreography signal types on import or connect
- **Selective import**: ZIP import dialog lets you pick which sections to restore (visual layout, entities, choreographies, shaders, p5 sketches)

### Header redesign

Grouped layout with undo/redo buttons, help toggle, and cleaner visual hierarchy.

### Previous: v0.3.0

MCP server (20 tools), multi-instance Actor IDs, state sync, REST API, MIDI binding fix. See [CHANGELOG.md](./CHANGELOG.md) for full history.

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
│   ├── theme-api/         # Theme contract interfaces (early prototype)
│   ├── theme-citadel/     # WC3/Tiny Swords theme (early prototype)
│   ├── theme-office/      # Corporate/office theme (early prototype)
│   └── emitter/           # Test signal emitter (WebSocket)
├── adapters/
│   ├── mcp-server/        # MCP server — 20 tools for AI agent integration
│   └── tap/               # Signal tap — hooks into Claude Code, bridges to scene-builder
├── tools/
│   ├── scene-builder/     # Visual scene editor — main authoring tool (Three.js)
│   ├── player/            # Scene player for exported scenes
│   └── entity-editor/     # Entity editor (frozen — superseded by scene-builder)
├── docs/
│   ├── backlog/           # Raw ideas — one markdown file per idea
│   ├── active/            # Ideas currently in development
│   ├── done/              # Completed and merged ideas
│   ├── specs/             # Technical reference documents
│   ├── decisions/         # Session-level technical choices
│   ├── adr/               # Architecture Decision Records
│   └── brand/             # Brand guide and assets
└── SAJOU-MANIFESTO.md     # Project vision and design principles
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed package descriptions and current state.

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Core**: Vanilla TS, zero framework dependency — the choreographer is framework-agnostic
- **Stage**: Three.js (WebGLRenderer + Canvas2D overlay)
- **Signal sources**: WebSocket, SSE, OpenAI-compatible, Anthropic API, OpenClaw gateway, MIDI
- **MCP**: Model Context Protocol server (stdio transport) for AI agent integration
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
- **p5.js editor**: CodeMirror 6 with JavaScript, instance mode runtime, `@param:` annotations, live param bridge
- **Uniform/param annotations**: `@ui` / `@param:` (slider, color, toggle, xy), `@bind` (choreographer wiring), `@object` (grouped controls)
- **GLSL auto-detect**: static analysis finds extractable literals (vec constructors, smoothstep, mix, pow, time multipliers, SDF radii...) with confidence scoring and Expose/Unexpose toggle
- **Choreo→shader/p5 wiring**: bind choreography actions to shader uniforms and p5 params
- **Lighting**: ambient, directional, point lights with flicker modulation
- **Particles**: CPU-simulated emitters with color-over-life, radial/directional modes, glow
- **State persistence**: IndexedDB + localStorage, auto-save, scene ZIP import/export with selective import
- **Auto-wire**: connected signal sources automatically wired to active choreography signal types
- **Shared Actor IDs**: multiple entities can share an Actor ID for group choreography (×N badge in inspector)

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
