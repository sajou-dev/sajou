/**
 * The Citadel theme manifest.
 *
 * Declares the complete scene: entities, layout, capabilities, and assets.
 * This is a WC3-inspired medieval fantasy setting where agents are peons,
 * tools are buildings, and signals are carried by messenger pigeons.
 */

import type { ThemeManifest } from "@sajou/theme-api";
import { citadelEntities } from "./entities/citadel-entities.js";

/**
 * Scene layout for the Citadel theme.
 *
 * The scene is a top-down medieval village. Buildings are fixed positions,
 * units move between them.
 *
 * ```
 *       [Oracle]
 *          |
 *    [Forge]  [Forge]
 *       \      /
 *      [Center]
 *       /     \
 *  [Spawn]   [Gold]
 * ```
 */
export const citadelManifest: ThemeManifest = {
  id: "citadel",
  name: "Citadelle",
  version: "0.1.0",
  description:
    "WC3-inspired medieval fantasy theme. Agents are peons, tools are buildings, " +
    "signals travel by pigeon. Token costs rain as gold coins.",

  capabilities: {
    visualTypes: ["sprite", "spritesheet", "particle"],
    sound: true,
    perspective: false,
  },

  entities: citadelEntities,

  layout: {
    sceneWidth: 800,
    sceneHeight: 600,
    positions: {
      oracle: { x: 400, y: 80 },
      forgeLeft: { x: 200, y: 220 },
      forgeRight: { x: 600, y: 220 },
      center: { x: 400, y: 350 },
      spawnPoint: { x: 150, y: 500 },
      goldPile: { x: 650, y: 500 },
    },
  },

  assets: {
    basePath: "./assets",
    preload: [
      "tiny-swords-update-010/Factions/Knights/Troops/Pawn/Blue/Pawn_Blue.png",
      "tiny-swords-update-010/Factions/Knights/Troops/Archer/Arrow/Arrow.png",
      "tiny-swords-update-010/Factions/Knights/Buildings/House/House_Blue.png",
      "tiny-swords-update-010/Factions/Knights/Buildings/Castle/Castle_Blue.png",
      "tiny-swords-update-010/Resources/Resources/G_Idle.png",
      "tiny-swords-update-010/Effects/Explosion/Explosions.png",
      "tiny-swords-update-010/Terrain/Ground/Tilemap_Flat.png",
      "sfx/peon-ready.ogg",
      "sfx/pigeon-coo.ogg",
      "sfx/coins-clink.ogg",
      "sfx/explosion.ogg",
    ],
  },
};
