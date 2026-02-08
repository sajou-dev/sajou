/**
 * Sajou Dev Playground — live visual playground with theme switching.
 *
 * Connects to the emitter WebSocket server on port 9100,
 * receives signals, and pipes them through the choreographer to PixiJS.
 * Features: theme switching (Citadel / Office), scenario switching,
 * combat log, gold/lumber resource counters.
 */

import { Application, Graphics, Text, TextStyle } from "pixi.js";
import {
  Choreographer,
  BrowserClock,
} from "@sajou/core";
import type { PerformanceSignal, ChoreographyDefinition } from "@sajou/core";
import type { SignalEnvelope, SignalType, EntityVisualConfig } from "@sajou/schema";
import type { ThemeManifest } from "@sajou/theme-api";
import {
  citadelManifest,
  citadelChoreographies,
  citadelEntityVisuals,
  PixiCommandSink as CitadelPixiCommandSink,
} from "@sajou/theme-citadel";
import {
  officeManifest,
  officeChoreographies,
  officeEntityVisuals,
  PixiCommandSink as OfficePixiCommandSink,
} from "@sajou/theme-office";

// ---------------------------------------------------------------------------
// Theme configuration
// ---------------------------------------------------------------------------

interface ThemeConfig {
  readonly id: string;
  readonly name: string;
  readonly manifest: ThemeManifest;
  readonly entityVisuals: EntityVisualConfig;
  readonly choreographies: readonly ChoreographyDefinition[];
  readonly assetBasePath: string;
  readonly bgColor: number;
  /** Entity + position pairs to pre-spawn when the scene loads. */
  readonly preSpawns: readonly { entity: string; position: string }[];
}

const THEMES: readonly ThemeConfig[] = [
  {
    id: "citadel",
    name: "Citadel",
    manifest: citadelManifest,
    entityVisuals: citadelEntityVisuals,
    choreographies: citadelChoreographies,
    assetBasePath: "/citadel-assets/",
    bgColor: 0x3a7a2a,
    preSpawns: [
      { entity: "oracle", position: "oracle" },
      { entity: "forge", position: "forgeLeft" },
      { entity: "peon", position: "spawnPoint" },
    ],
  },
  {
    id: "office",
    name: "Office",
    manifest: officeManifest,
    entityVisuals: officeEntityVisuals,
    choreographies: officeChoreographies,
    assetBasePath: "/office-assets/",
    bgColor: 0x8899aa,
    preSpawns: [
      { entity: "manager-desk", position: "managerDesk" },
      { entity: "server-rack", position: "serverLeft" },
      { entity: "worker", position: "entrance" },
    ],
  },
];

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
// System log (small debug log at the bottom)
// ---------------------------------------------------------------------------

const logEl = document.getElementById("log")!;

function log(msg: string): void {
  const line = document.createElement("div");
  line.textContent = `[${new Date().toISOString().slice(11, 23)}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------------------------------------------------------------------------
// Combat log (rich signal log panel)
// ---------------------------------------------------------------------------

const combatLogEl = document.getElementById("combat-log")!;
const MAX_COMBAT_LOG_ENTRIES = 100;
let combatLogCount = 0;

/** Format a signal type for display. */
function formatSignalType(type: string): string {
  return type.replace(/_/g, " ");
}

/** Extract a short description from a signal payload. */
function getSignalDetail(signal: SignalEnvelope<SignalType>): string {
  const p = signal.payload as Record<string, unknown>;
  switch (signal.type) {
    case "task_dispatch":
      return `${String(p["from"] ?? "?")} -> ${String(p["to"] ?? "?")}`;
    case "tool_call":
      return String(p["toolName"] ?? "");
    case "tool_result":
      return `${String(p["toolName"] ?? "")} ${p["success"] ? "OK" : "FAIL"}`;
    case "token_usage":
      return `P:${String(p["promptTokens"] ?? 0)} C:${String(p["completionTokens"] ?? 0)}`;
    case "agent_state_change":
      return `${String(p["from"] ?? "?")} -> ${String(p["to"] ?? "?")}`;
    case "error":
      return String(p["message"] ?? "");
    case "completion":
      return p["success"] ? "success" : "failed";
    default:
      return "";
  }
}

/** Add a signal entry to the combat log. */
function combatLogEntry(signal: SignalEnvelope<SignalType>): void {
  const entry = document.createElement("div");
  entry.className = "log-entry";

  const time = new Date(signal.timestamp).toISOString().slice(11, 19);
  const detail = getSignalDetail(signal);

  entry.innerHTML =
    `<span class="log-time">${time}</span> ` +
    `<span class="log-type log-type-${signal.type}">${formatSignalType(signal.type)}</span>` +
    (detail ? ` <span class="log-detail">${detail}</span>` : "") +
    (signal.source ? ` <span class="log-source">[${signal.source}]</span>` : "");

  combatLogEl.appendChild(entry);
  combatLogCount++;

  // Trim old entries
  if (combatLogCount > MAX_COMBAT_LOG_ENTRIES) {
    const firstEntry = combatLogEl.querySelector(".log-entry");
    if (firstEntry) {
      combatLogEl.removeChild(firstEntry);
      combatLogCount--;
    }
  }

  combatLogEl.scrollTop = combatLogEl.scrollHeight;
}

// ---------------------------------------------------------------------------
// Resource counters (gold = prompt tokens, lumber = completion tokens)
// ---------------------------------------------------------------------------

const goldEl = document.getElementById("gold-count")!;
const lumberEl = document.getElementById("lumber-count")!;
let totalGold = 0;
let totalLumber = 0;

/** Update resource counters from a token_usage signal. */
function updateResources(signal: SignalEnvelope<SignalType>): void {
  if (signal.type !== "token_usage") return;
  const p = signal.payload as Record<string, unknown>;
  const prompt = typeof p["promptTokens"] === "number" ? p["promptTokens"] : 0;
  const completion = typeof p["completionTokens"] === "number" ? p["completionTokens"] : 0;
  totalGold += prompt;
  totalLumber += completion;
  goldEl.textContent = totalGold.toLocaleString();
  lumberEl.textContent = totalLumber.toLocaleString();
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
// Theme selector buttons
// ---------------------------------------------------------------------------

function createThemeButtons(
  container: HTMLElement,
  onSwitch: (theme: ThemeConfig) => void,
): Map<string, HTMLButtonElement> {
  const buttons = new Map<string, HTMLButtonElement>();
  for (const theme of THEMES) {
    const btn = document.createElement("button");
    btn.textContent = theme.name;
    btn.className = "theme-btn";
    btn.addEventListener("click", () => onSwitch(theme));
    container.appendChild(btn);
    buttons.set(theme.id, btn);
  }
  return buttons;
}

// ---------------------------------------------------------------------------
// Scene initialization for a theme
// ---------------------------------------------------------------------------

interface ActiveScene {
  readonly app: Application;
  readonly choreographer: Choreographer;
  readonly themeConfig: ThemeConfig;
}

async function initScene(themeConfig: ThemeConfig): Promise<ActiveScene> {
  const app = new Application();
  await app.init({
    width: themeConfig.manifest.layout.sceneWidth,
    height: themeConfig.manifest.layout.sceneHeight,
    background: themeConfig.bgColor,
    antialias: true,
  });

  // Draw layout position markers
  const labelStyle = new TextStyle({
    fontFamily: "monospace",
    fontSize: 10,
    fill: 0x5a8a5a,
  });

  for (const [name, pos] of Object.entries(themeConfig.manifest.layout.positions)) {
    const marker = new Graphics();
    marker.circle(0, 0, 4);
    marker.fill(0x3a6a3a);
    marker.position.set(pos.x, pos.y);
    app.stage.addChild(marker);

    const label = new Text({ text: name, style: labelStyle });
    label.position.set(pos.x + 8, pos.y - 6);
    app.stage.addChild(label);
  }

  // Create the PixiJS command sink based on theme
  let sink: import("@sajou/core").CommandSink;

  if (themeConfig.id === "office") {
    const officeSink = new OfficePixiCommandSink({
      app,
      manifest: themeConfig.manifest,
      entityVisuals: themeConfig.entityVisuals,
    });
    log("Loading Office sprite assets...");
    await officeSink.init(themeConfig.assetBasePath);
    log("Office assets loaded.");

    // Pre-spawn static entities
    for (const { entity, position } of themeConfig.preSpawns) {
      officeSink.preSpawn(entity, position);
    }
    sink = officeSink;
  } else {
    const citadelSink = new CitadelPixiCommandSink({
      app,
      manifest: themeConfig.manifest,
      entityVisuals: themeConfig.entityVisuals,
    });
    log("Loading Citadel sprite assets...");
    await citadelSink.init(themeConfig.assetBasePath);
    log("Citadel assets loaded.");

    // Pre-spawn static entities
    for (const { entity, position } of themeConfig.preSpawns) {
      citadelSink.preSpawn(entity, position);
    }
    sink = citadelSink;
  }

  // Create BrowserClock + Choreographer
  const clock = new BrowserClock();
  const choreographer = new Choreographer({ clock, sink });

  // Register choreographies
  for (const choreo of themeConfig.choreographies) {
    choreographer.register(choreo);
  }

  log(`Registered ${String(themeConfig.choreographies.length)} choreographies for ${themeConfig.name}.`);

  return { app, choreographer, themeConfig };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("Initializing Sajou Dev Playground...");

  const appEl = document.getElementById("app")!;
  const themeSelectorEl = document.getElementById("theme-selector")!;
  const btnContainer = document.getElementById("scenario-buttons")!;

  // Track active scene
  let activeScene: ActiveScene | null = null;
  let ws: WebSocket | null = null;

  // Theme switching
  const switchTheme = async (themeConfig: ThemeConfig): Promise<void> => {
    log(`Switching to theme: ${themeConfig.name}...`);

    // Tear down old scene
    if (activeScene) {
      activeScene.choreographer.dispose();
      appEl.innerHTML = "";
      activeScene.app.destroy(true);
      activeScene = null;
    }

    // Initialize new scene
    activeScene = await initScene(themeConfig);
    appEl.appendChild(activeScene.app.canvas);
    setActiveButton(themeButtons, themeConfig.id);

    log(`Theme ${themeConfig.name} ready.`);
  };

  const themeButtons = createThemeButtons(themeSelectorEl, (theme) => {
    switchTheme(theme).catch((err) => log(`Theme switch error: ${String(err)}`));
  });

  // Scenario switching
  const switchScenario = (name: string): void => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ command: "switch", scenario: name }));
      log(`Switching to scenario: ${name}`);
      setActiveButton(scenarioButtons, name);
    }
  };

  const scenarioButtons = createScenarioButtons(btnContainer, switchScenario);
  setActiveButton(scenarioButtons, "simple-task");

  // Handle incoming signal: combat log + resources + choreographer
  const handleSignal = (signal: SignalEnvelope<SignalType>): void => {
    combatLogEntry(signal);
    updateResources(signal);
    if (activeScene) {
      activeScene.choreographer.handleSignal(
        toPerformanceSignal(signal),
        signal.correlationId,
      );
    }
  };

  // Connect to the emitter server via WebSocket
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
          handleSignal(msg);
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

  // Start with Citadel theme (default)
  await switchTheme(THEMES[0]!);
  connect();
}

main().catch((err) => {
  console.error("Sajou dev playground failed:", err);
  log(`ERROR: ${String(err)}`);
});
