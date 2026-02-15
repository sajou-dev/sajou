/**
 * @sajou/tap — One-click local agent connection.
 *
 * Translates agent activity into sajou signals and pushes them
 * to a scene-builder endpoint via HTTP or WebSocket.
 *
 * @packageDocumentation
 */

// Signal factory
export { createTapSignal } from "./signal/signal-factory.js";

// Transport
export type { TapTransport } from "./client/transport.js";
export { HttpTransport } from "./client/http-client.js";
export type { HttpTransportOptions } from "./client/http-client.js";
export { WsTransport } from "./client/ws-client.js";
export type { WsTransportOptions } from "./client/ws-client.js";
export { createTransport } from "./client/create-transport.js";

// Adapters
export type { TapAdapter } from "./adapters/types.js";
export { ClaudeCodeAdapter } from "./adapters/claude-code/claude-code-adapter.js";
export type { ClaudeCodeAdapterOptions } from "./adapters/claude-code/claude-code-adapter.js";
export { JsonlAdapter } from "./adapters/jsonl/jsonl-adapter.js";
export type { JsonlAdapterOptions } from "./adapters/jsonl/jsonl-adapter.js";
export { RawAdapter } from "./adapters/raw/raw-adapter.js";
export type { RawAdapterOptions } from "./adapters/raw/raw-adapter.js";

// SDK middleware
export { createTapMiddleware } from "./adapters/agent-sdk/sdk-middleware.js";
export type { TapMiddleware, TapMiddlewareOptions } from "./adapters/agent-sdk/sdk-middleware.js";

// Hook mapping (useful for custom integrations)
export { mapHookToSignal } from "./emit-cli.js";
