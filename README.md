# 🐒 Sajou

**A visual choreographer for AI agents.**

Sajou translates AI agent events (tasks, tool calls, costs, errors) into animated visual scenes through a declarative, themeable choreography system.

> *The signals are the music. The themes are the dancers. Sajou is the choreographer.*

## What is this?

Every AI agent today shares the same interface: a chat. Sajou offers something different — a visual runtime that maps agent data streams onto rich, animated, artistic interfaces.

Think of it like MadMapper for AI agents: signals come in (MIDI/OSC/ArtNet style), choreographies define the visual sequences, and themes render them on screen.

- **Signals**: standardized JSON events from any agent backend (OpenClaw, LangChain, custom)
- **Choreographer**: declarative JSON sequences that describe what happens visually when a signal arrives
- **Themes**: complete visual scenes (sprites, 3D models, particles, sounds) that render the choreographies

Same data, different theme, completely different experience.

📖 Read the full vision in [SAJOU-MANIFESTO.md](./SAJOU-MANIFESTO.md)

## Architecture

```
Signals (data)  →  Choreographer (sequences)  →  Theme (render)
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
│   ├── theme-api/         # Theme contract and renderer interfaces
│   ├── theme-citadel/     # WC3/Tiny Swords theme (PixiJS v8)
│   ├── theme-office/      # Corporate/office theme (PixiJS v8)
│   └── emitter/           # Test signal emitter (WebSocket)
├── tools/
│   ├── scene-builder/     # Visual scene editor — main authoring tool
│   ├── player/            # Scene player for exported scenes
│   └── entity-editor/     # Entity editor (frozen — superseded by scene-builder)
├── docs/
│   ├── adr/               # Architecture Decision Records
│   ├── archive/           # Archived specs (implemented, kept for reference)
│   └── brand/             # Brand guide and assets
└── SAJOU-MANIFESTO.md     # Project vision and design principles
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed package descriptions and current state.

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Core**: Vanilla TS, zero framework dependency — the choreographer is framework-agnostic
- **Themes**: Each theme chooses its own render stack (PixiJS v8 for current themes)
- **Communication**: JSON over WebSocket
- **Monorepo**: pnpm workspaces
- **Build**: Vite
- **Test**: Vitest

## Status

🚧 **V1 in progress** — Core runtime, signal protocol, and 2 themes (Citadel, Office) implemented. The scene-builder is the main authoring tool for creating and testing choreographies visually.

This is a personal learning project. If it turns out well, it will become public.

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

*Le petit singe qui observe tout depuis les branches.* 🐒
