/**
 * CORS proxy route — forwards requests to external services.
 *
 * Extracted from corsProxyPlugin in vite.config.ts.
 * Used by the browser to bypass CORS restrictions when probing
 * LM Studio, Ollama, and other local services.
 */

import { Router } from "express";

export function createProxyRoutes(): Router {
  const router = Router();

  // GET/POST /__proxy/?target=<encoded-url>
  router.all("/__proxy/", (req, res) => {
    const target = req.query["target"] as string | undefined;

    if (!target) {
      res.status(400).type("text/plain").send("Missing ?target= parameter");
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(target);
    } catch {
      res.status(400).type("text/plain").send("Invalid target URL");
      return;
    }

    // Build headers — forward auth-related headers
    const headers: Record<string, string> = {};
    for (const key of ["authorization", "content-type", "accept", "x-api-key", "anthropic-version"]) {
      const val = req.headers[key];
      if (val) headers[key] = Array.isArray(val) ? val[0]! : val;
    }

    const method = req.method ?? "GET";
    const isBodyMethod = method !== "GET" && method !== "HEAD";

    // Collect body for non-GET methods
    const bodyChunks: Buffer[] = [];

    const doFetch = (body: Buffer | undefined) => {
      fetch(targetUrl.href, {
        method,
        headers,
        body: isBodyMethod ? body : undefined,
      })
        .then(async (resp) => {
          const respHeaders: Record<string, string> = {};
          resp.headers.forEach((value, key) => {
            if (key === "transfer-encoding" || key === "connection") return;
            respHeaders[key] = value;
          });
          respHeaders["access-control-allow-origin"] = "*";

          res.writeHead(resp.status, respHeaders);

          if (!resp.body) {
            res.end();
            return;
          }

          const reader = resp.body.getReader();
          const pump = (): void => {
            reader.read().then(({ done, value }) => {
              if (done) { res.end(); return; }
              res.write(Buffer.from(value));
              pump();
            }).catch(() => { res.end(); });
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
      req.on("end", () => { doFetch(Buffer.concat(bodyChunks)); });
    } else {
      doFetch(undefined);
    }
  });

  return router;
}
