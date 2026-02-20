# Local Discovery

The scene-builder automatically detects AI services running on your machine and presents them as connectable signal sources.

## How It Works

```
Browser                          Vite Dev Server
   │                                   │
   │  GET /api/discover/local          │
   │──────────────────────────────────►│
   │                                   │──► tcpProbe(18789)    → OpenClaw
   │                                   │──► httpProbe(:1234)   → LM Studio
   │                                   │──► httpProbe(:11434)  → Ollama
   │                                   │──► Claude Code (always available)
   │  { services: [...] }              │
   │◄──────────────────────────────────│
   │                                   │
   │  upsertLocalSources(services)     │
   │  (sync into signal-source-state)  │
```

The Vite dev server runs all probes in parallel with `Promise.allSettled()` and a 300ms timeout. Services that don't respond are marked `available: false`.

## Probed Services

| Service | Probe | Port | Protocol | Source ID |
|---|---|---|---|---|
| Claude Code | Always available (SSE internal) | -- | `sse` | `local:claude-code` |
| OpenClaw | TCP socket probe | 18789 | `openclaw` | `local:openclaw` |
| LM Studio | HTTP `GET /v1/models` | 1234 | `openai` | `local:lm-studio` |
| Ollama | HTTP `GET /v1/models` | 11434 | `openai` | `local:ollama` |

LM Studio and Ollama probes also fetch the list of available models from their `/v1/models` endpoint.

## Source Categories

Sources are split into two categories:

- **LOCAL** -- auto-discovered, ephemeral. Rebuilt on every scan. Fixed identity colors to prevent visual drift across sessions.
- **REMOTE** -- manually added by the user. Persisted to localStorage. Default URL: `wss://test.sajou.dev/signals`.

The chip bar UI displays both sections with a separator. Unavailable local sources appear grayed out (opacity 0.35) and are non-clickable.

## Scan Lifecycle

`scanAndSyncLocal()` runs:
- At application startup (before workspace init)
- When the user clicks the **Rescan** button (rotate-cw icon)
- On MIDI device hot-plug events

The function:
1. Probes server-side services + browser MIDI devices in parallel
2. Calls `upsertLocalSources()` to sync results into signal-source-state
3. Auto-fills the OpenClaw token if available
4. Auto-connects Claude Code and OpenClaw (if token is present)

### upsertLocalSources()

Syncs discovered services with the source list:
- **New services** → create source entry with appropriate protocol and color
- **Disappeared services** → mark as `"unavailable"` (not deleted)
- **Already connected** → never touched (won't disconnect a live connection)

## OpenClaw Token Auto-Fill

When OpenClaw is detected:

1. Client calls `GET /api/openclaw/token`
2. Vite plugin reads `~/.openclaw/openclaw.json` → `gateway.auth.token`
3. If token found and source has no key: pre-fill `apiKey` and mark `tokenAutoFilled: true`
4. CORS restricted to the dev server origin (security)

The popover also has a "Paste from config" button for manual re-fetch.

## MIDI Discovery

Browser-side MIDI detection runs alongside server probes:

- Uses `navigator.requestMIDIAccess()` (Web MIDI API)
- Each MIDI input port becomes a local source with protocol `"midi"`
- `initMIDIHotPlug()` registers a `statechange` listener that triggers `scanAndSyncLocal()` on plug/unplug

## Transport Protocols

| Protocol | Transport | Used By |
|---|---|---|
| `sse` | Server-Sent Events | Claude Code (internal SSE endpoint) |
| `websocket` | WebSocket (raw JSON) | Generic remote sources |
| `openclaw` | WebSocket + handshake | OpenClaw gateway |
| `openai` | HTTP + CORS proxy | LM Studio, Ollama |
| `anthropic` | HTTP + CORS proxy | Anthropic API |
| `midi` | Web MIDI API | MIDI controllers |

OpenAI and Anthropic protocols route through the Vite CORS proxy (`/__proxy/?target=...`) to avoid browser CORS restrictions.

## Key Files

| File | Role |
|---|---|
| `state/local-discovery.ts` | Client-side scan + token fetch |
| `state/signal-source-state.ts` | Source store, upsert logic, categories |
| `vite.config.ts` | `localDiscoveryPlugin()`, `openclawTokenPlugin()` |
| `midi/midi-discovery.ts` | MIDI device detection + hot-plug |
| `views/signal-connection.ts` | Transport connection logic |
