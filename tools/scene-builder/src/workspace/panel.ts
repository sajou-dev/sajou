/**
 * Generic floating panel component.
 *
 * Creates a draggable, resizable, closeable floating panel as an HTML div.
 * Used by all panels (Asset Palette, Inspector, Layers, etc.).
 */

import type { PanelId } from "../types.js";
import { getEditorState, updatePanelLayout, togglePanel, subscribeEditor } from "../state/editor-state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PanelConfig {
  id: PanelId;
  title: string;
  minWidth?: number;
  minHeight?: number;
}

export interface PanelInstance {
  element: HTMLElement;
  contentEl: HTMLElement;
  destroy: () => void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a floating panel and append it to the workspace. */
export function createPanel(config: PanelConfig): PanelInstance {
  const { id, title, minWidth = 200, minHeight = 150 } = config;

  // Root element
  const el = document.createElement("div");
  el.className = "panel";
  el.dataset.panelId = id;

  // Header (drag handle)
  const header = document.createElement("div");
  header.className = "panel-header";

  const titleEl = document.createElement("span");
  titleEl.className = "panel-title";
  titleEl.textContent = title;

  const closeBtn = document.createElement("button");
  closeBtn.className = "panel-close";
  closeBtn.textContent = "\u00D7";
  closeBtn.title = "Close";
  closeBtn.addEventListener("click", () => togglePanel(id));

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  // Content area
  const contentEl = document.createElement("div");
  contentEl.className = "panel-content";

  // Resize handle (bottom-right)
  const resizeHandle = document.createElement("div");
  resizeHandle.className = "panel-resize-handle";

  el.appendChild(header);
  el.appendChild(contentEl);
  el.appendChild(resizeHandle);

  // Apply initial layout from state
  function applyLayout(): void {
    const layout = getEditorState().panelLayouts[id];
    el.style.left = `${layout.x}px`;
    el.style.top = `${layout.y}px`;
    el.style.width = `${layout.width}px`;
    el.style.height = `${layout.height}px`;
    el.style.display = layout.visible ? "flex" : "none";
  }

  applyLayout();

  // ---------------------------------------------------------------------------
  // Drag
  // ---------------------------------------------------------------------------

  let dragging: { startX: number; startY: number; origX: number; origY: number } | null = null;

  header.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).classList.contains("panel-close")) return;
    e.preventDefault();
    const layout = getEditorState().panelLayouts[id];
    dragging = { startX: e.clientX, startY: e.clientY, origX: layout.x, origY: layout.y };
    el.classList.add("panel--dragging");

    const onMove = (ev: MouseEvent) => {
      if (!dragging) return;
      const nx = dragging.origX + (ev.clientX - dragging.startX);
      const ny = dragging.origY + (ev.clientY - dragging.startY);
      // Clamp to parent container bounds
      const parent = el.parentElement;
      const layout = getEditorState().panelLayouts[id];
      const maxX = parent ? parent.clientWidth - layout.width : Infinity;
      const maxY = parent ? parent.clientHeight - layout.height : Infinity;
      updatePanelLayout(id, {
        x: Math.max(0, Math.min(maxX, nx)),
        y: Math.max(0, Math.min(maxY, ny)),
      });
    };

    const onUp = () => {
      dragging = null;
      el.classList.remove("panel--dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  // ---------------------------------------------------------------------------
  // Resize
  // ---------------------------------------------------------------------------

  let resizing: { startX: number; startY: number; origW: number; origH: number } | null = null;

  resizeHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const layout = getEditorState().panelLayouts[id];
    resizing = { startX: e.clientX, startY: e.clientY, origW: layout.width, origH: layout.height };
    el.classList.add("panel--resizing");

    const onMove = (ev: MouseEvent) => {
      if (!resizing) return;
      // Clamp resize to parent container bounds
      const parent = el.parentElement;
      const layout = getEditorState().panelLayouts[id];
      const maxW = parent ? parent.clientWidth - layout.x : Infinity;
      const maxH = parent ? parent.clientHeight - layout.y : Infinity;
      const nw = Math.max(minWidth, Math.min(maxW, resizing.origW + (ev.clientX - resizing.startX)));
      const nh = Math.max(minHeight, Math.min(maxH, resizing.origH + (ev.clientY - resizing.startY)));
      updatePanelLayout(id, { width: nw, height: nh });
    };

    const onUp = () => {
      resizing = null;
      el.classList.remove("panel--resizing");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  // ---------------------------------------------------------------------------
  // State sync
  // ---------------------------------------------------------------------------

  const unsub = subscribeEditor(() => applyLayout());

  // Append to theme zone (panels overlay the visual editor)
  const panelParent = document.getElementById("zone-theme") ?? document.getElementById("workspace")!;
  panelParent.appendChild(el);

  return {
    element: el,
    contentEl,
    destroy: () => {
      unsub();
      el.remove();
    },
  };
}
