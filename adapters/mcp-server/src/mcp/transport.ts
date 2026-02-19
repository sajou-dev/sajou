/**
 * MCP Streamable HTTP transport — mounts on /mcp for remote agents.
 *
 * Creates a per-session StreamableHTTPServerTransport and wires it
 * to the same McpServer instance used by stdio. Coexists with the
 * REST routes on the same Express app.
 */

import type { Request, Response, Router } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Active transports keyed by session ID. */
const transports = new Map<string, StreamableHTTPServerTransport>();

/** Handler for MCP Streamable HTTP requests. */
async function mcpHandler(req: Request, res: Response, serverFactory: () => McpServer): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
    return;
  }

  if (req.method === "POST") {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };

    const server = serverFactory();
    await server.connect(transport);

    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }

    await transport.handleRequest(req, res, req.body);
    return;
  }

  res.status(400).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "No valid session. Send a POST to initialize." },
    id: null,
  });
}

/**
 * Mount the MCP Streamable HTTP endpoint on an Express router.
 *
 * @param router - Express Router (or app, which extends Router) to mount on
 * @param serverFactory - Factory that creates McpServer instances (one per session)
 * @param path - Route path to mount on (default "/mcp")
 */
export function mountMcpTransport(router: Router, serverFactory: () => McpServer, path = "/mcp"): void {
  router.all(path, (req: Request, res: Response) => {
    void mcpHandler(req, res, serverFactory);
  });
}
