/**
 * Shader editor view.
 *
 * The shader pipeline node (#shader-node-content) contains only the preview
 * canvas. The code editor + uniforms panel live in a floating panel created
 * by initShaderEditorPanel().
 *
 * Lazily initializes CodeMirror, uniforms, and preview canvas on first need.
 */

import { getEditorState, subscribeEditor, showPanel } from "../state/editor-state.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let panelInitialized = false;

// ---------------------------------------------------------------------------
// Pipeline node — preview canvas only
// ---------------------------------------------------------------------------

/** Initialize the shader preview inside the shader pipeline node. */
export function initShaderView(): void {
  const container = document.getElementById("shader-node-content");
  if (!container) return;

  // Create preview panel directly inside the pipeline node
  const previewPanel = document.createElement("div");
  previewPanel.className = "shader-preview-panel";
  previewPanel.id = "shader-preview-panel";
  container.appendChild(previewPanel);

  // Subscribe to pipeline layout changes for lazy init
  subscribeEditor(onLayoutChange);
}

// ---------------------------------------------------------------------------
// Floating panel — code editor + uniforms
// ---------------------------------------------------------------------------

/** Initialize the shader editor floating panel content. */
export function initShaderEditorPanel(contentEl: HTMLElement): void {
  const codePanel = document.createElement("div");
  codePanel.className = "shader-code-panel";
  codePanel.id = "shader-code-panel";

  const uniformsPanel = document.createElement("div");
  uniformsPanel.className = "shader-uniforms-panel";
  uniformsPanel.id = "shader-uniforms-panel";

  contentEl.appendChild(codePanel);
  contentEl.appendChild(uniformsPanel);
}

// ---------------------------------------------------------------------------
// Lazy initialization
// ---------------------------------------------------------------------------

/** Initialize CodeMirror and uniforms on first panel open. */
async function lazyInitPanel(): Promise<void> {
  if (panelInitialized) return;
  panelInitialized = true;

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
// Layout sync
// ---------------------------------------------------------------------------

/** Trigger lazy inits when shader node becomes extended or panel opens. */
function onLayoutChange(): void {
  const { pipelineLayout, panelLayouts } = getEditorState();
  const isExtended = pipelineLayout.extended.includes("shader");

  // Auto-open shader-editor panel when shader node becomes extended
  if (isExtended) {
    const shaderPanelVisible = panelLayouts["shader-editor"]?.visible;
    if (!shaderPanelVisible) {
      showPanel("shader-editor");
    }
  }

  // Lazy init code panel when shader-editor panel becomes visible
  if (panelLayouts["shader-editor"]?.visible && !panelInitialized) {
    void lazyInitPanel();
  }
}
