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
 *     🌲  [Oracle]  🌲
 *          |
 *    [Forge]   [Center]
 *       \       /
 *     🪨  Path  🪨
 *       /     \
 *  [Spawn]   [Gold]  🌲
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
      oracle: { x: 400, y: 130 },
      forgeLeft: { x: 160, y: 310 },
      forgeRight: { x: 640, y: 310 },
      center: { x: 400, y: 360 },
      spawnPoint: { x: 130, y: 520 },
      goldPile: { x: 670, y: 520 },
    },
  },

  assets: {
    basePath: "./assets",
    preload: [
      "tiny-swords-update-010/Factions/Knights/Troops/Pawn/Blue/Pawn_Blue.png",
      "tiny-swords-update-010/Factions/Knights/Troops/Archer/Arrow/Arrow.png",
      "tiny-swords-update-010/Factions/Knights/Buildings/House/House_Blue.png",
      "tiny-swords-update-010/Factions/Knights/Buildings/House/House_Destroyed.png",
      "tiny-swords-update-010/Factions/Knights/Buildings/Castle/Castle_Blue.png",
      "tiny-swords-update-010/Factions/Knights/Buildings/Castle/Castle_Destroyed.png",
      "tiny-swords-update-010/Resources/Resources/G_Idle.png",
      "tiny-swords-update-010/Resources/Resources/G_Spawn.png",
      "tiny-swords-update-010/Effects/Explosion/Explosions.png",
      "tiny-swords-update-010/Terrain/Ground/Tilemap_Flat.png",
      "tiny-swords-update-010/Deco/01.png",
      "tiny-swords-update-010/Deco/03.png",
      "tiny-swords-update-010/Deco/06.png",
      "tiny-swords-update-010/Deco/09.png",
      "tiny-swords-update-010/Deco/11.png",
      "tiny-swords-update-010/Deco/16.png",
      "tiny-swords-update-010/Deco/17.png",
      "tiny-swords/Terrain/Decorations/Rocks/Rock1.png",
      "tiny-swords/Terrain/Decorations/Rocks/Rock2.png",
      "tiny-swords/Terrain/Decorations/Rocks/Rock3.png",
      "tiny-swords/Terrain/Resources/Wood/Trees/Stump 1.png",
      "tiny-swords/Terrain/Resources/Wood/Trees/Stump 2.png",
      "tiny-swords/Terrain/Resources/Wood/Trees/Stump 3.png",
      "sfx/peon-ready.ogg",
      "sfx/pigeon-coo.ogg",
      "sfx/coins-clink.ogg",
      "sfx/explosion.ogg",
    ],
  },
};
