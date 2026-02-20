/**
 * Middleware entry point — for CJS bundle used by botoul.
 *
 * Exports `createMcpRouter()` without starting any server.
 * This is the entry point for esbuild when building the botoul bundle.
 *
 * Usage:
 * ```js
 * const { createMcpRouter } = require('./lib/sajou-mcp.cjs');
 * app.use('/mcp', createMcpRouter());
 * ```
 */

export { createMcpRouter } from "./app.js";
