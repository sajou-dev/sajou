/**
 * Office theme choreographies — declarative action sequences
 * triggered by signal types.
 *
 * These choreographies use Office entities (worker, email, server-rack,
 * manager-desk, invoice, crash) and signal.* references to resolve
 * runtime data from the signal payload.
 *
 * Office equivalents of Citadel:
 *   task_dispatch → manager assigns dossier, worker walks to server,
 *                   email flies from manager to server, flash on arrival
 *   tool_call     → server-rack screen lights up blue
 *   token_usage   → invoice spawns at accounts desk
 *   error         → crash spawns (blue screen), red flash
 */

import type { ChoreographyDefinition } from "@sajou/core";

/**
 * task_dispatch: Manager gives a dossier to the worker. Worker walks to
 * the target server. An email flies from the manager to the server.
 *
 * Sequence: move(worker) → spawn(email) → fly(email) → onArrive(destroy + flash)
 */
export const taskDispatchChoreography: ChoreographyDefinition = {
  on: "task_dispatch",
  steps: [
    {
      action: "move",
      entity: "worker",
      to: "signal.to",
      duration: 800,
      easing: "easeInOut",
    },
    {
      action: "spawn",
      entity: "email",
      at: "signal.from",
    },
    {
      action: "fly",
      entity: "email",
      to: "signal.to",
      duration: 1200,
      easing: "arc",
    },
    {
      action: "onArrive",
      steps: [
        { action: "destroy", entity: "email" },
        {
          action: "flash",
          target: "signal.to",
          color: "#2196f3",
          duration: 300,
        },
      ],
    },
  ],
};

/**
 * error: Screen crashes at the agent's position. Red flash
 * and error sound. Interrupts any active choreographies on the
 * same correlationId.
 *
 * Sequence: spawn(crash) → flash(red) → playSound
 */
export const errorChoreography: ChoreographyDefinition = {
  on: "error",
  interrupts: true,
  steps: [
    {
      action: "spawn",
      entity: "crash",
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
      entity: "crash",
      sound: "sfx/error-buzz.ogg",
    },
  ],
};

/**
 * tool_call: The server rack lights up when an agent invokes a tool.
 * Worker sits at the computer, screen illuminates blue.
 *
 * Sequence: flash(server-rack, blue)
 */
export const toolCallChoreography: ChoreographyDefinition = {
  on: "tool_call",
  steps: [
    {
      action: "flash",
      target: "server-rack",
      color: "#4488ff",
      duration: 600,
    },
  ],
};

/**
 * token_usage: Invoice appears at the accounts desk.
 *
 * Sequence: spawn(invoice) → wait → destroy(invoice)
 */
export const tokenUsageChoreography: ChoreographyDefinition = {
  on: "token_usage",
  steps: [
    {
      action: "spawn",
      entity: "invoice",
      at: "accounts",
    },
    {
      action: "playSound",
      entity: "invoice",
      sound: "sfx/paper-rustle.ogg",
    },
    {
      action: "wait",
      duration: 1200,
    },
    {
      action: "destroy",
      entity: "invoice",
    },
  ],
};

/** All Office choreographies, ready to register with a Choreographer. */
export const officeChoreographies: readonly ChoreographyDefinition[] = [
  taskDispatchChoreography,
  errorChoreography,
  toolCallChoreography,
  tokenUsageChoreography,
];
