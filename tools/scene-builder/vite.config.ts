import { defineConfig } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

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

export default defineConfig({
  root: ".",
  plugins: [corsProxyPlugin(), signalIngestionPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5175,
    open: true,
  },
  build: {
    outDir: "dist",
  },
});
