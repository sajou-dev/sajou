/**
 * Entity definitions for the Citadel theme.
 *
 * These are the visual actors in the WC3-inspired scene: peons carry out tasks,
 * buildings represent tools/services, pigeons carry messages, and particle
 * effects visualize state changes.
 */

import type { EntityDefinition } from "@sajou/theme-api";

/** A worker unit — represents an agent carrying out a task. */
export const peonEntity: EntityDefinition = {
  id: "peon",
  tags: ["unit", "worker", "agent"],
  defaults: {
    scale: 1.0,
    anchor: [0.5, 1.0],
    zIndex: 20,
  },
  visual: {
    type: "spritesheet",
    source: "entities/peon-sheet.png",
    frameWidth: 64,
    frameHeight: 64,
    animations: {
      idle: { frames: [0], fps: 1 },
      walk: { frames: [0, 1, 2, 3], fps: 12, loop: true },
      work: { frames: [4, 5, 6, 7], fps: 10, loop: true },
      die: { frames: [8, 9, 10, 11], fps: 8, loop: false },
    },
  },
  sounds: {
    spawn: "sfx/peon-ready.ogg",
    work: "sfx/peon-work.ogg",
    die: "sfx/peon-death.ogg",
  },
};

/** A messenger bird — represents a signal traveling between entities. */
export const pigeonEntity: EntityDefinition = {
  id: "pigeon",
  tags: ["unit", "messenger"],
  defaults: {
    scale: 0.6,
    anchor: [0.5, 0.5],
    zIndex: 30,
  },
  visual: {
    type: "spritesheet",
    source: "entities/pigeon-sheet.png",
    frameWidth: 32,
    frameHeight: 32,
    animations: {
      fly: { frames: [0, 1, 2, 3], fps: 16, loop: true },
      land: { frames: [4, 5], fps: 8, loop: false },
    },
  },
  sounds: {
    spawn: "sfx/pigeon-coo.ogg",
  },
};

/** A forge building — represents a tool or service being invoked. */
export const forgeEntity: EntityDefinition = {
  id: "forge",
  tags: ["building", "tool"],
  defaults: {
    scale: 1.5,
    anchor: [0.5, 1.0],
    zIndex: 5,
  },
  visual: {
    type: "spritesheet",
    source: "entities/forge-sheet.png",
    frameWidth: 96,
    frameHeight: 96,
    animations: {
      idle: { frames: [0], fps: 1 },
      active: { frames: [0, 1, 2, 3], fps: 6, loop: true },
    },
  },
  sounds: {
    spawn: "sfx/building-complete.ogg",
  },
};

/** The oracle tower — represents the orchestrator or LLM. */
export const oracleEntity: EntityDefinition = {
  id: "oracle",
  tags: ["building", "orchestrator"],
  defaults: {
    scale: 2.0,
    anchor: [0.5, 1.0],
    zIndex: 5,
  },
  visual: {
    type: "spritesheet",
    source: "entities/oracle-sheet.png",
    frameWidth: 128,
    frameHeight: 128,
    animations: {
      idle: { frames: [0], fps: 1 },
      thinking: { frames: [0, 1, 2, 3], fps: 4, loop: true },
      active: { frames: [4, 5, 6, 7], fps: 8, loop: true },
    },
  },
  sounds: {
    spawn: "sfx/oracle-awaken.ogg",
  },
};

/** Gold coin particle effect — represents token usage / cost. */
export const goldCoinsEntity: EntityDefinition = {
  id: "gold-coins",
  tags: ["effect", "vfx", "cost"],
  visual: {
    type: "particle",
    emitter: {
      maxParticles: 20,
      lifetime: 1200,
      rate: 30,
      speed: [20, 80],
      scale: [0.3, 0.8],
      startColor: "#ffd700",
      endColor: "#ffd70000",
      sprite: "particles/coin.png",
    },
  },
  sounds: {
    spawn: "sfx/coins-clink.ogg",
  },
};

/** Red explosion effect — represents errors. */
export const explosionEntity: EntityDefinition = {
  id: "explosion",
  tags: ["effect", "vfx", "error"],
  visual: {
    type: "particle",
    emitter: {
      maxParticles: 40,
      lifetime: 600,
      rate: 80,
      speed: [60, 200],
      scale: [0.5, 1.5],
      startColor: "#ff3300",
      endColor: "#ff000000",
      sprite: "particles/spark.png",
    },
  },
  sounds: {
    spawn: "sfx/explosion.ogg",
  },
};

/**
 * All Citadel entities, keyed by ID.
 * This is used to populate the theme manifest.
 */
export const citadelEntities: Readonly<Record<string, EntityDefinition>> = {
  [peonEntity.id]: peonEntity,
  [pigeonEntity.id]: pigeonEntity,
  [forgeEntity.id]: forgeEntity,
  [oracleEntity.id]: oracleEntity,
  [goldCoinsEntity.id]: goldCoinsEntity,
  [explosionEntity.id]: explosionEntity,
};
