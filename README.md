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
- **Code editor**: CodeMirror 6 (GLSL)
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

Local sources (Claude Code, OpenClaw, LM Studio, Ollama) are auto-discovered at startup.

## Scene-builder

The main authoring tool — a visual editor for building sajou scenes.

- **Pipeline layout**: node-based workspace with signal, choreographer, visual, and shader nodes
- **Interlocking blocks**: choreography authoring with sentence-blocks, drag-reorder, and action palette
- **Shader editor**: CodeMirror 6 with GLSL highlighting, live preview canvas, multi-pass ping-pong feedback, 3 built-in presets, JSON export/import
- **Uniform annotations**: `@ui` (slider, color, toggle, xy), `@bind` (choreographer wiring), `@object` (grouped controls)
- **GLSL auto-detect**: static analysis finds extractable literals (vec constructors, smoothstep, mix, pow, time multipliers, SDF radii...) with confidence scoring and Expose/Unexpose toggle
- **Choreo→shader wiring**: bind choreography actions to shader uniforms
- **Lighting**: ambient, directional, point lights with flicker modulation
- **Particles**: CPU-simulated emitters with color-over-life, radial/directional modes, glow
- **State persistence**: IndexedDB + localStorage, auto-save, scene ZIP import/export

## Status

**v0.2.0** — Core runtime, signal protocol, Three.js stage, shader editor with GLSL auto-detect, pipeline layout, interlocking blocks choreographer, MIDI input, tap adapter for Claude Code, OpenClaw gateway, multi-source signal connections.

This is a personal project. If it turns out well, it will become public.

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

- sajou.org
- sajou.app
- sajou.dev

---

*Le petit singe qui observe tout depuis les branches.*
