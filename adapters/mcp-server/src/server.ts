/**
 * MCP server setup — creates the McpServer instance and registers all tools.
 *
 * Each tool is a separate module in `./tools/`. This file wires them together
 * into a single MCP server that AI agents can interact with.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import * as emitSignalTool from "./tools/emit-signal.js";
import * as getSceneStateTool from "./tools/get-scene-state.js";
import * as getChoreographiesTool from "./tools/get-choreographies.js";
import * as listThemesTool from "./tools/list-themes.js";
import * as getCatalogTool from "./tools/get-catalog.js";
import * as mapSignalsTool from "./tools/map-signals.js";
import * as describeSceneTool from "./tools/describe-scene.js";

/**
 * Create and configure the sajou MCP server with all tools registered.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "sajou",
    version: "0.0.0",
  });

  // Register all tools
  server.registerTool(
    emitSignalTool.name,
    {
      description: emitSignalTool.description,
      inputSchema: emitSignalTool.inputSchema,
    },
    emitSignalTool.handler,
  );

  server.registerTool(
    getSceneStateTool.name,
    {
      description: getSceneStateTool.description,
      inputSchema: getSceneStateTool.inputSchema,
    },
    getSceneStateTool.handler,
  );

  server.registerTool(
    getChoreographiesTool.name,
    {
      description: getChoreographiesTool.description,
      inputSchema: getChoreographiesTool.inputSchema,
    },
    getChoreographiesTool.handler,
  );

  server.registerTool(
    listThemesTool.name,
    {
      description: listThemesTool.description,
      inputSchema: listThemesTool.inputSchema,
    },
    listThemesTool.handler,
  );

  server.registerTool(
    getCatalogTool.name,
    {
      description: getCatalogTool.description,
      inputSchema: getCatalogTool.inputSchema,
    },
    getCatalogTool.handler,
  );

  server.registerTool(
    mapSignalsTool.name,
    {
      description: mapSignalsTool.description,
      inputSchema: mapSignalsTool.inputSchema,
    },
    mapSignalsTool.handler,
  );

  server.registerTool(
    describeSceneTool.name,
    {
      description: describeSceneTool.description,
      inputSchema: describeSceneTool.inputSchema,
    },
    describeSceneTool.handler,
  );

  return server;
}
