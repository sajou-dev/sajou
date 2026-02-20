/**
 * @sajou/emitter — Test signal emitter for Sajou.
 *
 * Provides predefined signal scenarios and a WebSocket server
 * that broadcasts them with realistic timings.
 */

export { createSignal, resetCounter } from "./signal-factory.js";
export { runScenario } from "./scenario-runner.js";
export type { RunnerOptions, RunnerHandle } from "./scenario-runner.js";
export { createEmitterServer } from "./emitter-server.js";
export type { EmitterServerOptions, EmitterServer } from "./emitter-server.js";
export { simpleTask, errorRecovery, multiAgent, SCENARIOS } from "./scenarios/index.js";
export type { Scenario, ScenarioStep } from "./scenarios/index.js";
