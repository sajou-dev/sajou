/**
 * WebSocket server that broadcasts scenario signals to connected clients.
 *
 * Usage:
 * ```ts
 * const server = createEmitterServer({ port: 9100, scenario: simpleTask, loop: true });
 * // later:
 * server.close();
 * ```
 */

import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import type { SignalEvent } from "@sajou/schema";
import type { Scenario } from "./scenarios/types.js";
import { runScenario } from "./scenario-runner.js";
import type { RunnerHandle, RunnerOptions } from "./scenario-runner.js";

/** Options for creating the emitter server. */
export interface EmitterServerOptions {
  /** WebSocket server port. Defaults to 9100. */
  readonly port?: number;
  /** The scenario to play. */
  readonly scenario: Scenario;
  /** If true, loop the scenario. Defaults to true. */
  readonly loop?: boolean;
  /** Gap between loop iterations in ms. Defaults to 3000. */
  readonly loopGapMs?: number;
  /** Playback speed multiplier. Defaults to 1. */
  readonly speed?: number;
  /** Called when a signal is emitted. For logging. */
  readonly onSignal?: (signal: SignalEvent) => void;
}

/** Handle to the running emitter server. */
export interface EmitterServer {
  /** Stops the server and scenario playback. */
  close: () => void;
  /** The port the server is listening on. */
  readonly port: number;
}

/**
 * Creates and starts a WebSocket server that broadcasts scenario signals.
 *
 * All connected clients receive every signal as a JSON string.
 * The scenario starts immediately and optionally loops.
 */
export function createEmitterServer(
  options: EmitterServerOptions,
): EmitterServer {
  const port = options.port ?? 9100;

  const wss = new WebSocketServer({ port });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  const broadcast = (signal: SignalEvent): void => {
    const data = JSON.stringify(signal);
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }
    options.onSignal?.(signal);
  };

  const runnerOptions: RunnerOptions = {
    loop: options.loop ?? true,
    loopGapMs: options.loopGapMs,
    speed: options.speed,
  };

  const runner: RunnerHandle = runScenario(
    options.scenario,
    broadcast,
    runnerOptions,
  );

  const close = (): void => {
    runner.stop();
    for (const client of clients) {
      client.close();
    }
    clients.clear();
    wss.close();
  };

  return { close, port };
}
