#!/usr/bin/env node
/**
 * sajou MCP server entry point — stdio transport.
 *
 * This is the main executable. It creates the MCP server, connects it
 * to a stdio transport, and starts listening for MCP messages from the
 * AI agent (Claude Code, Claude Desktop, etc.).
 *
 * Usage:
 *   npx sajou-mcp
 *   # or with custom dev server URL:
 *   SAJOU_DEV_SERVER=http://localhost:3000 npx sajou-mcp
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP JSON-RPC)
  process.stderr.write(
    `[sajou-mcp] Server started (dev server: ${process.env["SAJOU_DEV_SERVER"] ?? "http://localhost:5175"})\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[sajou-mcp] Fatal error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
