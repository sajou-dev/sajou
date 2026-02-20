/**
 * Local service discovery + OpenClaw token routes.
 *
 * Extracted from localDiscoveryPlugin and openclawTokenPlugin in vite.config.ts.
 */

import { Router } from "express";
import { createConnection } from "node:net";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Probe helpers
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

/** Probe an HTTP endpoint. Returns models list on success. */
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

// ---------------------------------------------------------------------------
// OpenClaw token reader
// ---------------------------------------------------------------------------

const OPENCLAW_CONFIG_PATH = join(
  process.env["HOME"] ?? process.env["USERPROFILE"] ?? ".",
  ".openclaw",
  "openclaw.json",
);

interface OpenClawConfig {
  gateway?: { auth?: { token?: string } };
}

async function readOpenClawToken(): Promise<string | null> {
  try {
    const raw = await readFile(OPENCLAW_CONFIG_PATH, "utf8");
    const config = JSON.parse(raw) as OpenClawConfig;
    return config.gateway?.auth?.token ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Discovered service response shape
// ---------------------------------------------------------------------------

interface DiscoveredServiceResponse {
  id: string;
  label: string;
  protocol: string;
  url: string;
  available: boolean;
  needsApiKey?: boolean;
  models: string[];
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function createDiscoveryRoutes(): Router {
  const router = Router();

  // GET /api/discover/local — probe known local services
  router.get("/api/discover/local", (_req, res) => {
    Promise.allSettled([
      // Claude Code — always available (SSE internal endpoint)
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

      // Codex — TCP probe on 4500
      tcpProbe(4500, 300).then<DiscoveredServiceResponse>((up) => ({
        id: "local:codex",
        label: "Codex",
        protocol: "codex",
        url: "ws://127.0.0.1:4500",
        available: up,
        models: [],
      })),
    ]).then((results) => {
      const services: DiscoveredServiceResponse[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          services.push(result.value);
        }
      }
      res.json({ services });
    });
  });

  // GET /api/openclaw/token — serve OpenClaw gateway token (dev only)
  router.get("/api/openclaw/token", (req, res) => {
    const origin = req.headers["origin"] ?? "";
    // In standalone server mode, allow any localhost origin
    if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1") && !origin.includes("0.0.0.0")) {
      res.status(403).json({ ok: false, error: "Forbidden origin" });
      return;
    }

    readOpenClawToken().then((token) => {
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
      if (token) {
        res.json({ ok: true, token });
      } else {
        res.json({ ok: false });
      }
    });
  });

  return router;
}
