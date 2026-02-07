/**
 * Sajou Dev Playground — first visual sign of life.
 *
 * Wires together: emitter (signals) → choreographer (sequences) → PixiJS (pixels).
 * Runs the simple-task scenario on loop with colored rectangles as placeholders.
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
import { simpleTask, runScenario } from "@sajou/emitter";

// ---------------------------------------------------------------------------
// Signal bridge (same as integration test)
// ---------------------------------------------------------------------------

/** Convert an emitter SignalEnvelope to the PerformanceSignal expected by the choreographer. */
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
    // Small circle marker
    const marker = new Graphics();
    marker.circle(0, 0, 4);
    marker.fill(0x3a6a3a);
    marker.position.set(pos.x, pos.y);
    app.stage.addChild(marker);

    // Label
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
  log("Running simple-task scenario (loop mode, 1x speed)...");

  // 7. Run the simple-task scenario
  runScenario(
    simpleTask,
    (signal) => {
      log(`Signal: ${signal.type} ${signal.correlationId ?? ""}`);
      choreographer.handleSignal(
        toPerformanceSignal(signal),
        signal.correlationId,
      );
    },
    { loop: true, speed: 1, loopGapMs: 3000 },
  );
}

main().catch((err) => {
  console.error("Sajou dev playground failed:", err);
  log(`ERROR: ${String(err)}`);
});
