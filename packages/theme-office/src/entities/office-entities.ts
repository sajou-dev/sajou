/**
 * Entity definitions for the Office theme.
 *
 * These are the visual actors in the modern office scene: workers carry out tasks,
 * servers represent tools/services, emails carry messages, and visual effects
 * represent state changes like costs and errors.
 */

import type { EntityDefinition } from "@sajou/theme-api";

/** An office worker — represents an agent carrying out a task. */
export const workerEntity: EntityDefinition = {
  id: "worker",
  tags: ["unit", "worker", "agent"],
  defaults: {
    scale: 1.0,
    anchor: [0.5, 1.0],
    zIndex: 20,
  },
  visual: {
    type: "spritesheet",
    source: "entities/worker-sheet.png",
    frameWidth: 32,
    frameHeight: 48,
    animations: {
      idle: { frames: [0], fps: 1 },
      walk: { frames: [0, 1, 2, 3], fps: 8, loop: true },
    },
  },
  sounds: {
    spawn: "sfx/keyboard-type.ogg",
  },
};

/** An email notification — represents a signal traveling between entities. */
export const emailEntity: EntityDefinition = {
  id: "email",
  tags: ["unit", "messenger"],
  defaults: {
    scale: 0.8,
    anchor: [0.5, 0.5],
    zIndex: 30,
  },
  visual: {
    type: "sprite",
    source: "entities/email.png",
  },
  sounds: {
    spawn: "sfx/notification.ogg",
  },
};

/** A server rack — represents a tool or service being invoked. */
export const serverRackEntity: EntityDefinition = {
  id: "server-rack",
  tags: ["building", "tool"],
  defaults: {
    scale: 1.0,
    anchor: [0.5, 1.0],
    zIndex: 5,
  },
  visual: {
    type: "sprite",
    source: "entities/server-rack.png",
  },
  sounds: {
    spawn: "sfx/server-hum.ogg",
  },
};

/** The manager's desk — represents the orchestrator or LLM. */
export const managerDeskEntity: EntityDefinition = {
  id: "manager-desk",
  tags: ["building", "orchestrator"],
  defaults: {
    scale: 1.5,
    anchor: [0.5, 1.0],
    zIndex: 5,
  },
  visual: {
    type: "sprite",
    source: "entities/manager-desk.png",
  },
  sounds: {
    spawn: "sfx/desk-bell.ogg",
  },
};

/** Invoice document — represents token usage / cost. */
export const invoiceEntity: EntityDefinition = {
  id: "invoice",
  tags: ["effect", "vfx", "cost"],
  visual: {
    type: "particle",
    emitter: {
      maxParticles: 15,
      lifetime: 1200,
      rate: 20,
      speed: [10, 50],
      scale: [0.3, 0.8],
      startColor: "#ffd700",
      endColor: "#ffd70000",
      sprite: "particles/invoice.png",
    },
  },
  sounds: {
    spawn: "sfx/paper-rustle.ogg",
  },
};

/** Blue screen crash — represents errors. */
export const crashEntity: EntityDefinition = {
  id: "crash",
  tags: ["effect", "vfx", "error"],
  visual: {
    type: "particle",
    emitter: {
      maxParticles: 30,
      lifetime: 600,
      rate: 60,
      speed: [40, 150],
      scale: [0.5, 1.2],
      startColor: "#ff3300",
      endColor: "#ff000000",
      sprite: "particles/spark.png",
    },
  },
  sounds: {
    spawn: "sfx/error-buzz.ogg",
  },
};

/**
 * All Office entities, keyed by ID.
 * This is used to populate the theme manifest.
 */
export const officeEntities: Readonly<Record<string, EntityDefinition>> = {
  [workerEntity.id]: workerEntity,
  [emailEntity.id]: emailEntity,
  [serverRackEntity.id]: serverRackEntity,
  [managerDeskEntity.id]: managerDeskEntity,
  [invoiceEntity.id]: invoiceEntity,
  [crashEntity.id]: crashEntity,
};
