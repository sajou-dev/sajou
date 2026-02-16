/**
 * Shader editor view.
 *
 * Creates the shader editor DOM container inside the shader pipeline node
 * (#shader-node-content). The shader editor is always rendered in its own
 * pipeline node — no toggle with the visual canvas.
 *
 * Lazily initializes CodeMirror and preview canvas on first extension.
 */

import { getEditorState, subscribeEditor } from "../state/editor-state.js";

// ---------------------------------------------------------------------------
// DOM creation
// ---------------------------------------------------------------------------

let editorEl: HTMLDivElement | null = null;
let initialized = false;

/** Initialize the shader editor view inside the shader pipeline node. */
export function initShaderView(): void {
  const container = document.getElementById("shader-node-content");
  if (!container) return;

  editorEl = document.createElement("div");
  editorEl.id = "shader-editor";
  editorEl.className = "shader-editor";

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
  container.appendChild(editorEl);

  // Subscribe to pipeline layout changes for lazy init
  subscribeEditor(onLayoutChange);
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
// Layout sync — lazy init when shader node becomes extended
// ---------------------------------------------------------------------------

/** Trigger lazy init when the shader pipeline node becomes extended. */
function onLayoutChange(): void {
  const { pipelineLayout } = getEditorState();
  const isExtended = pipelineLayout.extended.includes("shader");

  if (isExtended && !initialized) {
    void lazyInit();
  }
}
