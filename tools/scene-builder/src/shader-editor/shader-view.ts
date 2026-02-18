/**
 * Shader editor view.
 *
 * The shader pipeline node (#shader-node-content) contains only the preview
 * canvas. The code editor + uniforms panel live in a floating panel created
 * by initShaderEditorPanel().
 *
 * Lazily initializes CodeMirror, uniforms, detected values, and preview
 * canvas on first need.
 */

import { getEditorState, subscribeEditor, togglePanel } from "../state/editor-state.js";

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

  // Mini-bar with shader editor toggle (inside preview panel for correct positioning)
  const miniBar = document.createElement("div");
  miniBar.id = "shader-mini-bar";

  const editorBtn = document.createElement("button");
  editorBtn.className = "zoom-btn shader-mini-btn";
  editorBtn.title = "Toggle shader editor";
  editorBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>`;
  editorBtn.addEventListener("click", () => togglePanel("shader-editor"));
  miniBar.appendChild(editorBtn);

  previewPanel.appendChild(miniBar);

  // Sync editor button active state
  subscribeEditor(() => {
    const { panelLayouts } = getEditorState();
    editorBtn.classList.toggle("shader-mini-btn--active", panelLayouts["shader-editor"]?.visible ?? false);
  });

  // Subscribe to pipeline layout changes for lazy init
  subscribeEditor(onLayoutChange);

  // Check immediately in case the panel was already visible from persisted state
  onLayoutChange();
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

  const detectedPanel = document.createElement("div");
  detectedPanel.className = "shader-detected-panel";
  detectedPanel.id = "shader-detected-panel";

  contentEl.appendChild(codePanel);
  contentEl.appendChild(uniformsPanel);
  contentEl.appendChild(detectedPanel);

  // DOM is now ready — trigger lazy init if panel was already visible from persisted state
  onLayoutChange();
}

// ---------------------------------------------------------------------------
// Lazy initialization
// ---------------------------------------------------------------------------

/** Initialize CodeMirror and uniforms on first panel open. */
async function lazyInitPanel(): Promise<void> {
  if (panelInitialized) return;

  const codeEl = document.getElementById("shader-code-panel");
  if (!codeEl) return; // DOM not ready yet — will retry on next state change

  panelInitialized = true;
  if (codeEl) {
    const { initShaderCodePanel } = await import("./shader-code-panel.js");
    initShaderCodePanel(codeEl);
  }

  const uniformsEl = document.getElementById("shader-uniforms-panel");
  if (uniformsEl) {
    const { initShaderUniformsPanel } = await import("./shader-uniforms-panel.js");
    initShaderUniformsPanel(uniformsEl);
  }

  const detectedEl = document.getElementById("shader-detected-panel");
  if (detectedEl) {
    const { initDetectedValuesPanel } = await import("./detected-values-panel.js");
    initDetectedValuesPanel(detectedEl);
  }
}

// ---------------------------------------------------------------------------
// Layout sync
// ---------------------------------------------------------------------------

/** Trigger lazy init when shader-editor panel becomes visible. */
function onLayoutChange(): void {
  const { panelLayouts } = getEditorState();

  if (panelLayouts["shader-editor"]?.visible && !panelInitialized) {
    void lazyInitPanel();
  }
}
