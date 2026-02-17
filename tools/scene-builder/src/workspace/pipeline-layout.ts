/**
 * Pipeline layout — horizontal rail with 4 nodes.
 *
 * Signal → Choreo → Visual → Shader
 *
 * Each node can be mini (140px) or extended (flex: 1).
 * Creates the DOM structure, syncs classes from pipelineLayout state,
 * and handles ResizeObserver for recalculation.
 */

import type { PipelineNodeId, ViewId } from "../types.js";
import {
  getEditorState,
  subscribeEditor,
  togglePipelineNode,
  focusPipelineNode,
  setActiveView,
} from "../state/editor-state.js";

// ---------------------------------------------------------------------------
// Brand SVG icons (inlined, matching view-tabs.ts style)
// ---------------------------------------------------------------------------

const ICON_SIGNAL = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none">
  <path d="M 8 24 C 12 18, 12 30, 16 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
  <path d="M 14 24 C 18 16, 18 32, 22 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
  <path d="M 20 24 C 24 14, 24 34, 28 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
  <circle cx="34" cy="24" r="4" fill="currentColor"/>
  <rect x="30" y="20" width="8" height="8" rx="2.5" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.4"/>
</svg>`;

const ICON_CHOREOGRAPHER = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none">
  <path d="M 8 36 C 14 20, 22 14, 28 22 C 34 30, 38 18, 42 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <circle cx="8" cy="36" r="3" fill="currentColor" opacity="0.4"/>
  <circle cx="20" cy="20" r="2.5" fill="currentColor" opacity="0.6"/>
  <circle cx="34" cy="22" r="2.5" fill="currentColor" opacity="0.6"/>
  <circle cx="42" cy="12" r="3.5" fill="currentColor"/>
</svg>`;

const ICON_VISUAL = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none">
  <rect x="6" y="12" width="28" height="24" rx="4" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.25"/>
  <rect x="10" y="10" width="28" height="24" rx="4" stroke="currentColor" stroke-width="1.8" fill="none" opacity="0.5"/>
  <rect x="14" y="8" width="28" height="24" rx="4" stroke="currentColor" stroke-width="2.2" fill="none" opacity="0.85"/>
  <circle cx="24" cy="20" r="3" fill="currentColor"/>
</svg>`;

const ICON_SHADER = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>
</svg>`;

// ---------------------------------------------------------------------------
// Node definitions
// ---------------------------------------------------------------------------

interface PipelineNodeDef {
  id: PipelineNodeId;
  label: string;
  icon: string;
  /** ID applied to .pl-node-content (preserves existing element IDs). */
  contentId: string;
}

const NODES: readonly PipelineNodeDef[] = [
  { id: "signal",        label: "Signal",  icon: ICON_SIGNAL,        contentId: "zone-signal" },
  { id: "choreographer", label: "Choreo",  icon: ICON_CHOREOGRAPHER, contentId: "zone-choreographer" },
  { id: "visual",        label: "Visual",  icon: ICON_VISUAL,        contentId: "zone-theme" },
  { id: "shader",        label: "Shader",  icon: ICON_SHADER,        contentId: "shader-node-content" },
];

/** Rail label between two adjacent nodes. */
const RAILS: readonly [string, string][] = [
  ["signal", "choreographer"],
  ["choreographer", "visual"],
  ["visual", "shader"],
];

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let pipelineEl: HTMLElement | null = null;
let nodeEls: Map<PipelineNodeId, HTMLElement> = new Map();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize the pipeline layout DOM. Call once before views are mounted. */
export function initPipelineLayout(): void {
  const workspace = document.getElementById("workspace");
  if (!workspace) return;

  // Remove old layout elements if they exist
  const oldZoneLeft = document.getElementById("zone-left");
  const oldRideau = document.getElementById("rideau");
  const oldZoneTheme = document.getElementById("zone-theme");
  oldZoneLeft?.remove();
  oldRideau?.remove();
  oldZoneTheme?.remove();

  // Create pipeline container
  pipelineEl = document.createElement("div");
  pipelineEl.id = "pipeline";
  pipelineEl.className = "pipeline";

  let nodeIdx = 0;
  for (const def of NODES) {
    // Rail separator before each node (except first)
    if (nodeIdx > 0) {
      const railKey = `${RAILS[nodeIdx - 1]![0]}-${RAILS[nodeIdx - 1]![1]}`;
      const rail = document.createElement("div");
      rail.className = "pl-rail";
      rail.id = `rail-${railKey}`;
      rail.dataset.rail = railKey;

      // Chevron arrow
      const arrow = document.createElement("div");
      arrow.className = "pl-rail-arrow";
      arrow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
      rail.appendChild(arrow);

      // Badge container (populated by connector bars)
      const badges = document.createElement("div");
      badges.className = "pl-rail-badges";
      rail.appendChild(badges);

      pipelineEl.appendChild(rail);
    }

    // Node
    const node = document.createElement("div");
    node.className = "pl-node";
    node.dataset.plNode = def.id;

    // Header
    const header = document.createElement("div");
    header.className = "pl-node-header";
    header.innerHTML = `${def.icon}<span>${def.label}</span>`;
    node.appendChild(header);

    // Mini preview placeholder
    const mini = document.createElement("div");
    mini.className = "pl-node-mini";
    node.appendChild(mini);

    // Content area (receives the legacy zone ID)
    const content = document.createElement("div");
    content.className = "pl-node-content";
    content.id = def.contentId;

    // For the visual node, create canvas + toolbar dock (left edge) + zoom-bar
    if (def.id === "visual") {
      content.classList.add("zone", "zone-theme");

      const toolbarDock = document.createElement("div");
      toolbarDock.id = "toolbar-dock";
      content.appendChild(toolbarDock);

      const canvasContainer = document.createElement("div");
      canvasContainer.id = "canvas-container";
      content.appendChild(canvasContainer);

      const zoomBar = createZoomBar();
      content.appendChild(zoomBar);
    } else if (def.id === "signal") {
      content.classList.add("zone", "zone-signal");
    } else if (def.id === "choreographer") {
      content.classList.add("zone", "zone-choreographer");
    }

    node.appendChild(content);
    pipelineEl.appendChild(node);
    nodeEls.set(def.id, node);

    nodeIdx++;
  }

  // Insert pipeline before the wiring overlay
  const wiringOverlay = document.getElementById("wiring-overlay");
  if (wiringOverlay) {
    workspace.insertBefore(pipelineEl, wiringOverlay);
  } else {
    workspace.appendChild(pipelineEl);
  }

  // Subscribe to state and apply initial layout
  subscribeEditor(applyPipelineLayout);
  applyPipelineLayout();

  // Recalculate on resize
  const ro = new ResizeObserver(applyPipelineLayout);
  ro.observe(pipelineEl);

  // Interactions
  initPipelineInteractions();
}

/** Get the pipeline node DOM element for a given node ID. */
export function getPipelineNodeEl(id: PipelineNodeId): HTMLElement | null {
  return nodeEls.get(id) ?? null;
}

// ---------------------------------------------------------------------------
// Layout sync
// ---------------------------------------------------------------------------

/** Apply pipeline layout classes from editor state. */
function applyPipelineLayout(): void {
  const { pipelineLayout } = getEditorState();
  const extendedSet = new Set(pipelineLayout.extended);

  for (const [id, el] of nodeEls) {
    const isExtended = extendedSet.has(id);
    el.classList.toggle("pl-node--mini", !isExtended);
    el.classList.toggle("pl-node--extended", isExtended);
  }
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

/** Map pipeline node IDs to ViewId for setActiveView (keyboard focus). */
const NODE_TO_VIEW: Partial<Record<PipelineNodeId, ViewId>> = {
  signal: "signal",
  choreographer: "orchestrator",
  visual: "visual",
};

/** Map keyboard keys to pipeline nodes. */
const KEY_TO_NODE: Record<string, PipelineNodeId> = {
  "1": "signal",
  "2": "choreographer",
  "3": "visual",
  "4": "shader",
};

/** Initialize click, double-click, and keyboard interactions. */
function initPipelineInteractions(): void {
  // Click on mini node → extend it
  for (const [id, el] of nodeEls) {
    el.addEventListener("click", (e: MouseEvent) => {
      if (!el.classList.contains("pl-node--mini")) return;
      // Don't trigger if clicking a button/link inside the node
      if ((e.target as HTMLElement).closest("button, a")) return;
      togglePipelineNode(id);
    });

    // Double-click header → solo focus
    const header = el.querySelector(".pl-node-header");
    if (header) {
      header.addEventListener("dblclick", (e: Event) => {
        e.preventDefault();
        focusPipelineNode(id);
      });
    }

    // Pointer down on content → set active view (keyboard focus)
    const content = el.querySelector(".pl-node-content");
    if (content) {
      content.addEventListener("pointerdown", () => {
        const viewId = NODE_TO_VIEW[id];
        if (viewId) setActiveView(viewId);
      });
    }
  }

  // Keyboard: 1/2/3/4 to extend nodes
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    // Guard: skip if typing in inputs, textareas, selects, or CodeMirror
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if ((e.target as HTMLElement).closest(".cm-editor")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const nodeId = KEY_TO_NODE[e.key];
    if (nodeId) {
      e.preventDefault();
      togglePipelineNode(nodeId);
    }
  });
}

// ---------------------------------------------------------------------------
// Zoom bar DOM (moved from index.html)
// ---------------------------------------------------------------------------

/** Create the zoom bar DOM element. */
function createZoomBar(): HTMLElement {
  const zoomBar = document.createElement("div");
  zoomBar.id = "zoom-bar";
  zoomBar.innerHTML = `
    <button id="zoom-out" class="zoom-btn" title="Zoom out (-)">&#8722;</button>
    <button id="zoom-level" class="zoom-level" title="Click for presets">100%</button>
    <button id="zoom-in" class="zoom-btn" title="Zoom in (+)">&#43;</button>
    <button id="view-mode-toggle" class="zoom-btn view-mode-btn" title="Toggle isometric view (I)">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    </button>
    <div id="zoom-presets" class="zoom-presets">
      <div class="zoom-presets-inner">
        <button data-zoom="0.25">25%</button>
        <button data-zoom="0.5">50%</button>
        <button data-zoom="1">100%</button>
        <button data-zoom="2">200%</button>
        <button data-zoom="fit">Fit</button>
      </div>
    </div>`;
  return zoomBar;
}
