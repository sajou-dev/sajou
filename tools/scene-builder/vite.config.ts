import { defineConfig } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Server as HttpServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";

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

export default defineConfig({
  root: ".",
  plugins: [corsProxyPlugin(), signalIngestionPlugin(), tapHookPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5175,
    open: true,
  },
  build: {
    outDir: "dist",
  },
});
