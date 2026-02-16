/**
 * Pipeline mini-previews — compact summaries for each pipeline node in mini mode.
 *
 * - Signal: colored circles per connected source + events/sec counter
 * - Choreographer: count + colored pastilles per signal type
 * - Visual: thumbnail of the WebGL canvas (snapshot every 2s)
 * - Shader: shader name + mini swatch
 */

import { getSignalSourcesState, subscribeSignalSources } from "../state/signal-source-state.js";
import { getChoreographyState, subscribeChoreography } from "../state/choreography-state.js";
import { getEditorState, subscribeEditor } from "../state/editor-state.js";
import { SIGNAL_TYPE_COLORS } from "../views/step-commands.js";
import { getShaderState, subscribeShaders } from "../shader-editor/shader-state.js";
import type { PipelineNodeId } from "../types.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let visualSnapshotInterval: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize mini-previews for all pipeline nodes. */
export function initMiniPreviews(): void {
  initSignalMini();
  initChoreoMini();
  initVisualMini();
  initShaderMini();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the .pl-node-mini element for a pipeline node. */
function getMiniEl(nodeId: PipelineNodeId): HTMLElement | null {
  const node = document.querySelector(`[data-pl-node="${nodeId}"]`);
  return node?.querySelector(".pl-node-mini") ?? null;
}

// ---------------------------------------------------------------------------
// Signal mini-preview
// ---------------------------------------------------------------------------

function initSignalMini(): void {
  function render(): void {
    const el = getMiniEl("signal");
    if (!el) return;

    const { sources } = getSignalSourcesState();
    const connected = sources.filter((s) => s.status === "connected");
    const totalRate = sources.reduce((sum, s) => sum + s.eventsPerSecond, 0);

    el.innerHTML = "";

    // Source dots row
    if (connected.length > 0) {
      const dotsRow = document.createElement("div");
      dotsRow.style.cssText = "display:flex;gap:4px;align-items:center;justify-content:center;flex-wrap:wrap";
      for (const src of connected) {
        const dot = document.createElement("span");
        dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${src.color}`;
        dot.title = src.name;
        dotsRow.appendChild(dot);
      }
      el.appendChild(dotsRow);
    }

    // Rate counter
    const rate = document.createElement("div");
    rate.style.cssText = "font:600 18px/1 var(--font-mono);color:var(--color-text-muted);text-align:center";
    rate.textContent = totalRate > 0 ? `${Math.round(totalRate)}/s` : "---";
    el.appendChild(rate);

    // Source count label
    const label = document.createElement("div");
    label.style.cssText = "font:10px/1 var(--font-mono);color:var(--color-text-dim);text-align:center";
    label.textContent = `${sources.length} source${sources.length !== 1 ? "s" : ""}`;
    el.appendChild(label);
  }

  subscribeSignalSources(render);
  render();
}

// ---------------------------------------------------------------------------
// Choreographer mini-preview
// ---------------------------------------------------------------------------

function initChoreoMini(): void {
  function render(): void {
    const el = getMiniEl("choreographer");
    if (!el) return;

    const { choreographies } = getChoreographyState();
    el.innerHTML = "";

    // Count
    const count = document.createElement("div");
    count.style.cssText = "font:600 18px/1 var(--font-mono);color:var(--color-text-muted);text-align:center";
    count.textContent = `${choreographies.length}`;
    el.appendChild(count);

    const label = document.createElement("div");
    label.style.cssText = "font:10px/1 var(--font-mono);color:var(--color-text-dim);text-align:center";
    label.textContent = `choreo${choreographies.length !== 1 ? "s" : ""}`;
    el.appendChild(label);

    // Signal type pastilles
    const types = new Set(choreographies.map((c) => c.on));
    if (types.size > 0) {
      const dotsRow = document.createElement("div");
      dotsRow.style.cssText = "display:flex;gap:3px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:4px";
      for (const t of types) {
        const dot = document.createElement("span");
        const color = SIGNAL_TYPE_COLORS[t] ?? "#6E6E8A";
        dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color}`;
        dot.title = t;
        dotsRow.appendChild(dot);
      }
      el.appendChild(dotsRow);
    }
  }

  subscribeChoreography(render);
  render();
}

// ---------------------------------------------------------------------------
// Visual mini-preview (canvas thumbnail)
// ---------------------------------------------------------------------------

function initVisualMini(): void {
  const img = document.createElement("img");
  img.style.cssText = "width:100%;height:100%;object-fit:contain;image-rendering:pixelated;opacity:0.8";
  img.alt = "Scene preview";

  function captureSnapshot(): void {
    const { pipelineLayout } = getEditorState();
    // Only capture when visual node is mini (thumbnail needed)
    if (pipelineLayout.extended.includes("visual")) return;

    const canvas = document.querySelector<HTMLCanvasElement>("#canvas-container canvas");
    if (!canvas) return;

    try {
      img.src = canvas.toDataURL("image/png");
    } catch {
      // Security error if canvas is tainted — ignore
    }
  }

  function mount(): void {
    const el = getMiniEl("visual");
    if (!el) return;
    if (!el.contains(img)) {
      el.innerHTML = "";
      el.appendChild(img);
    }
  }

  // Periodic snapshot
  visualSnapshotInterval = setInterval(captureSnapshot, 2000);

  // Mount img element and react to layout changes
  subscribeEditor(() => {
    mount();
    captureSnapshot();
  });

  mount();
  captureSnapshot();
}

// ---------------------------------------------------------------------------
// Shader mini-preview
// ---------------------------------------------------------------------------

function initShaderMini(): void {
  const img = document.createElement("img");
  img.style.cssText = "width:32px;height:32px;border-radius:var(--radius-sm);border:1px solid var(--color-border)";
  img.alt = "Shader preview";

  function render(): void {
    const el = getMiniEl("shader");
    if (!el) return;

    const state = getShaderState();
    const selected = state.shaders.find((s) => s.id === state.selectedShaderId);

    el.innerHTML = "";

    // Shader name
    const name = document.createElement("div");
    name.style.cssText = "font:500 11px/1 var(--font-mono);color:var(--color-text-muted);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px";
    name.textContent = selected?.name ?? "No shader";
    el.appendChild(name);

    // Mini swatch (capture from shader preview canvas)
    const { pipelineLayout } = getEditorState();
    if (!pipelineLayout.extended.includes("shader")) {
      const shaderCanvas = document.querySelector<HTMLCanvasElement>("#shader-preview-panel canvas");
      if (shaderCanvas) {
        try {
          img.src = shaderCanvas.toDataURL("image/png");
        } catch {
          // ignore
        }
      }
      el.appendChild(img);
    }
  }

  subscribeShaders(render);
  subscribeEditor(render);
  render();

  // Periodic swatch capture
  setInterval(() => {
    const { pipelineLayout } = getEditorState();
    if (!pipelineLayout.extended.includes("shader")) {
      render();
    }
  }, 2000);
}
