/**
 * Shader editor view.
 *
 * Creates the shader editor DOM container inside #zone-theme.
 * Subscribes to editor state to toggle visibility between
 * the visual canvas and the shader editor.
 * Lazily initializes CodeMirror and preview canvas on first show.
 */

import { getEditorState, subscribeEditor } from "../state/editor-state.js";

// ---------------------------------------------------------------------------
// DOM creation
// ---------------------------------------------------------------------------

let editorEl: HTMLDivElement | null = null;
let initialized = false;

/** Initialize the shader editor view inside #zone-theme. */
export function initShaderView(): void {
  const zoneTheme = document.getElementById("zone-theme");
  if (!zoneTheme) return;

  editorEl = document.createElement("div");
  editorEl.id = "shader-editor";
  editorEl.className = "shader-editor";
  editorEl.style.display = "none";

  // Left panel: code + uniforms (stacked)
  const leftPanel = document.createElement("div");
  leftPanel.className = "shader-left-panel";

  const codePanel = document.createElement("div");
  codePanel.className = "shader-code-panel";
  codePanel.id = "shader-code-panel";

  const uniformsPanel = document.createElement("div");
  uniformsPanel.className = "shader-uniforms-panel";
  uniformsPanel.id = "shader-uniforms-panel";

  leftPanel.appendChild(codePanel);
  leftPanel.appendChild(uniformsPanel);

  // Right panel: preview canvas
  const previewPanel = document.createElement("div");
  previewPanel.className = "shader-preview-panel";
  previewPanel.id = "shader-preview-panel";

  editorEl.appendChild(leftPanel);
  editorEl.appendChild(previewPanel);
  zoneTheme.appendChild(editorEl);

  // Subscribe to view changes
  subscribeEditor(syncVisibility);
  syncVisibility();
}

// ---------------------------------------------------------------------------
// Lazy initialization
// ---------------------------------------------------------------------------

/** Initialize CodeMirror and uniforms panel on first switch to shader view. */
async function lazyInit(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const codeEl = document.getElementById("shader-code-panel");
  if (codeEl) {
    const { initShaderCodePanel } = await import("./shader-code-panel.js");
    initShaderCodePanel(codeEl);
  }

  const uniformsEl = document.getElementById("shader-uniforms-panel");
  if (uniformsEl) {
    const { initShaderUniformsPanel } = await import("./shader-uniforms-panel.js");
    initShaderUniformsPanel(uniformsEl);
  }
}

// ---------------------------------------------------------------------------
// View switching
// ---------------------------------------------------------------------------

/** Toggle visibility between visual canvas and shader editor. */
function syncVisibility(): void {
  const { currentView } = getEditorState();
  const isShader = currentView === "shader";

  // Shader editor
  if (editorEl) {
    editorEl.style.display = isShader ? "flex" : "none";
  }

  // Visual canvas elements
  const toolbar = document.getElementById("toolbar");
  const canvasContainer = document.getElementById("canvas-container");
  const zoomBar = document.getElementById("zoom-bar");

  if (toolbar) toolbar.style.display = isShader ? "none" : "";
  if (canvasContainer) canvasContainer.style.display = isShader ? "none" : "";
  if (zoomBar) zoomBar.style.display = isShader ? "none" : "";

  // Lazy init on first show
  if (isShader && !initialized) {
    void lazyInit();
  }
}
