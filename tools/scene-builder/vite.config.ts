import { defineConfig } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Server as HttpServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createConnection } from "node:net";

/**
 * Dynamic CORS proxy middleware for the Vite dev server.
 *
 * Routes: `/__proxy/?target=<encoded-url>`
 *
 * The browser-side code sends API requests here instead of directly to
 * external services (LM Studio, Ollama, etc.) to avoid CORS restrictions.
 * The Vite dev server forwards the request to the actual target and streams
 * the response back.
 */
function corsProxyPlugin() {
  return {
    name: "cors-proxy",
    configureServer(server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/__proxy/")) {
          next();
          return;
        }

        const parsed = new URL(req.url, "http://localhost");
        const target = parsed.searchParams.get("target");

        if (!target) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing ?target= parameter");
          return;
        }

        let targetUrl: URL;
        try {
          targetUrl = new URL(target);
        } catch {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Invalid target URL");
          return;
        }

        // Build headers — forward most from the original request
        const headers: Record<string, string> = {};
        for (const key of ["authorization", "content-type", "accept", "x-api-key", "anthropic-version"]) {
          const val = req.headers[key];
          if (val) headers[key] = Array.isArray(val) ? val[0] : val;
        }

        // Use native fetch to forward the request (Node 18+)
        const method = req.method ?? "GET";
        const isBodyMethod = method !== "GET" && method !== "HEAD";

        // Collect body if needed
        const bodyChunks: Buffer[] = [];

        const doFetch = (body: Buffer | undefined) => {
          fetch(targetUrl.href, {
            method,
            headers,
            body: isBodyMethod ? body : undefined,
            // @ts-expect-error -- Node fetch supports duplex for streaming
            duplex: isBodyMethod ? "half" : undefined,
          })
            .then(async (resp) => {
              // Forward status and headers
              const respHeaders: Record<string, string> = {};
              resp.headers.forEach((value, key) => {
                // Skip hop-by-hop headers
                if (key === "transfer-encoding" || key === "connection") return;
                respHeaders[key] = value;
              });
              // Add CORS headers so browser is happy
              respHeaders["access-control-allow-origin"] = "*";

              res.writeHead(resp.status, respHeaders);

              if (!resp.body) {
                res.end();
                return;
              }

              // Stream the response body
              const reader = resp.body.getReader();
              const pump = (): void => {
                reader
                  .read()
                  .then(({ done, value }) => {
                    if (done) {
                      res.end();
                      return;
                    }
                    res.write(Buffer.from(value));
                    pump();
                  })
                  .catch(() => {
                    res.end();
                  });
              };
              pump();
            })
            .catch((e) => {
              res.writeHead(502, { "Content-Type": "text/plain" });
              res.end(`Proxy error: ${e instanceof Error ? e.message : String(e)}`);
            });
        };

        if (isBodyMethod) {
          req.on("data", (chunk: Buffer) => bodyChunks.push(chunk));
          req.on("end", () => {
            doFetch(Buffer.concat(bodyChunks));
          });
        } else {
          doFetch(undefined);
        }
      });
    },
  };
}

/**
 * Signal ingestion plugin — HTTP POST → SSE broadcast.
 *
 * Adds two routes to the Vite dev server:
 *
 * - `POST /api/signal` — accepts a JSON signal, normalises it, broadcasts
 *   to all connected SSE clients.
 * - `GET /__signals__/stream` — SSE endpoint (long-lived `text/event-stream`).
 *
 * This lets external tools (curl, scripts, Claude Code hooks) push signals
 * into the scene-builder without a WebSocket connection:
 *
 * ```bash
 * curl -X POST http://localhost:5175/api/signal \
 *   -H 'Content-Type: application/json' \
 *   -d '{"type":"tool_call","payload":{"toolName":"Read","agentId":"claude"}}'
 * ```
 */
function signalIngestionPlugin() {
  /** Active SSE client connections. */
  const sseClients = new Set<ServerResponse>();

  /** Broadcast a JSON string to all connected SSE clients. */
  function broadcast(json: string): void {
    const frame = `data: ${json}\n\n`;
    for (const client of sseClients) {
      client.write(frame);
    }
  }

  return {
    name: "signal-ingestion",
    configureServer(server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";

        // -----------------------------------------------------------------
        // OPTIONS preflight for /api/signal
        // -----------------------------------------------------------------
        if (req.method === "OPTIONS" && url.startsWith("/api/signal")) {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
          });
          res.end();
          return;
        }

        // -----------------------------------------------------------------
        // GET /__signals__/stream — SSE endpoint
        // -----------------------------------------------------------------
        if (req.method === "GET" && url.startsWith("/__signals__/stream")) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
          });
          // Send initial comment to keep connection alive
          res.write(": connected\n\n");

          sseClients.add(res);
          req.on("close", () => {
            sseClients.delete(res);
          });
          return;
        }

        // -----------------------------------------------------------------
        // POST /api/signal — receive & broadcast
        // -----------------------------------------------------------------
        if (req.method === "POST" && url.startsWith("/api/signal")) {
          const bodyChunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => bodyChunks.push(chunk));
          req.on("end", () => {
            try {
              const raw = Buffer.concat(bodyChunks).toString("utf-8");
              const body = JSON.parse(raw) as Record<string, unknown>;

              // Normalise: wrap raw JSON without "type" into { type: "event", payload: body }
              let envelope: Record<string, unknown>;
              if (typeof body["type"] === "string") {
                envelope = body;
              } else {
                envelope = { type: "event", payload: body };
              }

              // Fill defaults
              if (!envelope["id"]) {
                envelope["id"] = crypto.randomUUID();
              }
              if (!envelope["timestamp"]) {
                envelope["timestamp"] = Date.now();
              }
              if (!envelope["source"]) {
                envelope["source"] = "http";
              }
              if (!envelope["payload"]) {
                envelope["payload"] = {};
              }

              const json = JSON.stringify(envelope);
              broadcast(json);

              res.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(JSON.stringify({ ok: true, id: envelope["id"], clients: sseClients.size }));
            } catch (e) {
              res.writeHead(400, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Tap hook management — inline logic (no runtime dependency on @sajou/tap dist)
// ---------------------------------------------------------------------------

const TAP_HOOK_TAG = "sajou-tap";
const TAP_HOOK_EVENTS = ["PreToolUse", "PostToolUse", "PostToolUseFailure", "SubagentStart", "SubagentStop", "Stop"];

interface TapHookEntry { type: string; command: string; async: boolean; timeout: number; statusMessage: string }
type TapHookConfig = Record<string, Array<{ hooks: TapHookEntry[] }>>;
interface TapSettings { hooks?: TapHookConfig; [key: string]: unknown }

/** Find nearest .claude directory by walking up from cwd. */
async function findClaudeDir(): Promise<string> {
  let dir = process.cwd();
  while (true) {
    const candidate = join(dir, ".claude");
    try {
      const s = await stat(candidate);
      if (s.isDirectory()) return candidate;
    } catch { /* keep walking */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(process.cwd(), ".claude");
}

async function readSettings(path: string): Promise<TapSettings> {
  try { return JSON.parse(await readFile(path, "utf8")) as TapSettings; }
  catch { return {}; }
}

function isTapHook(h: TapHookEntry): boolean { return h.statusMessage === TAP_HOOK_TAG; }

async function installTapHooks(): Promise<void> {
  const claudeDir = await findClaudeDir();
  const settingsPath = join(claudeDir, "settings.local.json");
  const settings = await readSettings(settingsPath);
  if (!settings.hooks) settings.hooks = {};

  for (const event of TAP_HOOK_EVENTS) {
    if (!settings.hooks[event]) settings.hooks[event] = [];
    // Deduplicate: remove existing tap hooks for this event
    settings.hooks[event] = settings.hooks[event]!.filter(g => !g.hooks.some(isTapHook));
    settings.hooks[event]!.push({
      hooks: [{ type: "command", command: "npx sajou-emit --stdin", async: true, timeout: 5, statusMessage: TAP_HOOK_TAG }],
    });
  }

  await mkdir(claudeDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

async function uninstallTapHooks(): Promise<void> {
  const claudeDir = await findClaudeDir();
  const settingsPath = join(claudeDir, "settings.local.json");
  const settings = await readSettings(settingsPath);
  if (!settings.hooks) return;

  const cleaned: TapHookConfig = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const filtered = groups.filter(g => !g.hooks.some(isTapHook));
    if (filtered.length > 0) cleaned[event] = filtered;
  }
  settings.hooks = Object.keys(cleaned).length > 0 ? cleaned : undefined;
  if (!settings.hooks) delete settings.hooks;

  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

/**
 * Tap hook management plugin — install/uninstall Claude Code hooks.
 *
 * Adds two routes:
 * - `POST /api/tap/connect`    — installs sajou-tap hooks in settings.local.json
 * - `POST /api/tap/disconnect` — removes sajou-tap hooks
 *
 * On server shutdown, hooks are automatically cleaned up.
 */
function tapHookPlugin() {
  let hooksInstalled = false;

  return {
    name: "tap-hooks",
    configureServer(server: {
      middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void };
      httpServer?: HttpServer | null;
    }) {
      // Cleanup hooks when server shuts down
      if (server.httpServer) {
        server.httpServer.on("close", () => {
          if (hooksInstalled) {
            uninstallTapHooks().catch(() => {});
            hooksInstalled = false;
          }
        });
      }

      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";

        // OPTIONS preflight for /api/tap/*
        if (req.method === "OPTIONS" && url.startsWith("/api/tap/")) {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
          });
          res.end();
          return;
        }

        // POST /api/tap/connect
        if (req.method === "POST" && url.startsWith("/api/tap/connect")) {
          installTapHooks()
            .then(() => {
              hooksInstalled = true;
              res.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(JSON.stringify({ ok: true }));
            })
            .catch((e) => {
              res.writeHead(500, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
            });
          return;
        }

        // POST /api/tap/disconnect
        if (req.method === "POST" && url.startsWith("/api/tap/disconnect")) {
          uninstallTapHooks()
            .then(() => {
              hooksInstalled = false;
              res.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(JSON.stringify({ ok: true }));
            })
            .catch((e) => {
              res.writeHead(500, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              });
              res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
            });
          return;
        }

        next();
      });
    },
  };
}

// ---------------------------------------------------------------------------
// OpenClaw token reader — reads token from ~/.openclaw/openclaw.json
// ---------------------------------------------------------------------------

/** Path to the OpenClaw config file. */
const OPENCLAW_CONFIG_PATH = join(
  process.env["HOME"] ?? process.env["USERPROFILE"] ?? ".",
  ".openclaw",
  "openclaw.json",
);

interface OpenClawConfig {
  gateway?: {
    auth?: {
      token?: string;
    };
  };
}

/** Read the OpenClaw gateway auth token from the local config file. */
async function readOpenClawToken(): Promise<string | null> {
  try {
    const raw = await readFile(OPENCLAW_CONFIG_PATH, "utf8");
    const config = JSON.parse(raw) as OpenClawConfig;
    return config.gateway?.auth?.token ?? null;
  } catch {
    return null;
  }
}

/**
 * OpenClaw token plugin — serves the gateway token for auto-fill.
 *
 * Route: `GET /api/openclaw/token`
 * Returns: `{ ok: true, token: "..." }` or `{ ok: false }`
 *
 * Security: CORS origin restricted to the Vite dev server origin.
 * In production builds this endpoint does not exist.
 */
function openclawTokenPlugin() {
  return {
    name: "openclaw-token",
    configureServer(server: {
      middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void };
      config: { server: { port?: number } };
    }) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" || !req.url?.startsWith("/api/openclaw/token")) {
          next();
          return;
        }

        // CORS origin check — only allow requests from the dev server itself
        const origin = req.headers["origin"] ?? "";
        const port = server.config.server.port ?? 5175;
        const allowedOrigins = [
          `http://localhost:${port}`,
          `http://127.0.0.1:${port}`,
          `http://0.0.0.0:${port}`,
        ];

        if (origin && !allowedOrigins.includes(origin)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Forbidden origin" }));
          return;
        }

        readOpenClawToken().then((token) => {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (origin) {
            headers["Access-Control-Allow-Origin"] = origin;
          }
          if (token) {
            res.writeHead(200, headers);
            res.end(JSON.stringify({ ok: true, token }));
          } else {
            res.writeHead(200, headers);
            res.end(JSON.stringify({ ok: false }));
          }
        });
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Local service discovery — server-side probes
// ---------------------------------------------------------------------------

/** Probe a TCP port on localhost. Resolves true if something is listening. */
function tcpProbe(port: number, timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.on("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

/** Probe an HTTP endpoint. Returns models list on success, null on failure. */
async function httpProbe(
  url: string,
  timeoutMs = 300,
): Promise<{ ok: boolean; models?: string[] }> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) return { ok: false };
    const json = (await resp.json()) as Record<string, unknown>;
    const data = json["data"];
    if (Array.isArray(data)) {
      const models = data.map((m) => {
        const entry = m as Record<string, unknown>;
        return String(entry["id"] ?? "unknown");
      });
      return { ok: true, models };
    }
    return { ok: true, models: [] };
  } catch {
    return { ok: false };
  }
}

interface DiscoveredServiceResponse {
  id: string;
  label: string;
  protocol: string;
  url: string;
  available: boolean;
  needsApiKey?: boolean;
  models: string[];
}

/**
 * Local discovery plugin — probes known local services on startup/rescan.
 *
 * Route: `GET /api/discover/local`
 * Returns: `{ services: DiscoveredServiceResponse[] }`
 */
function localDiscoveryPlugin() {
  return {
    name: "local-discovery",
    configureServer(server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" || !req.url?.startsWith("/api/discover/local")) {
          next();
          return;
        }

        // Run all probes in parallel
        Promise.allSettled([
          // Claude Code — always present (SSE internal endpoint)
          Promise.resolve<DiscoveredServiceResponse>({
            id: "local:claude-code",
            label: "Claude Code",
            protocol: "sse",
            url: "/__signals__/stream",
            available: true,
            models: [],
          }),

          // OpenClaw — TCP probe on 18789
          tcpProbe(18789, 300).then<DiscoveredServiceResponse>((up) => ({
            id: "local:openclaw",
            label: "OpenClaw",
            protocol: "openclaw",
            url: "ws://127.0.0.1:18789",
            available: up,
            needsApiKey: true,
            models: [],
          })),

          // LM Studio — HTTP probe on 1234
          httpProbe("http://127.0.0.1:1234/v1/models", 300).then<DiscoveredServiceResponse>((r) => ({
            id: "local:lm-studio",
            label: "LM Studio",
            protocol: "openai",
            url: "http://127.0.0.1:1234",
            available: r.ok,
            needsApiKey: true,
            models: r.models ?? [],
          })),

          // Ollama — HTTP probe on 11434
          httpProbe("http://127.0.0.1:11434/v1/models", 300).then<DiscoveredServiceResponse>((r) => ({
            id: "local:ollama",
            label: "Ollama",
            protocol: "openai",
            url: "http://127.0.0.1:11434",
            available: r.ok,
            models: r.models ?? [],
          })),
        ]).then((results) => {
          const services: DiscoveredServiceResponse[] = [];
          for (const result of results) {
            if (result.status === "fulfilled") {
              services.push(result.value);
            }
          }

          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify({ services }));
        });
      });
    },
  };
}

// ---------------------------------------------------------------------------
// State sync plugin — client pushes state, server caches & serves via REST
// ---------------------------------------------------------------------------

/**
 * State sync plugin — bridges client-side SPA state to REST endpoints.
 *
 * The scene-builder state lives in the browser (module-level stores).
 * This plugin provides a push/pull mechanism so external tools (MCP server,
 * CLI) can query the current state via simple HTTP GET requests.
 *
 * Routes:
 * - `POST /api/state/push`      — client pushes a snapshot of all state stores
 * - `GET  /api/scene/state`     — entities, positions, routes, dimensions, mode
 * - `GET  /api/choreographies`  — all choreography definitions + wiring info
 * - `GET  /api/bindings`        — all entity bindings
 * - `GET  /api/signals/sources` — connected signal sources
 * - `GET  /api/wiring`          — all wire connections
 */
function stateSyncPlugin() {
  /** Cached state snapshot pushed by the client. */
  let cachedState: Record<string, unknown> | null = null;
  /** Timestamp of last push. */
  let lastPushAt: number | null = null;

  /** CORS headers for all GET endpoints. */
  const corsHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  /** Return a JSON error when no state has been pushed yet. */
  function noStateResponse(res: ServerResponse): void {
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({
      ok: false,
      error: "No state available. The scene-builder client has not pushed state yet. Open the scene-builder UI and it will sync automatically.",
      data: null,
    }));
  }

  return {
    name: "state-sync",
    configureServer(server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";

        // OPTIONS preflight for /api/ endpoints (state-sync read + push)
        if (req.method === "OPTIONS" && (url.startsWith("/api/scene/state") || url.startsWith("/api/state/"))) {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
          });
          res.end();
          return;
        }

        // -----------------------------------------------------------------
        // POST /api/state/push — client pushes full state snapshot
        // -----------------------------------------------------------------
        if (req.method === "POST" && url.startsWith("/api/state/push")) {
          const bodyChunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => bodyChunks.push(chunk));
          req.on("end", () => {
            try {
              const raw = Buffer.concat(bodyChunks).toString("utf-8");
              cachedState = JSON.parse(raw) as Record<string, unknown>;
              lastPushAt = Date.now();

              res.writeHead(200, corsHeaders);
              res.end(JSON.stringify({ ok: true, receivedAt: lastPushAt }));
            } catch (e) {
              res.writeHead(400, corsHeaders);
              res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
            }
          });
          return;
        }

        // -----------------------------------------------------------------
        // GET /api/scene/state — scene entities, positions, dimensions, mode
        // -----------------------------------------------------------------
        if (req.method === "GET" && url.startsWith("/api/scene/state")) {
          if (!cachedState) { noStateResponse(res); return; }

          const scene = cachedState["scene"] as Record<string, unknown> | undefined;
          const editor = cachedState["editor"] as Record<string, unknown> | undefined;

          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({
            ok: true,
            lastPushAt,
            data: {
              dimensions: scene?.["dimensions"] ?? null,
              background: scene?.["background"] ?? null,
              layers: scene?.["layers"] ?? [],
              entities: scene?.["entities"] ?? [],
              positions: scene?.["positions"] ?? [],
              routes: scene?.["routes"] ?? [],
              zoneTypes: scene?.["zoneTypes"] ?? [],
              lighting: scene?.["lighting"] ?? null,
              particles: scene?.["particles"] ?? [],
              mode: editor?.["activeTool"] ?? null,
              viewMode: editor?.["viewMode"] ?? null,
            },
          }));
          return;
        }

        // -----------------------------------------------------------------
        // GET /api/choreographies — all choreography definitions + wiring
        // -----------------------------------------------------------------
        if (req.method === "GET" && url.startsWith("/api/choreographies")) {
          if (!cachedState) { noStateResponse(res); return; }

          const choreoState = cachedState["choreographies"] as Record<string, unknown> | undefined;
          const choreographies = (choreoState?.["choreographies"] ?? []) as Array<Record<string, unknown>>;
          const wires = ((cachedState["wiring"] as Record<string, unknown> | undefined)?.["wires"] ?? []) as Array<Record<string, unknown>>;

          // Enrich each choreography with wiring info
          const enriched = choreographies.map((c) => {
            const id = c["id"] as string;
            // Find signal-type → choreographer wires targeting this choreo
            const incomingWires = wires.filter(
              (w) => w["toZone"] === "choreographer" && w["toId"] === id && w["fromZone"] === "signal-type",
            );
            const wiredSignalTypes = incomingWires.map((w) => w["fromId"] as string);

            // Find signal → signal-type wires to resolve sources
            const sourceWires = wires.filter((w) => w["fromZone"] === "signal" && w["toZone"] === "signal-type");
            const sources: Array<{ sourceId: string; signalType: string }> = [];
            for (const signalType of wiredSignalTypes) {
              const sw = sourceWires.filter((w) => w["toId"] === signalType);
              for (const w of sw) {
                sources.push({ sourceId: w["fromId"] as string, signalType });
              }
            }

            const steps = (c["steps"] ?? []) as Array<Record<string, unknown>>;

            return {
              id,
              on: c["on"],
              when: c["when"] ?? null,
              interrupts: c["interrupts"] ?? false,
              defaultTargetEntityId: c["defaultTargetEntityId"] ?? null,
              stepCount: steps.length,
              stepTypes: steps.map((s) => s["action"] as string),
              wiredSignalTypes,
              sources,
            };
          });

          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({
            ok: true,
            lastPushAt,
            data: { choreographies: enriched },
          }));
          return;
        }

        // -----------------------------------------------------------------
        // GET /api/bindings — all entity bindings
        // -----------------------------------------------------------------
        if (req.method === "GET" && url.startsWith("/api/bindings")) {
          if (!cachedState) { noStateResponse(res); return; }

          const bindingState = cachedState["bindings"] as Record<string, unknown> | undefined;
          const bindings = (bindingState?.["bindings"] ?? []) as Array<Record<string, unknown>>;

          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({
            ok: true,
            lastPushAt,
            data: { bindings },
          }));
          return;
        }

        // -----------------------------------------------------------------
        // GET /api/signals/sources — connected signal sources
        // -----------------------------------------------------------------
        if (req.method === "GET" && url.startsWith("/api/signals/sources")) {
          if (!cachedState) { noStateResponse(res); return; }

          const sourcesState = cachedState["signalSources"] as Record<string, unknown> | undefined;
          const sources = ((sourcesState?.["sources"] ?? []) as Array<Record<string, unknown>>).map((s) => ({
            id: s["id"],
            name: s["name"],
            protocol: s["protocol"],
            url: s["url"],
            status: s["status"],
            error: s["error"] ?? null,
            category: s["category"],
            eventsPerSecond: s["eventsPerSecond"] ?? 0,
            streaming: s["streaming"] ?? false,
          }));

          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({
            ok: true,
            lastPushAt,
            data: { sources },
          }));
          return;
        }

        // -----------------------------------------------------------------
        // GET /api/wiring — all wire connections
        // -----------------------------------------------------------------
        if (req.method === "GET" && url.startsWith("/api/wiring")) {
          if (!cachedState) { noStateResponse(res); return; }

          const wiringState = cachedState["wiring"] as Record<string, unknown> | undefined;
          const wires = (wiringState?.["wires"] ?? []) as Array<Record<string, unknown>>;

          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({
            ok: true,
            lastPushAt,
            data: {
              wires: wires.map((w) => ({
                id: w["id"],
                fromZone: w["fromZone"],
                fromId: w["fromId"],
                toZone: w["toZone"],
                toId: w["toId"],
                mapping: w["mapping"] ?? null,
              })),
            },
          }));
          return;
        }

        // -----------------------------------------------------------------
        // GET /api/shaders — all shader definitions
        // -----------------------------------------------------------------
        if (req.method === "GET" && url.startsWith("/api/shaders")) {
          if (!cachedState) { noStateResponse(res); return; }

          const shaderState = cachedState["shaders"] as Record<string, unknown> | undefined;
          const shaders = (shaderState?.["shaders"] ?? []) as Array<Record<string, unknown>>;

          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({
            ok: true,
            lastPushAt,
            data: { shaders },
          }));
          return;
        }

        // -----------------------------------------------------------------
        // GET /api/p5 — all p5.js sketch definitions
        // -----------------------------------------------------------------
        if (req.method === "GET" && url.startsWith("/api/p5")) {
          if (!cachedState) { noStateResponse(res); return; }

          const p5State = cachedState["p5"] as Record<string, unknown> | undefined;
          const sketches = (p5State?.["sketches"] ?? []) as Array<Record<string, unknown>>;

          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({
            ok: true,
            lastPushAt,
            data: { sketches },
          }));
          return;
        }

        next();
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Command queue plugin — server→client write commands for MCP scene composition
// ---------------------------------------------------------------------------

/**
 * A queued command from the MCP server that the client must execute.
 *
 * The flow:
 * 1. MCP tool → bridge → POST /api/scene/entities (etc.)
 * 2. Server plugin queues a SceneCommand
 * 3. Client polls GET /api/commands/pending → receives pending commands
 * 4. Client executes each command against the local stores
 * 5. Client ACKs via POST /api/commands/ack
 * 6. State-sync pushes the updated state back to the server
 */
interface SceneCommand {
  /** Unique command ID. */
  id: string;
  /** The mutation action. */
  action: "add" | "remove" | "update" | "set-uniform" | "set-param";
  /** Which store / entity type this command targets. */
  type: "entity" | "choreography" | "binding" | "wire" | "source" | "shader" | "p5";
  /** Payload data — shape depends on action + type. */
  data: Record<string, unknown>;
  /** Timestamp when the command was queued. */
  queuedAt: number;
}

function commandQueuePlugin() {
  /** Pending commands waiting for client consumption. */
  const pending: SceneCommand[] = [];
  /** Set of command IDs that have been acknowledged. */
  const acknowledged = new Set<string>();
  /** Active SSE client connections for command streaming. */
  const commandClients = new Set<ServerResponse>();

  /** CORS headers for all endpoints. */
  const corsHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  /** Broadcast a command to all connected SSE clients. */
  function broadcastCommand(cmd: SceneCommand): void {
    const frame = `event: command\ndata: ${JSON.stringify(cmd)}\n\n`;
    for (const client of commandClients) {
      client.write(frame);
    }
  }

  /** Read and parse a JSON body from a request. */
  function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>);
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });
  }

  /** Enqueue a command and return it (with generated ID). */
  function enqueue(action: SceneCommand["action"], type: SceneCommand["type"], data: Record<string, unknown>): SceneCommand {
    const cmd: SceneCommand = {
      id: crypto.randomUUID(),
      action,
      type,
      data,
      queuedAt: Date.now(),
    };
    pending.push(cmd);
    broadcastCommand(cmd);
    return cmd;
  }

  return {
    name: "command-queue",
    configureServer(server: { middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        const method = req.method ?? "GET";

        // OPTIONS preflight for /api/ write endpoints
        if (method === "OPTIONS" && (url.startsWith("/api/scene/entities") || url.startsWith("/api/choreographies") || url.startsWith("/api/bindings") || url.startsWith("/api/wiring") || url.startsWith("/api/signals/sources") || url.startsWith("/api/shaders") || url.startsWith("/api/p5") || url.startsWith("/api/commands/"))) {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
          });
          res.end();
          return;
        }

        // -----------------------------------------------------------------
        // POST /api/scene/entities — place/remove/update an entity
        // -----------------------------------------------------------------
        if (method === "POST" && url.startsWith("/api/scene/entities")) {
          readBody(req).then((body) => {
            const action = (body["action"] as string) ?? "add";
            if (action !== "add" && action !== "remove" && action !== "update") {
              res.writeHead(400, corsHeaders);
              res.end(JSON.stringify({ ok: false, error: "Invalid action. Expected 'add', 'remove', or 'update'." }));
              return;
            }
            const cmd = enqueue(action as SceneCommand["action"], "entity", body);
            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ ok: true, commandId: cmd.id }));
          }).catch((e) => {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          });
          return;
        }

        // -----------------------------------------------------------------
        // POST /api/choreographies — create/remove/update a choreography
        // -----------------------------------------------------------------
        if (method === "POST" && url.startsWith("/api/choreographies")) {
          readBody(req).then((body) => {
            const action = (body["action"] as string) ?? "add";
            if (action !== "add" && action !== "remove" && action !== "update") {
              res.writeHead(400, corsHeaders);
              res.end(JSON.stringify({ ok: false, error: "Invalid action. Expected 'add', 'remove', or 'update'." }));
              return;
            }
            const cmd = enqueue(action as SceneCommand["action"], "choreography", body);
            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ ok: true, commandId: cmd.id }));
          }).catch((e) => {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          });
          return;
        }

        // -----------------------------------------------------------------
        // POST /api/bindings — create/remove a binding
        // -----------------------------------------------------------------
        if (method === "POST" && url.startsWith("/api/bindings")) {
          readBody(req).then((body) => {
            const action = (body["action"] as string) ?? "add";
            if (action !== "add" && action !== "remove") {
              res.writeHead(400, corsHeaders);
              res.end(JSON.stringify({ ok: false, error: "Invalid action. Expected 'add' or 'remove'." }));
              return;
            }
            const cmd = enqueue(action as SceneCommand["action"], "binding", body);
            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ ok: true, commandId: cmd.id }));
          }).catch((e) => {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          });
          return;
        }

        // -----------------------------------------------------------------
        // POST /api/wiring — create/remove a wire
        // -----------------------------------------------------------------
        if (method === "POST" && url.startsWith("/api/wiring")) {
          readBody(req).then((body) => {
            const action = (body["action"] as string) ?? "add";
            if (action !== "add" && action !== "remove") {
              res.writeHead(400, corsHeaders);
              res.end(JSON.stringify({ ok: false, error: "Invalid action. Expected 'add' or 'remove'." }));
              return;
            }
            const cmd = enqueue(action as SceneCommand["action"], "wire", body);
            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ ok: true, commandId: cmd.id }));
          }).catch((e) => {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          });
          return;
        }

        // -----------------------------------------------------------------
        // POST /api/signals/sources — add/remove a signal source
        // -----------------------------------------------------------------
        if (method === "POST" && url.startsWith("/api/signals/sources")) {
          readBody(req).then((body) => {
            const action = (body["action"] as string) ?? "add";
            if (action !== "add" && action !== "remove") {
              res.writeHead(400, corsHeaders);
              res.end(JSON.stringify({ ok: false, error: "Invalid action. Expected 'add' or 'remove'." }));
              return;
            }
            const cmd = enqueue(action as SceneCommand["action"], "source", body);
            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ ok: true, commandId: cmd.id }));
          }).catch((e) => {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          });
          return;
        }

        // -----------------------------------------------------------------
        // POST /api/shaders — create a shader
        // -----------------------------------------------------------------
        if (method === "POST" && url === "/api/shaders") {
          readBody(req).then((body) => {
            const cmd = enqueue("add", "shader", body);
            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ ok: true, commandId: cmd.id }));
          }).catch((e) => {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          });
          return;
        }

        // -----------------------------------------------------------------
        // PUT /api/shaders/:id — update a shader
        // -----------------------------------------------------------------
        if (method === "PUT" && url.startsWith("/api/shaders/")) {
          const shaderId = url.slice("/api/shaders/".length).split("?")[0]!;
          readBody(req).then((body) => {
            const cmd = enqueue("update", "shader", { ...body, id: shaderId });
            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ ok: true, commandId: cmd.id }));
          }).catch((e) => {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          });
          return;
        }

        // -----------------------------------------------------------------
        // DELETE /api/shaders/:id — remove a shader
        // -----------------------------------------------------------------
        if (method === "DELETE" && url.startsWith("/api/shaders/") && !url.includes("/uniforms")) {
          const shaderId = url.slice("/api/shaders/".length).split("?")[0]!;
          const cmd = enqueue("remove", "shader", { id: shaderId });
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ ok: true, commandId: cmd.id }));
          return;
        }

        // -----------------------------------------------------------------
        // POST /api/shaders/:id/uniforms — set uniform values
        // -----------------------------------------------------------------
        if (method === "POST" && url.includes("/uniforms") && url.startsWith("/api/shaders/")) {
          const shaderId = url.slice("/api/shaders/".length).split("/uniforms")[0]!;
          readBody(req).then((body) => {
            const cmd = enqueue("set-uniform", "shader", { ...body, id: shaderId });
            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ ok: true, commandId: cmd.id }));
          }).catch((e) => {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          });
          return;
        }

        // -----------------------------------------------------------------
        // POST /api/p5 — create a p5 sketch
        // -----------------------------------------------------------------
        if (method === "POST" && url === "/api/p5") {
          readBody(req).then((body) => {
            const cmd = enqueue("add", "p5", body);
            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ ok: true, commandId: cmd.id }));
          }).catch((e) => {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          });
          return;
        }

        // -----------------------------------------------------------------
        // PUT /api/p5/:id — update a p5 sketch
        // -----------------------------------------------------------------
        if (method === "PUT" && url.startsWith("/api/p5/") && !url.includes("/params")) {
          const sketchId = url.slice("/api/p5/".length).split("?")[0]!;
          readBody(req).then((body) => {
            const cmd = enqueue("update", "p5", { ...body, id: sketchId });
            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ ok: true, commandId: cmd.id }));
          }).catch((e) => {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          });
          return;
        }

        // -----------------------------------------------------------------
        // DELETE /api/p5/:id — remove a p5 sketch
        // -----------------------------------------------------------------
        if (method === "DELETE" && url.startsWith("/api/p5/") && !url.includes("/params")) {
          const sketchId = url.slice("/api/p5/".length).split("?")[0]!;
          const cmd = enqueue("remove", "p5", { id: sketchId });
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ ok: true, commandId: cmd.id }));
          return;
        }

        // -----------------------------------------------------------------
        // POST /api/p5/:id/params — set param values
        // -----------------------------------------------------------------
        if (method === "POST" && url.includes("/params") && url.startsWith("/api/p5/")) {
          const sketchId = url.slice("/api/p5/".length).split("/params")[0]!;
          readBody(req).then((body) => {
            const cmd = enqueue("set-param", "p5", { ...body, id: sketchId });
            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ ok: true, commandId: cmd.id }));
          }).catch((e) => {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          });
          return;
        }

        // -----------------------------------------------------------------
        // GET /__commands__/stream — SSE endpoint for real-time commands
        // -----------------------------------------------------------------
        if (method === "GET" && url.startsWith("/__commands__/stream")) {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
          });
          res.write(": connected\n\n");

          commandClients.add(res);
          req.on("close", () => {
            commandClients.delete(res);
          });
          return;
        }

        // -----------------------------------------------------------------
        // GET /api/commands/pending — client polls for queued commands (fallback)
        // -----------------------------------------------------------------
        if (method === "GET" && url.startsWith("/api/commands/pending")) {
          // Return commands not yet acknowledged
          const cmds = pending.filter((c) => !acknowledged.has(c.id));
          res.writeHead(200, corsHeaders);
          res.end(JSON.stringify({ ok: true, commands: cmds }));
          return;
        }

        // -----------------------------------------------------------------
        // POST /api/commands/ack — client acknowledges processed commands
        // -----------------------------------------------------------------
        if (method === "POST" && url.startsWith("/api/commands/ack")) {
          readBody(req).then((body) => {
            const ids = body["ids"] as string[] | undefined;
            if (!Array.isArray(ids)) {
              res.writeHead(400, corsHeaders);
              res.end(JSON.stringify({ ok: false, error: "Expected { ids: string[] }" }));
              return;
            }
            for (const id of ids) {
              acknowledged.add(id);
            }
            // Prune fully acknowledged commands from the pending list
            const before = pending.length;
            for (let i = pending.length - 1; i >= 0; i--) {
              if (acknowledged.has(pending[i]!.id)) {
                acknowledged.delete(pending[i]!.id);
                pending.splice(i, 1);
              }
            }
            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ ok: true, pruned: before - pending.length }));
          }).catch((e) => {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
          });
          return;
        }

        next();
      });
    },
  };
}

// Read version from tauri.conf.json (single source of truth for the desktop app).
// Falls back to package.json version for non-Tauri builds.
const appVersion = await readFile(join(import.meta.dirname!, "src-tauri/tauri.conf.json"), "utf-8")
  .then((raw) => JSON.parse(raw).version as string)
  .catch(() => "dev");

export default defineConfig({
  root: ".",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [corsProxyPlugin(), signalIngestionPlugin(), tapHookPlugin(), openclawTokenPlugin(), localDiscoveryPlugin(), stateSyncPlugin(), commandQueuePlugin()],
  server: {
    host: "0.0.0.0",
    port: 5175,
    open: true,
  },
  build: {
    outDir: "dist",
  },
});
