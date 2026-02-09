/**
 * Workspace module.
 *
 * Root layout manager. Initializes all components:
 * canvas, toolbar, header, panels, scene renderer, tools, state, undo.
 */

import { initCanvas, setToolHandler } from "../canvas/canvas.js";
import { initSceneRenderer } from "../canvas/scene-renderer.js";
import { initCanvasDropHandler } from "../canvas/canvas-drop-handler.js";
import { initToolbar } from "./toolbar.js";
import { initHeader } from "./header.js";
import { initUndoManager } from "../state/undo.js";
import { getEditorState, subscribeEditor } from "../state/editor-state.js";
import { createPanel } from "./panel.js";

// Panels
import { initAssetManagerPanel } from "../panels/asset-manager-panel.js";
import { initEntityEditorPanel } from "../panels/entity-editor-panel.js";
import { initEntityPalettePanel } from "../panels/entity-palette-panel.js";
import { initInspectorPanel } from "../panels/inspector-panel.js";
import { initLayersPanel } from "../panels/layers-panel.js";

// Tools
import { createSelectTool, initSelectToolKeyboard } from "../tools/select-tool.js";
import { createPlaceTool, initPlaceToolKeyboard } from "../tools/place-tool.js";
import { createBackgroundTool, initBackgroundToolLifecycle } from "../tools/background-tool.js";

// ---------------------------------------------------------------------------
// Tool switching
// ---------------------------------------------------------------------------

/** Wire tool handler switching based on active tool in editor state. */
function initToolSwitching(): void {
  const selectTool = createSelectTool();
  const placeTool = createPlaceTool();
  const backgroundTool = createBackgroundTool();

  function syncTool(): void {
    const { activeTool } = getEditorState();
    switch (activeTool) {
      case "select":
        setToolHandler(selectTool);
        break;
      case "place":
        setToolHandler(placeTool);
        break;
      case "background":
        setToolHandler(backgroundTool);
        break;
      default:
        setToolHandler(null);
        break;
    }
  }

  subscribeEditor(syncTool);
  syncTool();

  // Keyboard shortcuts for tools
  initSelectToolKeyboard();
  initPlaceToolKeyboard();
  initBackgroundToolLifecycle();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

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

  // Scene renderer (syncs state → PixiJS display objects)
  initSceneRenderer();

  // Canvas drop handler (drag asset from Asset Manager → auto-place)
  initCanvasDropHandler();

  // Tool switching
  initToolSwitching();

  // Create panels with real content
  const entityPalette = createPanel({ id: "entity-palette", title: "Entity Palette", minWidth: 220, minHeight: 200 });
  initEntityPalettePanel(entityPalette.contentEl);

  const inspector = createPanel({ id: "inspector", title: "Entity Inspector", minWidth: 250, minHeight: 200 });
  initInspectorPanel(inspector.contentEl);

  const layersPanel = createPanel({ id: "layers", title: "Layers", minWidth: 240, minHeight: 250 });
  initLayersPanel(layersPanel.contentEl);

  const assetManager = createPanel({ id: "asset-manager", title: "Asset Manager", minWidth: 400, minHeight: 300 });
  initAssetManagerPanel(assetManager.contentEl);

  const entityEditor = createPanel({ id: "entity-editor", title: "Entity Editor", minWidth: 400, minHeight: 300 });
  initEntityEditorPanel(entityEditor.contentEl);

  const settings = createPanel({ id: "settings", title: "Settings", minWidth: 280, minHeight: 200 });
  settings.contentEl.innerHTML = '<p class="panel-placeholder">Scene settings.</p>';
}
