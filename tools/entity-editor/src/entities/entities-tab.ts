/**
 * Entities tab wrapper.
 *
 * Composes the entity list, entity config, state config,
 * preview renderer, and asset sidebar into the entities tab.
 */

import { initEntityList } from "./entity-list.js";
import { initEntityConfig } from "./entity-config.js";
import { initStateConfig } from "./state-config.js";
import { initPreviewRenderer } from "./preview-renderer.js";
import { initAssetSidebar } from "./asset-sidebar.js";
import { initSpritesheetExplorer } from "./spritesheet-explorer.js";

/** Initialize all entity tab modules. */
export function initEntitiesTab(): void {
  initEntityList();
  initEntityConfig();
  initStateConfig();
  initSpritesheetExplorer();
  initPreviewRenderer();
  initAssetSidebar();
}
