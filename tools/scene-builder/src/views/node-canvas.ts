/**
 * Node canvas — pannable/zoomable 2D surface for choreography nodes.
 *
 * Pure DOM + CSS transforms (no PixiJS — that is the theme renderer).
 * Contains: background grid (SVG pattern), nodes container, and
 * coordinate transform helpers.
 *
 * Pan: middle-click drag or Space+LMB drag.
 * Zoom: scroll wheel, clamp [0.25, 3.0], zoom toward cursor.
 */

import type { NodeCanvasViewport } from "../types.js";
import { getEditorState, setNodeCanvasViewport } from "../state/editor-state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeCanvas {
  /** Root element (.nc-canvas). */
  el: HTMLElement;
  /** Container for nodes — CSS-transformed for pan/zoom. */
  nodesContainer: HTMLElement;
  /** Get current viewport state. */
  getViewport(): NodeCanvasViewport;
  /** Set viewport state and apply CSS transform. */
  setViewport(vp: NodeCanvasViewport): void;
  /** Convert page coordinates to canvas (node) coordinates. */
  pageToCanvas(pageX: number, pageY: number): { x: number; y: number };
  /** Destroy listeners. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3.0;
const ZOOM_FACTOR = 0.05;
const GRID_SIZE = 32;

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/** Create a node canvas inside the given container element. */
export function createNodeCanvas(container: HTMLElement): NodeCanvas {
  // ── Root ──
  const el = document.createElement("div");
  el.className = "nc-canvas";

  // ── SVG grid ──
  const gridSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  gridSvg.classList.add("nc-grid");
  gridSvg.setAttribute("width", "100%");
  gridSvg.setAttribute("height", "100%");

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
  pattern.id = "nc-grid-pattern";
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", String(GRID_SIZE));
  pattern.setAttribute("height", String(GRID_SIZE));

  const gridPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  gridPath.setAttribute("d", `M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`);
  gridPath.setAttribute("fill", "none");
  gridPath.setAttribute("stroke", "var(--color-border, #1E1E2E)");
  gridPath.setAttribute("stroke-width", "0.5");
  gridPath.setAttribute("stroke-opacity", "0.4");
  pattern.appendChild(gridPath);
  defs.appendChild(pattern);
  gridSvg.appendChild(defs);

  const gridRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  gridRect.setAttribute("width", "100%");
  gridRect.setAttribute("height", "100%");
  gridRect.setAttribute("fill", "url(#nc-grid-pattern)");
  gridSvg.appendChild(gridRect);

  el.appendChild(gridSvg);

  // ── Nodes container (pan/zoom transforms applied here) ──
  const nodesContainer = document.createElement("div");
  nodesContainer.className = "nc-nodes";
  el.appendChild(nodesContainer);

  container.appendChild(el);

  // ── Viewport state ──
  let viewport = { ...getEditorState().nodeCanvasViewport };

  function applyTransform(): void {
    nodesContainer.style.transform =
      `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`;

    // Update grid pattern to follow pan/zoom
    pattern.setAttribute("patternTransform",
      `translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`);
  }

  applyTransform();

  // ── Pan ──
  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartPanX = 0;
  let panStartPanY = 0;
  let spaceDown = false;

  function startPan(e: MouseEvent): void {
    panning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartPanX = viewport.panX;
    panStartPanY = viewport.panY;
    el.style.cursor = "grabbing";
    e.preventDefault();
  }

  el.addEventListener("mousedown", (e: MouseEvent) => {
    // Middle-click pan
    if (e.button === 1) {
      startPan(e);
      return;
    }
    // Space+LMB pan
    if (e.button === 0 && spaceDown) {
      startPan(e);
      return;
    }
    // Left-click on empty canvas background → pan
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (target === el || target.closest(".nc-grid") || target === nodesContainer) {
        startPan(e);
        return;
      }
    }
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!panning) return;
    viewport.panX = panStartPanX + (e.clientX - panStartX);
    viewport.panY = panStartPanY + (e.clientY - panStartY);
    applyTransform();
  });

  document.addEventListener("mouseup", (e: MouseEvent) => {
    if (!panning) return;
    if (e.button === 1 || e.button === 0) {
      panning = false;
      el.style.cursor = "";
      setNodeCanvasViewport({ ...viewport });
    }
  });

  // Track space key for space+click pan
  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === "Space" && !spaceDown) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      spaceDown = true;
      el.style.cursor = "grab";
      e.preventDefault();
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.code === "Space") {
      spaceDown = false;
      if (!panning) el.style.cursor = "";
    }
  }

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);

  // ── Zoom (scroll wheel, zoom toward cursor) ──
  el.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault();

    const direction = e.deltaY > 0 ? -1 : 1;
    const oldZoom = viewport.zoom;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom + direction * ZOOM_FACTOR * oldZoom));

    if (newZoom === oldZoom) return;

    // Zoom toward cursor position
    const rect = el.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // Adjust pan to keep the point under cursor fixed
    viewport.panX = cursorX - (cursorX - viewport.panX) * (newZoom / oldZoom);
    viewport.panY = cursorY - (cursorY - viewport.panY) * (newZoom / oldZoom);
    viewport.zoom = newZoom;

    applyTransform();
    setNodeCanvasViewport({ ...viewport });
  }, { passive: false });

  // ── Coordinate transforms ──
  function pageToCanvas(pageX: number, pageY: number): { x: number; y: number } {
    const rect = el.getBoundingClientRect();
    const localX = pageX - rect.left;
    const localY = pageY - rect.top;
    return {
      x: (localX - viewport.panX) / viewport.zoom,
      y: (localY - viewport.panY) / viewport.zoom,
    };
  }

  // ── Cleanup ──
  function destroy(): void {
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    el.remove();
  }

  return {
    el,
    nodesContainer,
    getViewport: () => ({ ...viewport }),
    setViewport(vp: NodeCanvasViewport) {
      viewport = { ...vp };
      applyTransform();
    },
    pageToCanvas,
    destroy,
  };
}
