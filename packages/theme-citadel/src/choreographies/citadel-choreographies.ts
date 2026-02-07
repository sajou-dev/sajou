/**
 * Citadel theme choreographies — declarative action sequences
 * triggered by signal types.
 *
 * These choreographies use Citadel entities (peon, pigeon, forge,
 * oracle, explosion, gold-coins) and signal.* references to resolve
 * runtime data from the signal payload.
 *
 * The manifesto's example:
 *   task_dispatch → peon walks to forge, pigeon flies to oracle,
 *                   on arrive destroy pigeon + gold flash
 *   error → explosion spawns, red flash, explosion sound
 */

import type { ChoreographyDefinition } from "@sajou/core";

/**
 * task_dispatch: A peon walks to the target, a pigeon carries the
 * message from the source, and flashes gold on arrival.
 *
 * Sequence: move → spawn → fly → onArrive(destroy → flash)
 */
export const taskDispatchChoreography: ChoreographyDefinition = {
  on: "task_dispatch",
  steps: [
    {
      action: "move",
      entity: "peon",
      to: "signal.to",
      duration: 800,
      easing: "easeInOut",
    },
    {
      action: "spawn",
      entity: "pigeon",
      at: "signal.from",
    },
    {
      action: "fly",
      entity: "pigeon",
      to: "signal.to",
      duration: 1200,
      easing: "arc",
    },
    {
      action: "onArrive",
      steps: [
        { action: "destroy", entity: "pigeon" },
        {
          action: "flash",
          target: "signal.to",
          color: "#ffd700",
          duration: 300,
        },
      ],
    },
  ],
};

/**
 * error: Explosion spawns at the agent's position, red flash,
 * explosion sound. Interrupts any active choreographies on the
 * same correlationId.
 *
 * Sequence: spawn(explosion) → flash(red) → playSound
 */
export const errorChoreography: ChoreographyDefinition = {
  on: "error",
  interrupts: true,
  steps: [
    {
      action: "spawn",
      entity: "explosion",
      at: "signal.agentId",
    },
    {
      action: "flash",
      target: "signal.agentId",
      color: "#ff3300",
      duration: 400,
    },
    {
      action: "playSound",
      entity: "explosion",
      sound: "sfx/explosion.ogg",
    },
  ],
};

/**
 * tool_call: The forge building lights up when an agent invokes a tool.
 *
 * Sequence: flash(forge, blue)
 */
export const toolCallChoreography: ChoreographyDefinition = {
  on: "tool_call",
  steps: [
    {
      action: "flash",
      target: "forge",
      color: "#4488ff",
      duration: 600,
    },
  ],
};

/**
 * token_usage: Gold coins rain at the gold pile.
 *
 * Sequence: spawn(gold-coins) → wait → destroy(gold-coins)
 */
export const tokenUsageChoreography: ChoreographyDefinition = {
  on: "token_usage",
  steps: [
    {
      action: "spawn",
      entity: "gold-coins",
      at: "goldPile",
    },
    {
      action: "playSound",
      entity: "gold-coins",
      sound: "sfx/coins-clink.ogg",
    },
    {
      action: "wait",
      duration: 1200,
    },
    {
      action: "destroy",
      entity: "gold-coins",
    },
  ],
};

/** All Citadel choreographies, ready to register with a Choreographer. */
export const citadelChoreographies: readonly ChoreographyDefinition[] = [
  taskDispatchChoreography,
  errorChoreography,
  toolCallChoreography,
  tokenUsageChoreography,
];
