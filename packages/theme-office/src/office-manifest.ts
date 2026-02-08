/**
 * The Office theme manifest.
 *
 * Declares the complete scene: entities, layout, capabilities, and assets.
 * This is a modern office setting where agents are workers, tools are servers,
 * and signals are carried by email notifications.
 */

import type { ThemeManifest } from "@sajou/theme-api";
import { officeEntities } from "./entities/office-entities.js";

/**
 * Scene layout for the Office theme.
 *
 * The scene is a top-down modern office. Desks and servers are fixed positions,
 * workers move between them.
 *
 * ```
 *     [Manager Desk]
 *          |
 *   [Server]  [Server]
 *       \       /
 *      [Open Space]
 *       /       \
 *  [Entrance]  [Accounts]
 * ```
 */
export const officeManifest: ThemeManifest = {
  id: "office",
  name: "Modern Office",
  version: "0.1.0",
  description:
    "Modern office theme using LimeZu pixel art. Agents are workers, tools are server racks, " +
    "signals travel by email. Token costs appear as invoices.",

  capabilities: {
    visualTypes: ["sprite", "spritesheet", "particle"],
    sound: true,
    perspective: false,
  },

  entities: officeEntities,

  layout: {
    sceneWidth: 800,
    sceneHeight: 600,
    positions: {
      managerDesk: { x: 400, y: 80 },
      serverLeft: { x: 200, y: 220 },
      serverRight: { x: 600, y: 220 },
      openSpace: { x: 400, y: 350 },
      entrance: { x: 150, y: 500 },
      accounts: { x: 650, y: 500 },
    },
  },

  assets: {
    basePath: "./assets",
    preload: [
      "modern-interiors/RPG_MAKER_XP/Characters/Bob.png",
      "modern-office/4_Modern_Office_singles/48x48/Modern_Office_Singles_48x48_155.png",
      "modern-office/4_Modern_Office_singles/48x48/Modern_Office_Singles_48x48_275.png",
      "modern-office/4_Modern_Office_singles/48x48/Modern_Office_Singles_48x48_190.png",
      "modern-office/4_Modern_Office_singles/48x48/Modern_Office_Singles_48x48_243.png",
      "modern-office/4_Modern_Office_singles/48x48/Modern_Office_Singles_48x48_126.png",
      "modern-office/1_Room_Builder_Office/Room_Builder_Office_48x48.png",
    ],
  },
};
