/**
 * Transport factory — picks the right transport based on the endpoint URL scheme.
 *
 * `ws://` or `wss://` → WsTransport
 * `http://` or `https://` (or no scheme) → HttpTransport
 */

import { HttpTransport } from "./http-client.js";
import { WsTransport } from "./ws-client.js";
import type { TapTransport } from "./transport.js";

/**
 * Creates the appropriate transport for the given endpoint URL.
 *
 * @param endpoint - The target URL. Defaults to the scene-builder HTTP endpoint.
 * @returns A TapTransport instance (not yet connected)
 */
export function createTransport(endpoint?: string): TapTransport {
  if (endpoint && (endpoint.startsWith("ws://") || endpoint.startsWith("wss://"))) {
    return new WsTransport({ endpoint });
  }
  return new HttpTransport({ endpoint: endpoint });
}
