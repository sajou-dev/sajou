/**
 * Workspace module.
 *
 * Root layout manager. Initializes all Phase 1 components:
 * canvas, toolbar, header, panels skeleton, state, undo.
 */

import { initCanvas } from "../canvas/canvas.js";
import { initToolbar } from "./toolbar.js";
import { initHeader } from "./header.js";
import { initUndoManager } from "../state/undo.js";
import { createPanel } from "./panel.js";

/** Initialize the full workspace. */
export async function initWorkspace(): Promise<void> {
  // State is initialized with defaults on import — nothing to call.

  // Undo/redo shortcuts
  initUndoManager();

  // Header buttons
  initHeader();

  // Toolbar (tools + panel toggles)
  initToolbar();

  // PixiJS canvas (async — waits for app.init)
  await initCanvas();

  // Create placeholder panels (Phase 1: empty, just to prove the panel system works)
  const entityPalette = createPanel({ id: "entity-palette", title: "Entity Palette", minWidth: 220, minHeight: 200 });
  entityPalette.contentEl.innerHTML = '<p class="panel-placeholder">Define entities to place them here.</p>';

  const inspector = createPanel({ id: "inspector", title: "Entity Inspector", minWidth: 250, minHeight: 200 });
  inspector.contentEl.innerHTML = '<p class="panel-placeholder">Select an element to inspect.</p>';

  const layersPanel = createPanel({ id: "layers", title: "Layers", minWidth: 230, minHeight: 200 });
  layersPanel.contentEl.innerHTML = '<p class="panel-placeholder">Scene layers will appear here.</p>';

  const assetManager = createPanel({ id: "asset-manager", title: "Asset Manager", minWidth: 400, minHeight: 300 });
  assetManager.contentEl.innerHTML = '<p class="panel-placeholder">Import and browse assets.</p>';

  const entityEditor = createPanel({ id: "entity-editor", title: "Entity Editor", minWidth: 400, minHeight: 300 });
  entityEditor.contentEl.innerHTML = '<p class="panel-placeholder">Configure entity visuals.</p>';

  const settings = createPanel({ id: "settings", title: "Settings", minWidth: 280, minHeight: 200 });
  settings.contentEl.innerHTML = '<p class="panel-placeholder">Scene settings.</p>';
}
