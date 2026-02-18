/**
 * p5.js editor view.
 *
 * The p5 pipeline node (#p5-node-content) contains only the preview canvas.
 * The code editor + params panel live in a floating panel created
 * by initP5EditorPanel().
 *
 * Lazily initializes CodeMirror, params, and preview canvas on first need.
 */

import { getEditorState, subscribeEditor, togglePanel } from "../state/editor-state.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let panelInitialized = false;

// ---------------------------------------------------------------------------
// Pipeline node — preview canvas only
// ---------------------------------------------------------------------------

/** Initialize the p5 preview inside the p5 pipeline node. */
export function initP5View(): void {
  const container = document.getElementById("p5-node-content");
  if (!container) return;

  // Create preview panel directly inside the pipeline node
  const previewPanel = document.createElement("div");
  previewPanel.className = "p5-preview-panel";
  previewPanel.id = "p5-preview-panel";
  container.appendChild(previewPanel);

  // Mini-bar with p5 editor toggle
  const miniBar = document.createElement("div");
  miniBar.id = "p5-mini-bar";

  const editorBtn = document.createElement("button");
  editorBtn.className = "zoom-btn p5-mini-btn";
  editorBtn.title = "Toggle p5.js editor";
  editorBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>`;
  editorBtn.addEventListener("click", () => togglePanel("p5-editor"));
  miniBar.appendChild(editorBtn);

  previewPanel.appendChild(miniBar);

  // Sync editor button active state
  subscribeEditor(() => {
    const { panelLayouts } = getEditorState();
    editorBtn.classList.toggle("p5-mini-btn--active", panelLayouts["p5-editor"]?.visible ?? false);
  });

  // Subscribe to pipeline layout changes for lazy init
  subscribeEditor(onLayoutChange);

  // Check immediately in case the panel was already visible from persisted state
  onLayoutChange();
}

// ---------------------------------------------------------------------------
// Floating panel — code editor + params
// ---------------------------------------------------------------------------

/** Initialize the p5 editor floating panel content. */
export function initP5EditorPanel(contentEl: HTMLElement): void {
  const codePanel = document.createElement("div");
  codePanel.className = "p5-code-panel";
  codePanel.id = "p5-code-panel";

  const paramsPanel = document.createElement("div");
  paramsPanel.className = "p5-params-panel";
  paramsPanel.id = "p5-params-panel";

  contentEl.appendChild(codePanel);
  contentEl.appendChild(paramsPanel);

  // DOM is now ready — trigger lazy init if panel was already visible from persisted state
  onLayoutChange();
}

// ---------------------------------------------------------------------------
// Lazy initialization
// ---------------------------------------------------------------------------

/** Initialize CodeMirror and params on first panel open. */
async function lazyInitPanel(): Promise<void> {
  if (panelInitialized) return;

  const codeEl = document.getElementById("p5-code-panel");
  if (!codeEl) return; // DOM not ready yet — will retry on next state change

  panelInitialized = true;
  if (codeEl) {
    const { initP5CodePanel } = await import("./p5-code-panel.js");
    initP5CodePanel(codeEl);
  }

  const paramsEl = document.getElementById("p5-params-panel");
  if (paramsEl) {
    const { initP5ParamsPanel } = await import("./p5-params-panel.js");
    initP5ParamsPanel(paramsEl);
  }
}

// ---------------------------------------------------------------------------
// Layout sync
// ---------------------------------------------------------------------------

/** Trigger lazy init when p5-editor panel becomes visible. */
function onLayoutChange(): void {
  const { panelLayouts } = getEditorState();

  if (panelLayouts["p5-editor"]?.visible && !panelInitialized) {
    void lazyInitPanel();
  }
}
