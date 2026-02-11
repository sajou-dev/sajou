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
        for (const key of ["authorization", "content-type", "accept"]) {
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

export default defineConfig({
  root: ".",
  plugins: [corsProxyPlugin()],
  server: {
    port: 5175,
    open: true,
  },
  build: {
    outDir: "dist",
  },
});
