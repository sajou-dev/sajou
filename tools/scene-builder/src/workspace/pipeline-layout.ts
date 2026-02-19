/**
 * Pipeline layout — horizontal rail with 3 rails + code group.
 *
 * Signal ─rail─ Choreo ─rail─ Visual ─rail─ [ Shader │ p5.js ]
 *
 * Each node can be mini or extended (flex: 1).
 * Shader and p5 share a .pl-node-group wrapper with an internal separator.
 * Creates the DOM structure, syncs classes from pipelineLayout state,
 * and handles ResizeObserver for recalculation.
 */

import type { PipelineNodeId, ViewId } from "../types.js";
import { shouldSuppressShortcut } from "../shortcuts/shortcut-registry.js";
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
  <rect x="6" y="12" width="28" height="24" rx="4" stroke="currentColor" stroke-width="2" fill="none" opacity="0.3"/>
  <rect x="10" y="10" width="28" height="24" rx="4" stroke="currentColor" stroke-width="2.5" fill="none" opacity="0.6"/>
  <rect x="14" y="8" width="28" height="24" rx="4" stroke="currentColor" stroke-width="3" fill="none" opacity="0.9"/>
  <circle cx="24" cy="20" r="3" fill="currentColor"/>
</svg>`;

const ICON_SHADER = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none">
  <rect x="6" y="8" width="36" height="28" rx="4" stroke="currentColor" stroke-width="2.5" fill="none" opacity="0.8"/>
  <line x1="12" y1="32" x2="20" y2="12" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
  <line x1="20" y1="32" x2="28" y2="12" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
  <line x1="28" y1="32" x2="36" y2="12" stroke="currentColor" stroke-width="1.5" opacity="0.55"/>
  <path d="M 14 40 L 10 42 L 14 44" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>
  <path d="M 34 40 L 38 42 L 34 44" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>
</svg>`;

const ICON_P5 = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none">
  <rect x="8" y="6" width="32" height="32" rx="4" stroke="currentColor" stroke-width="2.5" fill="none" opacity="0.8"/>
  <path d="M 14 30 C 18 18, 26 14, 30 22 C 34 30, 36 16, 38 14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.5"/>
  <circle cx="16" cy="14" r="2.5" fill="currentColor" opacity="0.35"/>
  <circle cx="28" cy="28" r="3" fill="currentColor" opacity="0.5"/>
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

/** Nodes rendered in the main pipeline flow with rails between them. */
const REGULAR_NODES: readonly PipelineNodeDef[] = [
  { id: "signal",        label: "Signal",  icon: ICON_SIGNAL,        contentId: "zone-signal" },
  { id: "choreographer", label: "Choreo",  icon: ICON_CHOREOGRAPHER, contentId: "zone-choreographer" },
  { id: "visual",        label: "Visual",  icon: ICON_VISUAL,        contentId: "zone-theme" },
];

/** Nodes grouped in a shared code container (no rails between them). */
const CODE_GROUP_NODES: readonly PipelineNodeDef[] = [
  { id: "shader",        label: "Shader",  icon: ICON_SHADER,        contentId: "shader-node-content" },
  { id: "p5",            label: "p5.js",   icon: ICON_P5,            contentId: "p5-node-content" },
];

/** Rail separators between adjacent regular nodes + one before the code group. */
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
// DOM helpers
// ---------------------------------------------------------------------------

/** Create a rail separator element for the given pair. */
function createRail([from, to]: readonly [string, string]): HTMLElement {
  const railKey = `${from}-${to}`;
  const rail = document.createElement("div");
  rail.className = "pl-rail";
  rail.id = `rail-${railKey}`;
  rail.dataset.rail = railKey;

  const arrow = document.createElement("div");
  arrow.className = "pl-rail-arrow";
  arrow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  rail.appendChild(arrow);

  const badges = document.createElement("div");
  badges.className = "pl-rail-badges";
  rail.appendChild(badges);

  return rail;
}

/** Create a pipeline node element from its definition. */
function createNode(def: PipelineNodeDef): HTMLElement {
  const node = document.createElement("div");
  node.className = "pl-node";
  node.dataset.plNode = def.id;

  const header = document.createElement("div");
  header.className = "pl-node-header";
  header.innerHTML = `<span class="pl-node-header-inner">${def.icon}<span>${def.label}</span></span>`;
  node.appendChild(header);

  const mini = document.createElement("div");
  mini.className = "pl-node-mini";
  node.appendChild(mini);

  const content = document.createElement("div");
  content.className = "pl-node-content";
  content.id = def.contentId;

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
  return node;
}

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

  // --- Regular nodes with rail separators ---
  for (let i = 0; i < REGULAR_NODES.length; i++) {
    const def = REGULAR_NODES[i]!;

    // Rail separator before each node (except first)
    if (i > 0) {
      pipelineEl.appendChild(createRail(RAILS[i - 1]!));
    }

    const node = createNode(def);
    pipelineEl.appendChild(node);
    nodeEls.set(def.id, node);
  }

  // Rail between last regular node and the code group
  const lastRail = RAILS[REGULAR_NODES.length - 1];
  if (lastRail) {
    pipelineEl.appendChild(createRail(lastRail));
  }

  // --- Code group: Shader + p5 in a shared container ---
  const codeGroup = document.createElement("div");
  codeGroup.className = "pl-node-group";

  for (let i = 0; i < CODE_GROUP_NODES.length; i++) {
    const def = CODE_GROUP_NODES[i]!;

    // Thin separator between group members (not before first)
    if (i > 0) {
      const sep = document.createElement("div");
      sep.className = "pl-group-sep";
      codeGroup.appendChild(sep);
    }

    const node = createNode(def);
    codeGroup.appendChild(node);
    nodeEls.set(def.id, node);
  }

  pipelineEl.appendChild(codeGroup);

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
  "5": "p5",
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
    if (shouldSuppressShortcut(e)) return;
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
