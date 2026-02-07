/**
 * CLI entry point for the emitter server.
 *
 * Usage:
 *   pnpm --filter @sajou/emitter start                    # default: simple-task, loop, port 9100
 *   pnpm --filter @sajou/emitter start -- --scenario error-recovery --speed 2
 *   pnpm --filter @sajou/emitter start -- --port 9200 --no-loop
 */

import { createEmitterServer } from "./emitter-server.js";
import { SCENARIOS } from "./scenarios/index.js";
import type { SignalEvent } from "@sajou/schema";

function parseArgs(argv: readonly string[]): {
  scenario: string;
  port: number;
  loop: boolean;
  speed: number;
} {
  const args = argv.slice(2);
  let scenario = "simple-task";
  let port = 9100;
  let loop = true;
  let speed = 1;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--scenario" && next) {
      scenario = next;
      i++;
    } else if (arg === "--port" && next) {
      port = parseInt(next, 10);
      i++;
    } else if (arg === "--speed" && next) {
      speed = parseFloat(next);
      i++;
    } else if (arg === "--no-loop") {
      loop = false;
    }
  }

  return { scenario, port, loop, speed };
}

const config = parseArgs(process.argv);
const scenario = SCENARIOS.get(config.scenario);

if (!scenario) {
  const available = [...SCENARIOS.keys()].join(", ");
  console.error(`Unknown scenario: "${config.scenario}". Available: ${available}`);
  process.exit(1);
}

const formatSignal = (signal: SignalEvent): string => {
  const time = new Date(signal.timestamp).toISOString().slice(11, 23);
  return `[${time}] ${signal.type}`;
};

const server = createEmitterServer({
  port: config.port,
  scenario,
  scenarios: SCENARIOS,
  loop: config.loop,
  speed: config.speed,
  onSignal: (signal) => {
    console.log(formatSignal(signal));
  },
});

console.log(`Sajou Emitter started`);
console.log(`  scenario: ${scenario.name} (${scenario.steps.length} steps)`);
console.log(`  port:     ws://localhost:${server.port}`);
console.log(`  loop:     ${config.loop}`);
console.log(`  speed:    ${config.speed}x`);
console.log(``);

process.on("SIGINT", () => {
  console.log("\nShutting down...");
  server.close();
  process.exit(0);
});
