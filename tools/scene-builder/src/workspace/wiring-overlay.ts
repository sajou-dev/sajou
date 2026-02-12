/**
 * Wiring overlay — SVG bezier curves between connected zone endpoints.
 *
 * Renders an absolutely positioned `<svg>` covering the entire `#workspace`.
 * Each WireConnection produces a solid cubic bezier curve. A preview wire
 * (dashed, accent-colored) is drawn during drag-to-connect interactions.
 *
 * Three wire layers (TouchDesigner-style):
 *   1. signal → signal-type : intra bar-H horizontal S-curve
 *   2. signal-type → choreographer : vertical S-curve (bar-H down to node)
 *   3. choreographer → theme : horizontal S-curve (across the rideau)
 *
 * Wire endpoints are resolved from DOM badge positions using
 * `getBoundingClientRect()`. The overlay recalculates on:
 *   - window resize
 *   - rideau drag (editor state change)
 *   - wiring state change
 *   - choreography state change (node moved/added/removed)
 */

import {
  getWiringState,
  removeWire,
  subscribeWiring,
  type WireConnection,
  type WireZone,
} from "../state/wiring-state.js";
import { subscribeEditor } from "../state/editor-state.js";
import { subscribeChoreography } from "../state/choreography-state.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";
const WIRE_COLOR = "#E8A851";
const WIRE_PREVIEW_COLOR = "#E8A851";
const WIRE_WIDTH = 2;
const WIRE_HOVER_WIDTH = 4;
const CONTROL_POINT_OFFSET = 60;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let svgEl: SVGSVGElement | null = null;
let workspaceEl: HTMLElement | null = null;
let initialized = false;

/** Current preview wire (set by wiring-drag during drag, null otherwise). */
let previewWire: PreviewWire | null = null;

/** Preview wire descriptor set externally by wiring-drag. */
export interface PreviewWire {
  /** Badge element the drag started from. */
  fromBadge: HTMLElement;
  /** Zone of the source badge — determines wire routing style. */
  fromZone: WireZone;
  /** Current cursor position in page coordinates. */
  cursorX: number;
  cursorY: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize the wiring overlay. Call once after DOM is ready. */
export function initWiringOverlay(): void {
  if (initialized) return;
  initialized = true;

  svgEl = document.getElementById("wiring-overlay") as SVGSVGElement | null;
  workspaceEl = document.getElementById("workspace");
  if (!svgEl || !workspaceEl) return;

  // Subscribe to state changes that affect wire positions
  subscribeWiring(renderWires);
  subscribeEditor(renderWires);
  subscribeChoreography(renderWires);
  window.addEventListener("resize", renderWires);

  renderWires();
}

/** Update the preview wire. Called by wiring-drag on every mousemove. */
export function setPreviewWire(preview: PreviewWire | null): void {
  previewWire = preview;
  renderWires();
}

/** Force a re-render (called externally if needed). */
export function refreshWiringOverlay(): void {
  renderWires();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderWires(): void {
  if (!svgEl || !workspaceEl) return;

  // Size SVG to match workspace
  const wsRect = workspaceEl.getBoundingClientRect();
  svgEl.setAttribute("width", String(wsRect.width));
  svgEl.setAttribute("height", String(wsRect.height));
  svgEl.setAttribute("viewBox", `0 0 ${wsRect.width} ${wsRect.height}`);

  // Clear existing paths
  while (svgEl.firstChild) {
    svgEl.removeChild(svgEl.firstChild);
  }

  const { wires } = getWiringState();

  // Render established wires
  for (const wire of wires) {
    const path = createWirePath(wire, wsRect);
    if (path) {
      svgEl.appendChild(path);
    }
  }

  // Render preview wire
  if (previewWire) {
    const previewPath = createPreviewPath(previewWire, wsRect);
    if (previewPath) {
      svgEl.appendChild(previewPath);
    }
  }
}

/**
 * Create an SVG path element for an established wire.
 * Returns null if source/target badges are not found in the DOM.
 */
function createWirePath(wire: WireConnection, wsRect: DOMRect): SVGPathElement | null {
  const fromBadge = findBadge(wire.fromZone, wire.fromId);
  // For signal-type→choreographer wires, target the specific input port by signal type
  const toBadge = wire.fromZone === "signal-type" && wire.toZone === "choreographer"
    ? findBadge(wire.toZone, wire.toId, wire.fromId)
    : findBadge(wire.toZone, wire.toId);
  if (!fromBadge || !toBadge) return null;

  const fromRect = fromBadge.getBoundingClientRect();
  const toRect = toBadge.getBoundingClientRect();

  const endpoints = resolveEndpoints(wire.fromZone, wire.toZone, fromRect, toRect, wsRect);
  if (!endpoints) return null;

  const { fromX, fromY, toX, toY, curveDirection, cpOffset } = endpoints;
  const d = buildBezierD(fromX, fromY, toX, toY, curveDirection, cpOffset);

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", WIRE_COLOR);
  path.setAttribute("stroke-width", String(WIRE_WIDTH));
  path.setAttribute("stroke-linecap", "round");
  path.classList.add("wire-path");
  path.dataset.wireId = wire.id;

  // Invisible wider hit area for hover/click
  const hitArea = document.createElementNS(SVG_NS, "path");
  hitArea.setAttribute("d", d);
  hitArea.setAttribute("fill", "none");
  hitArea.setAttribute("stroke", "transparent");
  hitArea.setAttribute("stroke-width", "12");
  hitArea.setAttribute("stroke-linecap", "round");
  hitArea.style.cursor = "pointer";
  hitArea.dataset.wireId = wire.id;

  // Hover effect on hit area
  hitArea.addEventListener("mouseenter", () => {
    path.setAttribute("stroke-width", String(WIRE_HOVER_WIDTH));
    path.classList.add("wire-path--hover");
  });
  hitArea.addEventListener("mouseleave", () => {
    path.setAttribute("stroke-width", String(WIRE_WIDTH));
    path.classList.remove("wire-path--hover");
  });

  // Right-click to delete wire
  hitArea.addEventListener("contextmenu", (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeWire(wire.id);
  });

  // Group path + hit area together
  const group = document.createElementNS(SVG_NS, "g");
  group.appendChild(path);
  group.appendChild(hitArea);

  // We return the group; caller expects SVGElement — cast to match
  return group as unknown as SVGPathElement;
}

/**
 * Create an SVG path for the preview (dashed) wire during drag.
 */
function createPreviewPath(preview: PreviewWire, wsRect: DOMRect): SVGPathElement | null {
  const fromRect = preview.fromBadge.getBoundingClientRect();

  let fromX: number;
  let fromY: number;
  const toX = preview.cursorX - wsRect.left;
  const toY = preview.cursorY - wsRect.top;
  let curveDir: "vertical" | "horizontal";

  if (preview.fromZone === "signal") {
    // Intra bar-H: right edge of source badge → cursor (horizontal S-curve)
    fromX = fromRect.right - wsRect.left;
    fromY = fromRect.top + fromRect.height / 2 - wsRect.top;
    curveDir = "horizontal";
  } else if (preview.fromZone === "signal-type") {
    // Bar-H badge → down to choreo node (vertical S-curve)
    fromX = fromRect.left + fromRect.width / 2 - wsRect.left;
    fromY = fromRect.bottom - wsRect.top;
    curveDir = "vertical";
  } else {
    // Choreographer → theme: right edge → left (horizontal S-curve)
    fromX = fromRect.right - wsRect.left;
    fromY = fromRect.top + fromRect.height / 2 - wsRect.top;
    curveDir = "horizontal";
  }

  const cpOffset = Math.max(CONTROL_POINT_OFFSET * 0.6, Math.abs(
    curveDir === "vertical" ? toY - fromY : toX - fromX,
  ) * 0.35);

  const d = buildBezierD(fromX, fromY, toX, toY, curveDir, cpOffset);

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", WIRE_PREVIEW_COLOR);
  path.setAttribute("stroke-width", String(WIRE_WIDTH));
  path.setAttribute("stroke-dasharray", "6 4");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("opacity", "0.7");
  path.classList.add("wire-path", "wire-path--preview");

  return path;
}

// ---------------------------------------------------------------------------
// Endpoint resolution
// ---------------------------------------------------------------------------

/** Resolved wire endpoint coordinates and curve parameters. */
interface WireEndpoints {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  curveDirection: "vertical" | "horizontal";
  cpOffset: number;
}

/**
 * Resolve from/to pixel positions and curve direction for a wire connection.
 *
 * Three wire types:
 *   - signal → signal-type : intra bar-H, right→left, horizontal S-curve
 *   - signal-type → choreographer : bar-H → node, bottom→top, vertical S-curve
 *   - choreographer → theme : node → theme, right→left, horizontal S-curve
 */
function resolveEndpoints(
  fromZone: WireZone,
  toZone: WireZone,
  fromRect: DOMRect,
  toRect: DOMRect,
  wsRect: DOMRect,
): WireEndpoints | null {
  if (fromZone === "signal" && toZone === "signal-type") {
    // Intra bar-H: right-center of source badge → left-center of signal-type badge
    const fromX = fromRect.right - wsRect.left;
    const fromY = fromRect.top + fromRect.height / 2 - wsRect.top;
    const toX = toRect.left - wsRect.left;
    const toY = toRect.top + toRect.height / 2 - wsRect.top;
    const cpOffset = Math.max(CONTROL_POINT_OFFSET * 0.5, Math.abs(toX - fromX) * 0.4);
    return { fromX, fromY, toX, toY, curveDirection: "horizontal", cpOffset };
  }

  if (fromZone === "signal-type" && toZone === "choreographer") {
    // Bar-H → choreo node: bottom-center of signal-type badge → top-center of node port
    const fromX = fromRect.left + fromRect.width / 2 - wsRect.left;
    const fromY = fromRect.bottom - wsRect.top;
    const toX = toRect.left + toRect.width / 2 - wsRect.left;
    const toY = toRect.top - wsRect.top;
    const cpOffset = Math.max(CONTROL_POINT_OFFSET, Math.abs(toY - fromY) * 0.4);
    return { fromX, fromY, toX, toY, curveDirection: "vertical", cpOffset };
  }

  if (fromZone === "choreographer" && toZone === "theme") {
    // Choreo → theme: right-center of choreo badge → left-center of theme badge
    const fromX = fromRect.right - wsRect.left;
    const fromY = fromRect.top + fromRect.height / 2 - wsRect.top;
    const toX = toRect.left - wsRect.left;
    const toY = toRect.top + toRect.height / 2 - wsRect.top;
    const cpOffset = Math.max(CONTROL_POINT_OFFSET, Math.abs(toX - fromX) * 0.4);
    return { fromX, fromY, toX, toY, curveDirection: "horizontal", cpOffset };
  }

  // Unknown wire type
  return null;
}

// ---------------------------------------------------------------------------
// Bezier helpers
// ---------------------------------------------------------------------------

/**
 * Build a cubic bezier `d` attribute string.
 *
 * @param curveDirection - "vertical" = S-curve bends up/down (signal-type→choreo),
 *                          "horizontal" = S-curve bends left/right (signal→signal-type, choreo→theme).
 */
function buildBezierD(
  x1: number, y1: number,
  x2: number, y2: number,
  curveDirection: "vertical" | "horizontal",
  cpOffset: number,
): string {
  let cp1x: number, cp1y: number, cp2x: number, cp2y: number;

  if (curveDirection === "vertical") {
    // S-curve bending vertically (signal→choreo, top-to-bottom)
    cp1x = x1;
    cp1y = y1 + cpOffset;
    cp2x = x2;
    cp2y = y2 - cpOffset;
  } else {
    // S-curve bending horizontally (choreo→theme, left-to-right)
    cp1x = x1 + cpOffset;
    cp1y = y1;
    cp2x = x2 - cpOffset;
    cp2y = y2;
  }

  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
}

// ---------------------------------------------------------------------------
// Badge lookup
// ---------------------------------------------------------------------------

/**
 * Find a connector badge element in the DOM by zone and endpoint ID.
 * Badges are expected to have `data-wire-zone` and `data-wire-id` attributes.
 *
 * When `portType` is provided, tries to match a specific input port
 * (via `data-port-type`) first, falling back to any badge in the zone.
 */
function findBadge(zone: string, id: string, portType?: string): HTMLElement | null {
  if (portType) {
    const specific = document.querySelector(
      `[data-wire-zone="${zone}"][data-wire-id="${id}"][data-port-type="${portType}"]`,
    ) as HTMLElement | null;
    if (specific) return specific;
  }
  return document.querySelector(
    `[data-wire-zone="${zone}"][data-wire-id="${id}"]`,
  ) as HTMLElement | null;
}
