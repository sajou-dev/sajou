# MCP Server

sajou includes an [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) server that lets AI agents interact with the visual choreographer programmatically. Any MCP-compatible client — Claude Code, Claude Desktop, or custom agents — can read scene state, compose choreographies, place entities, write GLSL shaders, and control uniforms in real-time.

## Architecture

The MCP server is the **source of truth** for scene state. It runs as a standalone Node.js process with an in-memory state store. The scene-builder (browser) is a view/edit client that syncs with the server.

```
                 ┌─────────────────────────────┐
                 │   sajou MCP server           │
                 │   (@sajou/mcp-server)        │
                 │                              │
                 │   In-memory state store      │
                 │   REST API  (/api/*)         │
                 │   SSE streams                │
                 │   MCP stdio / HTTP (/mcp)    │
                 └──────┬──────────┬────────────┘
                        │          │
              ┌─────────┘          └──────────┐
              ▼                               ▼
     Browser (scene-builder)           AI Agent (Claude)
     connects via HTTP + SSE           connects via MCP
     view + edit scenes                compose scenes
```

The server works **standalone** — agents can compose scenes without any browser open. When a browser connects, it syncs bidirectionally: manual edits in the browser are pushed to the server, and agent commands from the server appear live in the browser.

## Installation

The server is published on npm. No need to clone the repo.

```bash
npx -y @sajou/mcp-server --http
```

This starts the server on port 3001 (default). Specify a custom port:

```bash
npx -y @sajou/mcp-server --http 3000
```

### Running with a client

The scene-builder (browser client) connects to the server via HTTP. In development:

**Terminal 1 — server:**
```bash
npx -y @sajou/mcp-server --http 3000
```

**Terminal 2 — client:**
```bash
# From the sajou repo
cd tools/scene-builder && pnpm dev:vite
```

The Vite dev server proxies `/api/*` to `http://localhost:3000` (configurable via `SAJOU_SERVER` env var). Open `http://localhost:5175` in your browser.

The scene-builder can also run without a server (offline/Tauri mode) — it falls back to local IndexedDB storage.

### Startup flow

1. Browser restores local state from IndexedDB
2. Probes server via `GET /api/state/full` (2s timeout)
3. If server has state → overwrites local stores with server data
4. If server is empty → pushes local state to server
5. SSE connection established for live sync

## MCP client configuration

### Claude Code / Claude Desktop

Add to your MCP config (`~/.claude/claude_desktop_config.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "sajou": {
      "command": "npx",
      "args": ["-y", "@sajou/mcp-server"]
    }
  }
}
```

This starts the server in **stdio mode** (MCP protocol over stdin/stdout). The server also accepts `--http` to run in HTTP mode with REST API and SSE.

### Development (from the repo)

```json
{
  "mcpServers": {
    "sajou": {
      "command": "pnpm",
      "args": ["--filter", "@sajou/mcp-server", "start"]
    }
  }
}
```

## Entry points

| Command | Mode | Use case |
|---------|------|----------|
| `npx -y @sajou/mcp-server` | stdio | Claude Code / Claude Desktop MCP integration |
| `npx -y @sajou/mcp-server --http` | HTTP (port 3001) | Standalone server with REST API + SSE + MCP HTTP |
| `npx -y @sajou/mcp-server --http 8080` | HTTP (custom port) | Same, custom port |

## Tools

The MCP server exposes 20+ tools organized into five categories.

### Read tools — scene inspection

These tools let the agent understand what's currently on stage.

| Tool | Description |
|------|-------------|
| `describe_scene` | Comprehensive human-readable summary of the entire scene — entities, choreographies, signal sources, bindings, wiring. The primary entry point for understanding scene state. |
| `get_scene_state` | Raw scene state — all placed entities with positions, visibility, layers, routes, dimensions, and editor mode. |
| `get_choreographies` | List all choreographies with trigger signal types, conditions, step types, and wiring info. |
| `get_shaders` | All GLSL shaders with full source code, uniforms, object groups, and pass count. |
| `get_sketches` | All sketches (p5.js / Three.js) with source code and parameters. |
| `map_signals` | View current signal-to-choreography wiring (read-only). |

### Write tools — scene composition

These tools let the agent build and modify scenes.

| Tool | Description |
|------|-------------|
| `place_entity` | Place an entity on the scene at a given position. Supports scale, rotation, layer, z-index, animation state, and semantic ID (Actor ID) for choreography targeting. |
| `create_choreography` | Create a choreography — a sequence of animation steps triggered by a signal. Supports all actions: `move`, `fly`, `flash`, `spawn`, `destroy`, `wait`, `playSound`, `setAnimation`, `parallel`, `onArrive`, `onInterrupt`. |
| `create_binding` | Bind a choreography to an entity property (position, rotation, opacity, animation state) with optional mapping and transitions. |
| `create_wire` | Wire connections in the patch bay across three layers: signal→signal-type, signal-type→choreographer, choreographer→theme/shader. |
| `remove_item` | Remove entities, choreographies, bindings, wires, or signal sources. Cleans up dependent connections. |

### Shader tools — GPU effects

These tools let the agent create and control GLSL shaders.

| Tool | Description |
|------|-------------|
| `create_shader` | Create a fragment/vertex shader with uniforms. Supports `@ui` controls (slider, color, toggle, xy), virtual object grouping (`@object`), and multi-pass feedback. |
| `update_shader` | Update an existing shader's code, uniforms, name, or pass count. Partial updates — only provided fields change. |
| `set_uniform` | Set a uniform value in real-time. Supports float, int, bool, vec2, vec3, vec4. |
| `get_shaders` | Read all shader definitions (also listed under read tools). |

### Sketch tools — p5.js + Three.js

These tools let the agent create and control live-coded sketches.

| Tool | Description |
|------|-------------|
| `create_sketch` | Create a sketch (p5.js or Three.js mode) with source code and param annotations. |
| `update_sketch` | Update a sketch's source, name, mode, or params. |
| `set_sketch_param` | Set a sketch param value in real-time (e.g. `speed: 2.5`). |

### Runtime tools — signals

| Tool | Description |
|------|-------------|
| `emit_signal` | Emit a signal to the scene. Triggers any choreographies wired to that signal type. |

## State sync

The server maintains bidirectional state sync between the browser and external tools:

- **Client push**: the browser pushes scene state to the server on every change (debounced 300ms)
- **Server push**: external tools (MCP agents, REST API) mutate state on the server; changes are broadcast to the browser via SSE (`/__commands__/stream`)
- **SSE fallback**: if the SSE stream disconnects, the browser falls back to polling every 500ms

### Command delivery flow

```
MCP tool call ──┐
REST API POST ──┤──> Server mutates state
                │         │
                │         ▼
                │    /__commands__/stream (SSE)
                │         │
                │         ▼
                │    Browser applies command
                │         │
                │         ▼
                │    POST /api/commands/ack
                └──> Server prunes queue
```

### REST API endpoints

#### Read (query state)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scene/state` | GET | Full scene state (entities, positions, layers, routes, lighting, particles) |
| `/api/choreographies` | GET | All choreographies with wiring metadata |
| `/api/bindings` | GET | All entity property bindings |
| `/api/wiring` | GET | Full wiring graph (signal → signal-type → choreographer → shader) |
| `/api/signals/sources` | GET | Connected signal sources (local + remote) |
| `/api/shaders` | GET | All shaders with source code and uniforms |
| `/api/p5` | GET | All sketches with source and params |
| `/api/discover/local` | GET | Probe local services (Claude Code, OpenClaw, LM Studio, Ollama) |

#### Write (mutate scene)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scene/entities` | POST | Add, remove, or update entities |
| `/api/choreographies` | POST | Add, remove, or update choreographies |
| `/api/bindings` | POST | Add or remove bindings |
| `/api/wiring` | POST | Add or remove wire connections |
| `/api/signals/sources` | POST | Add or remove signal sources |
| `/api/shaders` | POST | Create a shader |
| `/api/shaders/:id` | PUT | Update an existing shader |
| `/api/shaders/:id` | DELETE | Remove a shader |
| `/api/shaders/:id/uniforms` | POST | Set a uniform value in real-time |
| `/api/p5` | POST | Create a sketch |
| `/api/p5/:id` | PUT | Update an existing sketch |
| `/api/p5/:id` | DELETE | Remove a sketch |
| `/api/p5/:id/params` | POST | Set a sketch param value in real-time |
| `/api/signal` | POST | Emit a signal (triggers wired choreographies) |

## Example workflow

Here's a complete example of an AI agent building a scene from scratch.

### Step 1: Understand the scene

```
Tool: describe_scene
→ "Empty scene. No entities, no choreographies, no wiring."
```

### Step 2: Place entities

```
Tool: place_entity
  entityId: "peon", x: 200, y: 300, semanticId: "worker"

Tool: place_entity
  entityId: "forge", x: 500, y: 300, semanticId: "forge"
```

### Step 3: Create a choreography

```
Tool: create_choreography
  on: "task_dispatch"
  steps: [
    { "action": "move", "entity": "worker", "target": "forge", "duration": 1200 },
    { "action": "onArrive", "steps": [
      { "action": "flash", "entity": "forge", "params": { "color": "gold" } }
    ]}
  ]
```

### Step 4: Wire and trigger

```
Tool: create_wire
  fromZone: "signal-type", fromId: "task_dispatch"
  toZone: "choreographer", toId: "<choreography-id>"

Tool: emit_signal
  type: "task_dispatch"
  payload: { "task": "gather_resources" }
```

The worker moves to the forge and a flash fires on arrival — composed entirely by the AI agent.
