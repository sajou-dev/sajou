# @sajou/mcp-server

MCP (Model Context Protocol) server for sajou. Lets AI agents interact with the visual choreographer via the standard MCP protocol.

## Setup

### 1. Start the scene-builder dev server

```bash
pnpm --filter scene-builder dev
```

The scene-builder runs on `http://localhost:5175` by default.

### 2. Configure your MCP client

#### Claude Code

Add to your MCP config (`~/.claude/claude_desktop_config.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "sajou": {
      "command": "npx",
      "args": ["-y", "@sajou/mcp-server"],
      "env": {
        "SAJOU_DEV_SERVER": "http://localhost:5175"
      }
    }
  }
}
```

#### Development (from this repo)

```json
{
  "mcpServers": {
    "sajou": {
      "command": "npx",
      "args": ["tsx", "packages/mcp-server/src/index.ts"],
      "env": {
        "SAJOU_DEV_SERVER": "http://localhost:5175"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `emit_signal` | Emit a signal to the scene. Triggers choreographies. |
| `get_scene_state` | Get current scene entities (id, position, visibility). |
| `get_choreographies` | List available choreographies with descriptions. |
| `list_themes` | List available themes (citadel, office). |
| `get_catalog` | Get entity catalog for a theme (buildings, units, etc.). |
| `map_signals` | Map a signal type to a choreography. |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SAJOU_DEV_SERVER` | `http://localhost:5175` | URL of the scene-builder dev server |

## Architecture

```
AI Agent (Claude) ──MCP/stdio──> sajou-mcp ──HTTP──> scene-builder dev server
                                                      │
                                                      ├── POST /api/signal (emit signals)
                                                      ├── GET /api/scene/state (scene state)
                                                      └── GET /__signals__/stream (SSE)
```

The MCP server is a thin adapter. It translates MCP tool calls into HTTP requests against the scene-builder's existing API endpoints. The scene-builder handles all signal routing, choreography execution, and rendering.
