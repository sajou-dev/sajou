/**
 * Signal ingestion routes — HTTP POST → SSE broadcast.
 *
 * Extracted from the signalIngestionPlugin in vite.config.ts.
 */

import { Router } from "express";
import type { Response } from "express";

/** Active SSE client connections for signal streaming. */
const sseClients = new Set<Response>();

/** Broadcast a JSON string to all connected SSE clients. */
export function broadcastSignal(json: string): void {
  const frame = `data: ${json}\n\n`;
  for (const client of sseClients) {
    client.write(frame);
  }
}

/** Get the number of connected SSE signal clients. */
export function getSignalClientCount(): number {
  return sseClients.size;
}

export function createSignalRoutes(): Router {
  const router = Router();

  // POST /api/signal — receive & broadcast
  router.post("/api/signal", (req, res) => {
    const body = req.body as Record<string, unknown>;

    // Normalise: wrap raw JSON without "type" into { type: "event", payload: body }
    let envelope: Record<string, unknown>;
    if (typeof body["type"] === "string") {
      envelope = { ...body };
    } else {
      envelope = { type: "event", payload: body };
    }

    // Fill defaults
    if (!envelope["id"]) envelope["id"] = crypto.randomUUID();
    if (!envelope["timestamp"]) envelope["timestamp"] = Date.now();
    if (!envelope["source"]) envelope["source"] = "http";
    if (!envelope["payload"]) envelope["payload"] = {};

    const json = JSON.stringify(envelope);
    broadcastSignal(json);

    res.json({ ok: true, id: envelope["id"], clients: sseClients.size });
  });

  // GET /__signals__/stream — SSE endpoint
  router.get("/__signals__/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write(": connected\n\n");

    sseClients.add(res);
    req.on("close", () => {
      sseClients.delete(res);
    });
  });

  return router;
}
