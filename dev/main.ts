/**
 * Sajou Dev Playground — live visual playground.
 *
 * Connects to the emitter WebSocket server on port 9100,
 * receives signals, and pipes them through the choreographer to PixiJS.
 * Scenario buttons let you switch between scenarios at runtime.
 */

import { Application, Graphics, Text, TextStyle } from "pixi.js";
import {
  Choreographer,
  BrowserClock,
} from "@sajou/core";
import type { PerformanceSignal } from "@sajou/core";
import type { SignalEnvelope, SignalType } from "@sajou/schema";
import {
  citadelManifest,
  citadelChoreographies,
  PixiCommandSink,
} from "@sajou/theme-citadel";

// ---------------------------------------------------------------------------
// Signal bridge
// ---------------------------------------------------------------------------

/** Convert a parsed signal envelope to the PerformanceSignal expected by the choreographer. */
function toPerformanceSignal(signal: SignalEnvelope<SignalType>): PerformanceSignal {
  return {
    type: signal.type,
    payload: signal.payload as Readonly<Record<string, unknown>>,
  };
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const logEl = document.getElementById("log")!;

function log(msg: string): void {
  const line = document.createElement("div");
  line.textContent = `[${new Date().toISOString().slice(11, 23)}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------------------------------------------------------------------------
// WebSocket connection
// ---------------------------------------------------------------------------

const WS_URL = "ws://localhost:9100";

/** Meta-messages from the server (not signals). */
interface MetaMessage {
  readonly meta: string;
  readonly available?: readonly string[];
  readonly scenario?: string;
}

function isMetaMessage(msg: unknown): msg is MetaMessage {
  return typeof msg === "object" && msg !== null && "meta" in msg;
}

function isSignalEnvelope(msg: unknown): msg is SignalEnvelope<SignalType> {
  return typeof msg === "object" && msg !== null && "type" in msg && "payload" in msg && "id" in msg;
}

// ---------------------------------------------------------------------------
// Scenario buttons
// ---------------------------------------------------------------------------

const SCENARIOS = ["simple-task", "error-recovery", "multi-agent"];

function createScenarioButtons(
  container: HTMLElement,
  onSwitch: (name: string) => void,
): Map<string, HTMLButtonElement> {
  const buttons = new Map<string, HTMLButtonElement>();
  for (const name of SCENARIOS) {
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.className = "scenario-btn";
    btn.addEventListener("click", () => onSwitch(name));
    container.appendChild(btn);
    buttons.set(name, btn);
  }
  return buttons;
}

function setActiveButton(
  buttons: Map<string, HTMLButtonElement>,
  active: string,
): void {
  for (const [name, btn] of buttons) {
    btn.classList.toggle("active", name === active);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("Initializing PixiJS...");

  // 1. Create PixiJS Application
  const app = new Application();
  await app.init({
    width: citadelManifest.layout.sceneWidth,
    height: citadelManifest.layout.sceneHeight,
    background: 0x1a2e1a,
    antialias: true,
  });

  const appEl = document.getElementById("app");
  if (!appEl) throw new Error("Missing #app element");
  appEl.appendChild(app.canvas);

  log("PixiJS ready. Drawing scene layout...");

  // 2. Draw layout position markers
  const labelStyle = new TextStyle({
    fontFamily: "monospace",
    fontSize: 10,
    fill: 0x5a8a5a,
  });

  for (const [name, pos] of Object.entries(citadelManifest.layout.positions)) {
    const marker = new Graphics();
    marker.circle(0, 0, 4);
    marker.fill(0x3a6a3a);
    marker.position.set(pos.x, pos.y);
    app.stage.addChild(marker);

    const label = new Text({ text: name, style: labelStyle });
    label.position.set(pos.x + 8, pos.y - 6);
    app.stage.addChild(label);
  }

  // 3. Create the PixiJS command sink
  const sink = new PixiCommandSink(app, citadelManifest);

  // 4. Pre-spawn static entities
  sink.preSpawn("oracle", "oracle");
  sink.preSpawn("forge", "forgeLeft");
  sink.preSpawn("peon", "spawnPoint");

  log("Scene ready. Starting choreographer...");

  // 5. Create BrowserClock + Choreographer
  const clock = new BrowserClock();
  const choreographer = new Choreographer({ clock, sink });

  // 6. Register Citadel choreographies
  for (const choreo of citadelChoreographies) {
    choreographer.register(choreo);
  }

  log(`Registered ${citadelChoreographies.length} choreographies.`);

  // 7. Scenario selector buttons
  const btnContainer = document.getElementById("scenario-buttons")!;
  let ws: WebSocket | null = null;

  const switchScenario = (name: string): void => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ command: "switch", scenario: name }));
      log(`Switching to scenario: ${name}`);
      setActiveButton(buttons, name);
    }
  };

  const buttons = createScenarioButtons(btnContainer, switchScenario);
  setActiveButton(buttons, "simple-task");

  // 8. Connect to the emitter server via WebSocket
  const connect = (): void => {
    log(`Connecting to ${WS_URL}...`);
    ws = new WebSocket(WS_URL);

    ws.addEventListener("open", () => {
      log("WebSocket connected.");
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg: unknown = JSON.parse(String(event.data));

        if (isMetaMessage(msg)) {
          if (msg.meta === "scenarios") {
            log(`Server scenarios: ${(msg.available ?? []).join(", ")}`);
          } else if (msg.meta === "scenario_switched") {
            log(`Server switched to: ${msg.scenario ?? "unknown"}`);
          }
          return;
        }

        if (isSignalEnvelope(msg)) {
          log(`Signal: ${msg.type} ${msg.correlationId ?? ""}`);
          choreographer.handleSignal(
            toPerformanceSignal(msg),
            msg.correlationId,
          );
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.addEventListener("close", () => {
      log("WebSocket disconnected. Reconnecting in 2s...");
      setTimeout(connect, 2000);
    });

    ws.addEventListener("error", () => {
      // close event will fire after this, triggering reconnect
    });
  };

  connect();
}

main().catch((err) => {
  console.error("Sajou dev playground failed:", err);
  log(`ERROR: ${String(err)}`);
});
