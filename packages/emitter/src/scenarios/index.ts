/**
 * Predefined signal scenarios for testing and development.
 */

export type { Scenario, ScenarioStep } from "./types.js";
export { simpleTask } from "./simple-task.js";
export { errorRecovery } from "./error-recovery.js";
export { multiAgent } from "./multi-agent.js";

import type { Scenario } from "./types.js";
import { simpleTask } from "./simple-task.js";
import { errorRecovery } from "./error-recovery.js";
import { multiAgent } from "./multi-agent.js";

/** All available scenarios, indexed by name. */
export const SCENARIOS: ReadonlyMap<string, Scenario> = new Map([
  [simpleTask.name, simpleTask],
  [errorRecovery.name, errorRecovery],
  [multiAgent.name, multiAgent],
]);
