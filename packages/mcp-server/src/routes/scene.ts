/**
 * Scene state routes — read state from store + write mutations directly.
 *
 * Combines the old stateSyncPlugin (GET reads) and commandQueuePlugin (POST writes).
 * Key difference: POST endpoints now mutate the store directly instead of
 * queuing commands for a browser client.
 */

import { Router } from "express";
import type { Response } from "express";
import {
  getFullState,
  getSceneSnapshot,
  getChoreographies,
  getWiring,
  getBindings,
  getSignalSources,
  getShaders,
  getP5,
  getEditor,
  getLastMutationAt,
  setFullState,
  subscribe,
} from "../state/store.js";
import { executeCommand } from "../state/mutations.js";

// ---------------------------------------------------------------------------
// SSE for browser state updates
// ---------------------------------------------------------------------------

/** Active SSE clients for command/state change streaming. */
const commandClients = new Set<Response>();

/** Broadcast a state-change event to connected browsers. */
function broadcastStateChange(data: Record<string, unknown>): void {
  const frame = `event: state-change\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of commandClients) {
    client.write(frame);
  }
}

// Subscribe to store changes to notify browsers
subscribe(() => {
  broadcastStateChange({ version: Date.now() });
});

export function createSceneRoutes(): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // POST /api/state/push — browser pushes full state snapshot
  // -----------------------------------------------------------------------
  router.post("/api/state/push", (req, res) => {
    const snapshot = req.body as Record<string, unknown>;
    setFullState(snapshot);
    res.json({ ok: true, receivedAt: Date.now() });
  });

  // -----------------------------------------------------------------------
  // GET /api/scene/state — entities, positions, routes, dimensions, mode
  // -----------------------------------------------------------------------
  router.get("/api/scene/state", (_req, res) => {
    const scene = getSceneSnapshot();
    const editor = getEditor();

    res.json({
      ok: true,
      lastPushAt: getLastMutationAt(),
      data: {
        dimensions: scene["dimensions"] ?? null,
        background: scene["background"] ?? null,
        layers: scene["layers"] ?? [],
        entities: scene["entities"] ?? [],
        positions: scene["positions"] ?? [],
        routes: scene["routes"] ?? [],
        zoneTypes: scene["zoneTypes"] ?? [],
        lighting: scene["lighting"] ?? null,
        particles: scene["particles"] ?? [],
        mode: editor["activeTool"] ?? null,
        viewMode: editor["viewMode"] ?? null,
      },
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/choreographies — enriched with wiring info
  // -----------------------------------------------------------------------
  router.get("/api/choreographies", (_req, res) => {
    const choreoState = getChoreographies();
    const choreographies = (choreoState["choreographies"] ?? []) as Array<Record<string, unknown>>;
    const wiringState = getWiring();
    const wires = (wiringState["wires"] ?? []) as Array<Record<string, unknown>>;

    const enriched = choreographies.map((c) => {
      const id = c["id"] as string;
      const incomingWires = wires.filter(
        (w) => w["toZone"] === "choreographer" && w["toId"] === id && w["fromZone"] === "signal-type",
      );
      const wiredSignalTypes = incomingWires.map((w) => w["fromId"] as string);

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

    res.json({
      ok: true,
      lastPushAt: getLastMutationAt(),
      data: { choreographies: enriched },
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/bindings
  // -----------------------------------------------------------------------
  router.get("/api/bindings", (_req, res) => {
    const bindingState = getBindings();
    res.json({
      ok: true,
      lastPushAt: getLastMutationAt(),
      data: { bindings: bindingState["bindings"] ?? [] },
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/signals/sources
  // -----------------------------------------------------------------------
  router.get("/api/signals/sources", (_req, res) => {
    const sourcesState = getSignalSources();
    const sources = ((sourcesState["sources"] ?? []) as Array<Record<string, unknown>>).map((s) => ({
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

    res.json({
      ok: true,
      lastPushAt: getLastMutationAt(),
      data: { sources },
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/wiring
  // -----------------------------------------------------------------------
  router.get("/api/wiring", (_req, res) => {
    const wiringState = getWiring();
    const wires = (wiringState["wires"] ?? []) as Array<Record<string, unknown>>;

    res.json({
      ok: true,
      lastPushAt: getLastMutationAt(),
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
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/shaders
  // -----------------------------------------------------------------------
  router.get("/api/shaders", (_req, res) => {
    const shaderState = getShaders();
    res.json({
      ok: true,
      lastPushAt: getLastMutationAt(),
      data: { shaders: shaderState["shaders"] ?? [] },
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/p5
  // -----------------------------------------------------------------------
  router.get("/api/p5", (_req, res) => {
    const p5State = getP5();
    res.json({
      ok: true,
      lastPushAt: getLastMutationAt(),
      data: { sketches: p5State["sketches"] ?? [] },
    });
  });

  // -----------------------------------------------------------------------
  // Write endpoints — direct mutations (no command queue)
  // -----------------------------------------------------------------------

  // POST /api/scene/entities — add/remove/update
  router.post("/api/scene/entities", (req, res) => {
    const body = req.body as Record<string, unknown>;
    const action = (body["action"] as string) ?? "add";
    const data = (body["data"] as Record<string, unknown>) ?? body;
    executeCommand({ action, type: "entity", data });
    res.json({ ok: true, commandId: crypto.randomUUID() });
  });

  // POST /api/choreographies — add/remove/update
  router.post("/api/choreographies", (req, res) => {
    const body = req.body as Record<string, unknown>;
    const action = (body["action"] as string) ?? "add";
    const data = (body["data"] as Record<string, unknown>) ?? body;
    executeCommand({ action, type: "choreography", data });
    res.json({ ok: true, commandId: crypto.randomUUID() });
  });

  // POST /api/bindings — add/remove
  router.post("/api/bindings", (req, res) => {
    const body = req.body as Record<string, unknown>;
    const action = (body["action"] as string) ?? "add";
    const data = (body["data"] as Record<string, unknown>) ?? body;
    executeCommand({ action, type: "binding", data });
    res.json({ ok: true, commandId: crypto.randomUUID() });
  });

  // POST /api/wiring — add/remove
  router.post("/api/wiring", (req, res) => {
    const body = req.body as Record<string, unknown>;
    const action = (body["action"] as string) ?? "add";
    const data = (body["data"] as Record<string, unknown>) ?? body;
    executeCommand({ action, type: "wire", data });
    res.json({ ok: true, commandId: crypto.randomUUID() });
  });

  // POST /api/signals/sources — add/remove
  router.post("/api/signals/sources", (req, res) => {
    const body = req.body as Record<string, unknown>;
    const action = (body["action"] as string) ?? "add";
    const data = (body["data"] as Record<string, unknown>) ?? body;
    executeCommand({ action, type: "source", data });
    res.json({ ok: true, commandId: crypto.randomUUID() });
  });

  // POST /api/shaders — add
  router.post("/api/shaders", (req, res) => {
    const body = req.body as Record<string, unknown>;
    executeCommand({ action: "add", type: "shader", data: body });
    res.json({ ok: true, commandId: crypto.randomUUID() });
  });

  // PUT /api/shaders/:id — update
  router.put("/api/shaders/:id", (req, res) => {
    const body = req.body as Record<string, unknown>;
    executeCommand({ action: "update", type: "shader", data: { ...body, id: req.params["id"] } });
    res.json({ ok: true, commandId: crypto.randomUUID() });
  });

  // DELETE /api/shaders/:id — remove
  router.delete("/api/shaders/:id", (req, res) => {
    executeCommand({ action: "remove", type: "shader", data: { id: req.params["id"] } });
    res.json({ ok: true, commandId: crypto.randomUUID() });
  });

  // POST /api/shaders/:id/uniforms — set-uniform
  router.post("/api/shaders/:id/uniforms", (req, res) => {
    const body = req.body as Record<string, unknown>;
    executeCommand({ action: "set-uniform", type: "shader", data: { ...body, id: req.params["id"] } });
    res.json({ ok: true, commandId: crypto.randomUUID() });
  });

  // POST /api/p5 — add
  router.post("/api/p5", (req, res) => {
    const body = req.body as Record<string, unknown>;
    executeCommand({ action: "add", type: "p5", data: body });
    res.json({ ok: true, commandId: crypto.randomUUID() });
  });

  // PUT /api/p5/:id — update
  router.put("/api/p5/:id", (req, res) => {
    const body = req.body as Record<string, unknown>;
    executeCommand({ action: "update", type: "p5", data: { ...body, id: req.params["id"] } });
    res.json({ ok: true, commandId: crypto.randomUUID() });
  });

  // DELETE /api/p5/:id — remove
  router.delete("/api/p5/:id", (req, res) => {
    executeCommand({ action: "remove", type: "p5", data: { id: req.params["id"] } });
    res.json({ ok: true, commandId: crypto.randomUUID() });
  });

  // POST /api/p5/:id/params — set-param
  router.post("/api/p5/:id/params", (req, res) => {
    const body = req.body as Record<string, unknown>;
    executeCommand({ action: "set-param", type: "p5", data: { ...body, id: req.params["id"] } });
    res.json({ ok: true, commandId: crypto.randomUUID() });
  });

  // -----------------------------------------------------------------------
  // SSE for browser command streaming (backwards compat)
  // -----------------------------------------------------------------------

  router.get("/__commands__/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write(": connected\n\n");

    commandClients.add(res);
    req.on("close", () => {
      commandClients.delete(res);
    });
  });

  // GET /api/commands/pending — polling fallback (empty, mutations are instant)
  router.get("/api/commands/pending", (_req, res) => {
    res.json({ ok: true, commands: [] });
  });

  // POST /api/commands/ack — no-op (mutations are instant)
  router.post("/api/commands/ack", (_req, res) => {
    res.json({ ok: true, pruned: 0 });
  });

  // GET /api/state/full — returns full state (for browser init)
  router.get("/api/state/full", (_req, res) => {
    res.json({
      ok: true,
      lastPushAt: getLastMutationAt(),
      data: getFullState(),
    });
  });

  return router;
}
