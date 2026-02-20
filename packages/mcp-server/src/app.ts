/**
 * Express application — mounts all route modules.
 *
 * This is the HTTP server for the sajou state server. It provides:
 * - REST API for scene state (read/write)
 * - SSE streams for real-time updates
 * - Signal ingestion endpoint
 * - Local service discovery
 * - CORS proxy for browser clients
 * - Tap hook management
 *
 * Used both as a standalone server (--http flag) and as Express middleware
 * for the botoul deployment (createMcpRouter export).
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createSceneRoutes } from "./routes/scene.js";
import { createSignalRoutes } from "./routes/signals.js";
import { createDiscoveryRoutes } from "./routes/discovery.js";
import { createTapRoutes } from "./routes/tap.js";
import { createProxyRoutes } from "./routes/proxy.js";
import { mountMcpTransport } from "./mcp/transport.js";
import { createServer } from "./server.js";

/** Simple CORS middleware — allows all origins (dev-friendly). */
function corsMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (_req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

/** Create the Express app with all routes mounted. */
export function createApp(): express.Express {
  const app = express();

  // Global middleware
  app.use(corsMiddleware);
  app.use(express.json({ limit: "10mb" }));

  // Mount all route modules
  app.use(createSceneRoutes());
  app.use(createSignalRoutes());
  app.use(createDiscoveryRoutes());
  app.use(createTapRoutes());
  app.use(createProxyRoutes());

  return app;
}

/**
 * Create an Express Router for use as middleware (botoul deployment).
 *
 * Mounts REST routes + MCP Streamable HTTP transport on the router root.
 * When the parent app mounts this on `/mcp`, MCP requests go to `/mcp/`
 * and REST API to `/mcp/api/*`.
 *
 * Usage in botoul's index.js:
 * ```js
 * const { createMcpRouter } = require('./lib/sajou-server.cjs');
 * app.use('/mcp', createMcpRouter());
 * ```
 */
export function createMcpRouter(): express.Router {
  const router = express.Router();

  router.use(corsMiddleware);
  router.use(express.json({ limit: "10mb" }));

  // REST API routes
  router.use(createSceneRoutes());
  router.use(createSignalRoutes());
  router.use(createDiscoveryRoutes());
  router.use(createTapRoutes());
  router.use(createProxyRoutes());

  // MCP Streamable HTTP — mounted on "/" (router is already prefixed by parent)
  mountMcpTransport(router, createServer, "/");

  return router;
}
