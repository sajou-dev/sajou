/**
 * WebSocket server that broadcasts scenario signals to connected clients.
 *
 * Supports runtime scenario switching: clients can send a JSON command
 * `{ "command": "switch", "scenario": "<name>" }` to change the active scenario.
 *
 * Usage:
 * ```ts
 * const server = createEmitterServer({
 *   port: 9100,
 *   scenario: simpleTask,
 *   scenarios: SCENARIOS,
 *   loop: true,
 * });
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
  /** The initial scenario to play. */
  readonly scenario: Scenario;
  /** All available scenarios, indexed by name. Enables runtime switching. */
  readonly scenarios?: ReadonlyMap<string, Scenario>;
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

/** A control message sent by clients to the emitter server. */
interface ClientCommand {
  readonly command: string;
  readonly scenario?: string;
}

/**
 * Creates and starts a WebSocket server that broadcasts scenario signals.
 *
 * All connected clients receive every signal as a JSON string.
 * The scenario starts immediately and optionally loops.
 *
 * Clients can send `{ "command": "switch", "scenario": "<name>" }` to
 * switch the active scenario at runtime.
 */
export function createEmitterServer(
  options: EmitterServerOptions,
): EmitterServer {
  const port = options.port ?? 9100;
  const scenarioMap = options.scenarios;

  const wss = new WebSocketServer({ port });
  const clients = new Set<WebSocket>();

  const runnerOptions: RunnerOptions = {
    loop: options.loop ?? true,
    loopGapMs: options.loopGapMs,
    speed: options.speed,
  };

  const broadcast = (signal: SignalEvent): void => {
    const data = JSON.stringify(signal);
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }
    options.onSignal?.(signal);
  };

  /** Broadcast a meta-message (not a signal) to all clients. */
  const broadcastMeta = (meta: Record<string, unknown>): void => {
    const data = JSON.stringify(meta);
    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(data);
      }
    }
  };

  let activeRunner: RunnerHandle = runScenario(
    options.scenario,
    broadcast,
    runnerOptions,
  );

  const switchScenario = (name: string): void => {
    if (!scenarioMap) return;
    const next = scenarioMap.get(name);
    if (!next) return;

    activeRunner.stop();
    broadcastMeta({ meta: "scenario_switched", scenario: name });
    activeRunner = runScenario(next, broadcast, runnerOptions);
  };

  wss.on("connection", (ws) => {
    clients.add(ws);

    // Send available scenarios on connect
    if (scenarioMap) {
      const names = [...scenarioMap.keys()];
      ws.send(JSON.stringify({ meta: "scenarios", available: names }));
    }

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as ClientCommand;
        if (msg.command === "switch" && msg.scenario) {
          switchScenario(msg.scenario);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  const close = (): void => {
    activeRunner.stop();
    for (const client of clients) {
      client.close();
    }
    clients.clear();
    wss.close();
  };

  return { close, port };
}
