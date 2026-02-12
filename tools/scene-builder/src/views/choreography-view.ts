/**
 * Choreography view — node-based editor (TouchDesigner style).
 *
 * Orchestrator module: creates a pannable/zoomable canvas in `#zone-choreographer`
 * and wires together the node renderer, drag system, and state subscriptions.
 *
 * The actual rendering, drag, and inline editing logic lives in:
 *   - node-canvas.ts    — pan/zoom surface with SVG grid
 *   - node-renderer.ts  — renders choreography nodes with ports
 *   - node-drag.ts      — drag-to-create from bar H + node repositioning
 *   - node-detail-inline.ts — inline step editor under selected node
 */

import { subscribeChoreography } from "../state/choreography-state.js";
import { subscribeWiring } from "../state/wiring-state.js";
import { subscribeActiveSource } from "../workspace/connector-bar-horizontal.js";
import { createNodeCanvas } from "./node-canvas.js";
import { renderAllNodes } from "./node-renderer.js";
import { initNodeDrag } from "./node-drag.js";
import type { NodeCanvas } from "./node-canvas.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let initialized = false;
let canvas: NodeCanvas | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize the Choreography view (node-based editor). Idempotent. */
export function initChoreographyView(): void {
  if (initialized) return;
  initialized = true;

  const zoneEl = document.getElementById("zone-choreographer");
  if (!zoneEl) return;

  // Create the pan/zoom canvas
  canvas = createNodeCanvas(zoneEl);

  // Initialize drag interactions (reposition + drag-to-create)
  initNodeDrag(canvas);

  // Initial render
  renderNodes();

  // Subscribe to state changes
  subscribeChoreography(renderNodes);
  subscribeWiring(renderNodes);
  subscribeActiveSource(renderNodes);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Re-render all nodes into the canvas. */
function renderNodes(): void {
  if (!canvas) return;
  renderAllNodes(canvas.nodesContainer);
}
