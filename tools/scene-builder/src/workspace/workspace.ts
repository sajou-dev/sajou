/**
 * Workspace module.
 *
 * Root layout manager. Initializes all components:
 * canvas, toolbar, header, panels, scene renderer, tools, state, undo.
 */

import { initCanvas, setToolHandler } from "../canvas/canvas.js";
import { initSceneRenderer } from "../canvas/scene-renderer.js";
import { initCanvasDropHandler } from "../canvas/canvas-drop-handler.js";
import { initToolbarPanel } from "./toolbar.js";
import { initHeader } from "./header.js";
import { restoreState, initAutoSave } from "../state/persistence.js";
import { initHelpBar } from "./help-bar.js";
import { initUndoManager } from "../state/undo.js";
import {
  getEditorState,
  subscribeEditor,
  setSelection,
  setPositionSelection,
  setRouteSelection,
  setLightSelection,
  setParticleSelection,
} from "../state/editor-state.js";
import { createPanel } from "./panel.js";
import { initPipelineLayout } from "./pipeline-layout.js";
import { initMiniPreviews } from "./pipeline-mini-previews.js";
import { initViewTabs } from "./view-tabs.js";
import { initRideau } from "./rideau.js";
import { initConnectorBarH } from "./connector-bar-horizontal.js";
import { initConnectorBarV } from "./connector-bar-vertical.js";
import { initConnectorBarShader } from "./connector-bar-shader.js";
import { initWiringOverlay } from "./wiring-overlay.js";
import { initWiringDrag } from "./wiring-drag.js";

// Panels
import { initAssetManagerPanel } from "../panels/asset-manager-panel.js";
import { initEntityEditorPanel } from "../panels/entity-editor-panel.js";
import { initEntityPalettePanel } from "../panels/entity-palette-panel.js";
import { initInspectorPanel } from "../panels/inspector-panel.js";
import { initLayersPanel } from "../panels/layers-panel.js";
import { initSettingsPanel } from "../panels/settings-panel.js";
import { initSignalTimelinePanel } from "../panels/signal-timeline-panel.js";
import { initLightingPanel } from "../panels/lighting-panel.js";
import { initParticlePanel } from "../panels/particle-panel.js";

// Views
import { initSignalView } from "../views/signal-view.js";
import { initChoreographyView } from "../views/choreography-view.js";
import { initShaderView, initShaderEditorPanel } from "../shader-editor/shader-view.js";

// Tools
import { createSelectTool, initSelectToolKeyboard } from "../tools/select-tool.js";
import { createPlaceTool, initPlaceToolKeyboard } from "../tools/place-tool.js";
import { createBackgroundTool, initBackgroundToolLifecycle } from "../tools/background-tool.js";
import { createPositionTool, initPositionToolKeyboard } from "../tools/position-tool.js";
import { createRouteTool, initRouteToolKeyboard } from "../tools/route-tool.js";
import { createLightTool, initLightToolKeyboard } from "../tools/light-tool.js";
import { createParticleTool, initParticleToolKeyboard } from "../tools/particle-tool.js";

// ---------------------------------------------------------------------------
// Tool switching
// ---------------------------------------------------------------------------

/** Wire tool handler switching based on active tool in editor state. */
function initToolSwitching(): void {
  const selectTool = createSelectTool();
  const placeTool = createPlaceTool();
  const backgroundTool = createBackgroundTool();
  const positionTool = createPositionTool();
  const { handler: routeTool, cancelCreation: cancelRouteCreation, getHoveredPoint } = createRouteTool();
  const lightTool = createLightTool();
  const particleTool = createParticleTool();

  function syncTool(): void {
    const { activeTool, selectedPositionIds, selectedRouteIds, selectedIds, selectedLightIds, selectedParticleIds } = getEditorState();

    // Clear cross-tool selections on tool switch to avoid stale inspector state.
    // Guard: only clear if non-empty to avoid infinite notify loops.
    if (activeTool !== "position" && selectedPositionIds.length > 0) setPositionSelection([]);
    if (activeTool !== "route" && selectedRouteIds.length > 0) setRouteSelection([]);
    if (activeTool !== "select" && selectedIds.length > 0) setSelection([]);
    if (activeTool !== "light" && selectedLightIds.length > 0) setLightSelection([]);
    if (activeTool !== "particle" && selectedParticleIds.length > 0) setParticleSelection([]);

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
      case "position":
        setToolHandler(positionTool);
        break;
      case "route":
        setToolHandler(routeTool);
        break;
      case "light":
        setToolHandler(lightTool);
        break;
      case "particle":
        setToolHandler(particleTool);
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
  initPositionToolKeyboard();
  initRouteToolKeyboard(cancelRouteCreation, getHoveredPoint);
  initLightToolKeyboard();
  initParticleToolKeyboard();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the full workspace. */
export async function initWorkspace(): Promise<void> {
  // Attempt to restore persisted state before initializing views.
  // If data exists in IndexedDB, stores are populated; otherwise defaults remain.
  await restoreState();

  // Undo/redo shortcuts
  initUndoManager();

  // Header buttons
  initHeader();

  // Pipeline layout — creates DOM zones BEFORE views mount into them
  initPipelineLayout();

  // View tabs (no-op — replaced by pipeline layout)
  initViewTabs();

  // V3: All views init eagerly — mounted inside pipeline nodes
  initSignalView();
  initChoreographyView();

  // Rideau (no-op — replaced by pipeline layout)
  initRideau();

  // Connector bars (badges showing wired connections between zones)
  initConnectorBarH();
  initConnectorBarV();
  initConnectorBarShader();

  // Wiring overlay (SVG bezier curves) + drag-to-connect interaction
  initWiringOverlay();
  initWiringDrag();

  // Toolbar as floating panel — tied to visual editor node
  const toolbarPanel = createPanel({ id: "toolbar", title: "Tools", minWidth: 90, minHeight: 200, ownerNode: "visual" });
  initToolbarPanel(toolbarPanel.contentEl);

  // Help bar (contextual tool hints at bottom)
  initHelpBar();

  // Three.js canvas + Canvas2D overlay
  initCanvas();

  // Scene renderer (syncs state → Three.js entities + Canvas2D overlays)
  initSceneRenderer();

  // Shader editor view (hidden by default, toggled via header button)
  initShaderView();

  // Mini-previews for collapsed pipeline nodes
  initMiniPreviews();

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
  initSettingsPanel(settings.contentEl);

  const signalTimeline = createPanel({ id: "signal-timeline", title: "Signal Timeline", minWidth: 400, minHeight: 350 });
  initSignalTimelinePanel(signalTimeline.contentEl);

  const lightingPanel = createPanel({ id: "lighting", title: "Lighting", minWidth: 280, minHeight: 300 });
  initLightingPanel(lightingPanel.contentEl);

  const particlesPanel = createPanel({ id: "particles", title: "Particles", minWidth: 280, minHeight: 350 });
  initParticlePanel(particlesPanel.contentEl);

  const shaderPanel = createPanel({ id: "shader-editor", title: "Shader Editor", minWidth: 400, minHeight: 350, ownerNode: "shader" });
  initShaderEditorPanel(shaderPanel.contentEl);

  // Start auto-saving state changes AFTER all views and stores are initialized.
  initAutoSave();
}
