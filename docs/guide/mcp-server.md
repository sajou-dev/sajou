# MCP Server

sajou includes an [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) server that lets AI agents interact with the visual choreographer programmatically. Any MCP-compatible client — Claude Code, Claude Desktop, or custom agents — can read scene state, compose choreographies, place entities, write GLSL shaders, and control uniforms in real-time.

The MCP server is a thin adapter: it translates MCP tool calls into HTTP requests against the scene-builder's dev server API. The scene-builder handles all signal routing, choreography execution, and rendering.

```
AI Agent ──MCP/stdio──> sajou-mcp ──HTTP──> scene-builder dev server
                                             │
                                             ├── GET  /api/scene/state
                                             ├── GET  /api/choreographies
                                             ├── GET  /api/bindings
                                             ├── GET  /api/wiring
                                             ├── GET  /api/shaders
                                             ├── GET  /api/p5
                                             ├── POST /api/commands
                                             └── POST /api/signal
```

## Why MCP?

sajou's choreographies are declarative JSON — designed from the start to be composed by AIs, not just humans. The MCP server closes the loop: an AI agent can now **observe** a scene, **compose** new elements, **wire** them together, and **trigger** animations, all through a standardized protocol.

This enables workflows like:
- An agent that builds visualizations of its own reasoning process
- A coding assistant that animates task progress on a live stage
- An orchestrator that composes multi-entity scenes to represent complex agent workflows

## Setup

### 1. Start the scene-builder dev server

```bash
pnpm --filter scene-builder dev
```

The scene-builder runs on `http://localhost:5175` by default.

### 2. Configure your MCP client

#### Claude Code / Claude Desktop

Add to your MCP config (`~/.claude/claude_desktop_config.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "sajou": {
      "command": "npx",
      "args": ["sajou-mcp"],
      "env": {
        "SAJOU_DEV_SERVER": "http://localhost:5175"
      }
    }
  }
}
```

#### Development (from the repo)

```json
{
  "mcpServers": {
    "sajou": {
      "command": "npx",
      "args": ["tsx", "adapters/mcp-server/src/index.ts"],
      "env": {
        "SAJOU_DEV_SERVER": "http://localhost:5175"
      }
    }
  }
}
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SAJOU_DEV_SERVER` | `http://localhost:5175` | URL of the scene-builder dev server |

## Tools

The MCP server exposes 20 tools organized into five categories.

### Read tools — scene inspection

These tools let the agent understand what's currently on stage.

| Tool | Description |
|------|-------------|
| `describe_scene` | Comprehensive human-readable summary of the entire scene — entities, choreographies, signal sources, bindings, wiring. The primary entry point for understanding scene state. |
| `get_scene_state` | Raw scene state — all placed entities with positions, visibility, layers, routes, dimensions, and editor mode. |
| `get_choreographies` | List all choreographies with trigger signal types, conditions, step types, and wiring info. |
| `get_shaders` | All GLSL shaders with full source code, uniforms, object groups, and pass count. |
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
| `set_uniform` | Set a uniform value in real-time. Supports float, int, bool, vec2, vec3, vec4. The primary mechanism for live shader control. |
| `get_shaders` | Read all shader definitions (also listed under read tools). |

### p5.js tools — sketch effects

These tools let the agent create and control p5.js sketches.

| Tool | Description |
|------|-------------|
| `create_p5_sketch` | Create a p5.js sketch with source code and param annotations (`@param:` for controls, `@bind:` for wiring). |
| `update_p5_sketch` | Update a sketch's source, name, or params. |
| `delete_p5_sketch` | Remove a sketch from the scene. |
| `set_p5_param` | Set a sketch param value in real-time (e.g. `speed: 2.5`). Updates the live `p.sajou` bridge without restarting. |

### Runtime tools — signals

| Tool | Description |
|------|-------------|
| `emit_signal` | Emit a signal to the scene. Triggers any choreographies wired to that signal type. Supports all well-known types: `task_dispatch`, `tool_call`, `tool_result`, `agent_state_change`, `error`, `completion`, etc. |

## State sync

The scene-builder dev server maintains bidirectional state sync between the browser and external tools:

- **Client push (state-sync)**: the browser pushes scene state to the dev server on every change (debounced 300ms). The server holds the latest state in memory, making it available to the MCP server via REST endpoints.
- **Command consumer**: external tools (including the MCP server) push commands to the dev server via typed `POST` endpoints. Commands are queued and broadcast to the browser via SSE (`/__commands__/stream`). The browser executes each command against its stores, then ACKs so the server prunes the queue.
- **SSE fallback**: if the SSE stream disconnects, the browser falls back to polling `GET /api/commands/pending` every 500ms and auto-reverts to SSE when it reconnects.

This means an AI agent's changes appear immediately in the browser, and any manual changes in the browser are immediately visible to the agent.

### Command delivery flow

```
POST /api/scene/entities ─┐
POST /api/shaders         ├──> Server queues SceneCommand
POST /api/wiring          ┘        │
                                   ▼
                          /__commands__/stream (SSE)
                                   │
                                   ▼
                          Browser command-consumer.ts
                           executes against stores
                                   │
                                   ▼
                          POST /api/commands/ack
                           (server prunes queue)
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
| `/api/p5` | GET | All p5.js sketches with source and params |
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
| `/api/p5` | POST | Create a p5.js sketch |
| `/api/p5/:id` | PUT | Update an existing sketch |
| `/api/p5/:id` | DELETE | Remove a sketch |
| `/api/p5/:id/params` | POST | Set a sketch param value in real-time |
| `/api/signal` | POST | Emit a signal (triggers wired choreographies) |

### Timing notes

- State sync debounce: ~300ms. After a write command, wait ~500ms before querying state to ensure the browser has pushed its updated snapshot.
- Shader uniform changes (`set-uniform`) are reflected immediately on the Three.js material and update the DOM slider controls in the uniforms panel.

## Example workflow

Here's a complete example of an AI agent building a scene from scratch.

### Step 1: Understand the scene

The agent starts by describing the current scene:

```
Tool: describe_scene
→ "Empty scene. No entities, no choreographies, no wiring."
```

### Step 2: Place entities

The agent places entities from the theme's catalog:

```
Tool: place_entity
  entityId: "peon"
  x: 200, y: 300
  semanticId: "worker"

Tool: place_entity
  entityId: "forge"
  x: 500, y: 300
  semanticId: "forge"
```

### Step 3: Create a choreography

The agent creates a choreography that moves the worker to the forge when a task is dispatched:

```
Tool: create_choreography
  name: "Worker dispatched"
  triggerSignal: "task_dispatch"
  steps: [
    { "action": "move", "entity": "worker", "to": "forge", "duration": 1200, "easing": "easeInOut" },
    { "action": "onArrive", "steps": [
      { "action": "flash", "target": "forge", "color": "gold" }
    ]}
  ]
```

### Step 4: Wire signals to choreographies

The agent connects the signal source to the choreography:

```
Tool: create_wire
  from: { zone: "signal", id: "ws-source" }
  to: { zone: "signal-type", id: "task_dispatch" }

Tool: create_wire
  from: { zone: "signal-type", id: "task_dispatch" }
  to: { zone: "choreographer", id: "worker-dispatched" }
```

### Step 5: Add a shader effect

The agent creates a glow shader:

```
Tool: create_shader
  name: "Forge glow"
  fragmentCode: |
    uniform float uIntensity; // @ui slider 0.0 2.0
    uniform vec3 uColor;      // @ui color
    void main() {
      float glow = uIntensity * smoothstep(0.5, 0.0, length(vUv - 0.5));
      gl_FragColor = vec4(uColor * glow, glow);
    }
```

### Step 6: Trigger and adjust

The agent fires a signal and tweaks the shader in real-time:

```
Tool: emit_signal
  type: "task_dispatch"
  payload: { "task": "gather_resources", "from": "barracks", "to": "forge" }

Tool: set_uniform
  shaderId: "forge-glow"
  uniform: "uIntensity"
  value: 1.5
```

The worker moves to the forge, a flash fires on arrival, and the forge glows — all composed by the AI agent through MCP.

## Shader tools in depth

The shader tools give agents full control over GPU-driven visual effects.

### Creating shaders

`create_shader` accepts GLSL source code with sajou's uniform annotation system:

- **`@ui slider min max`** — expose as a slider control
- **`@ui color`** — expose as a color picker
- **`@ui toggle`** — expose as a boolean toggle
- **`@ui xy`** — expose as a 2D control
- **`@bind`** — wire to choreography actions
- **`@object groupName`** — group uniforms under a collapsible panel

### Real-time uniform control

`set_uniform` lets agents tweak shader parameters without recompiling:

```
set_uniform(shaderId: "fire-effect", uniform: "uIntensity", value: 0.8)
set_uniform(shaderId: "fire-effect", uniform: "uFlameColor", value: [1.0, 0.4, 0.1])
```

Changes appear instantly in the browser. Combined with `emit_signal`, agents can create responsive visual effects that react to their own events.

### Multi-pass shaders

Shaders can use ping-pong feedback (multi-pass rendering) for effects like trails, blur, and fluid simulations. Set the pass count when creating or updating a shader with `update_shader`.
