/**
 * MCP Streamable HTTP transport — mounts on /mcp for remote agents.
 *
 * Creates a per-session StreamableHTTPServerTransport and wires it
 * to the same McpServer instance used by stdio. Coexists with the
 * REST routes on the same Express app.
 */

import type { Express } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Active transports keyed by session ID. */
const transports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Mount the MCP Streamable HTTP endpoint on an Express app.
 *
 * Handles POST /mcp and GET /mcp (for SSE streaming).
 * Each new session creates a new transport connected to the same McpServer.
 */
export function mountMcpTransport(app: Express, serverFactory: () => McpServer): void {
  // Handle all MCP requests (POST for JSON-RPC, GET for SSE, DELETE for session close)
  app.all("/mcp", async (req, res) => {
    // Check for existing session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      // Existing session — delegate to its transport
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session or no session — create a new transport
    if (req.method === "POST") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
        }
      };

      // Create a new MCP server instance and connect it to this transport
      const server = serverFactory();
      await server.connect(transport);

      // Store the transport for future requests in this session
      if (transport.sessionId) {
        transports.set(transport.sessionId, transport);
      }

      // Handle the initial request
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // GET or DELETE without valid session
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "No valid session. Send a POST to initialize." },
      id: null,
    });
  });
}
