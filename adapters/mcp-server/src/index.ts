#!/usr/bin/env node
/**
 * sajou server entry point — supports both stdio (MCP) and HTTP modes.
 *
 * Usage:
 *   node dist/index.js              → stdio transport (default, for Claude Code)
 *   node dist/index.js --http       → HTTP server on port 3000
 *   node dist/index.js --http 8080  → HTTP server on custom port
 *
 * In HTTP mode, the server provides:
 *   - REST API on /api/* (same endpoints as the old Vite dev server)
 *   - MCP Streamable HTTP on /mcp
 *   - SSE streams for real-time updates
 *
 * In stdio mode, the server behaves exactly as before — MCP JSON-RPC over stdin/stdout.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { createApp } from "./app.js";
import { mountMcpTransport } from "./mcp/transport.js";
import { cleanupTapHooks } from "./routes/tap.js";

/** Parse --http flag and optional port from argv. */
function parseArgs(): { mode: "stdio" | "http"; port: number } {
  const args = process.argv.slice(2);
  const httpIndex = args.indexOf("--http");

  if (httpIndex === -1) {
    return { mode: "stdio", port: 3000 };
  }

  const portArg = args[httpIndex + 1];
  const port = portArg && !portArg.startsWith("-") ? parseInt(portArg, 10) : 3000;
  return { mode: "http", port: isNaN(port) ? 3000 : port };
}

async function main(): Promise<void> {
  const { mode, port } = parseArgs();

  if (mode === "stdio") {
    // Classic stdio mode — MCP JSON-RPC over stdin/stdout
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write("[sajou] Server started (stdio mode)\n");
  } else {
    // HTTP mode — Express server with REST + MCP Streamable HTTP
    const app = createApp();
    mountMcpTransport(app, createServer);

    const httpServer = app.listen(port, () => {
      process.stderr.write(`[sajou] Server started on http://localhost:${port}\n`);
      process.stderr.write(`[sajou]   REST API: http://localhost:${port}/api/*\n`);
      process.stderr.write(`[sajou]   MCP:      http://localhost:${port}/mcp\n`);
    });

    // Cleanup on shutdown
    const shutdown = () => {
      cleanupTapHooks();
      httpServer.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[sajou] Fatal error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
