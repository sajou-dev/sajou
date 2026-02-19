import { defineConfig } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Dynamic CORS proxy middleware for the Vite dev server.
 *
 * Routes: `/__proxy/?target=<encoded-url>`
 *
 * The browser-side code sends API requests here instead of directly to
 * external services (LM Studio, Ollama, etc.) to avoid CORS restrictions.
 * The Vite dev server forwards the request to the actual target and streams
 * the response back.
 *
 * This plugin is kept local to Vite (not proxied to the sajou server)
 * because it needs to work even without the server running, and because
 * the Tauri desktop build bypasses CORS via its own HTTP plugin.
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

// Read version from tauri.conf.json (single source of truth for the desktop app).
// Falls back to package.json version for non-Tauri builds.
const appVersion = await readFile(join(import.meta.dirname!, "src-tauri/tauri.conf.json"), "utf-8")
  .then((raw) => JSON.parse(raw).version as string)
  .catch(() => "dev");

/** The sajou state server URL. Override with SAJOU_SERVER env var. */
const serverUrl = process.env["SAJOU_SERVER"] ?? "http://localhost:3001";

export default defineConfig({
  root: ".",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [corsProxyPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5175,
    open: true,
    proxy: {
      // Forward all API, SSE, and MCP traffic to the sajou state server.
      // The CORS proxy (__proxy/) is handled locally by the plugin above.
      "/api": serverUrl,
      "/__signals__": serverUrl,
      "/__commands__": serverUrl,
      "/mcp": serverUrl,
    },
  },
  build: {
    outDir: "dist",
  },
});
