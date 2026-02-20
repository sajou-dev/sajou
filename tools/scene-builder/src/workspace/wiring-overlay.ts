/**
 * Wiring overlay — SVG wires between connected zone endpoints.
 *
 * Renders an absolutely positioned `<svg>` covering the entire `#workspace`.
 *
 * Wire layers:
 *   1. source → choreography : orthogonal 90° elbows (source identity color)
 *   2. choreographer → theme  : horizontal bezier S-curve
 *
 * Source→choreography lines are computed from provenance (two-hop wire
 * resolution), falling back to all connected sources when no explicit
 * signal→signal-type wires exist.
 *
 * Wire endpoints are resolved from DOM badge positions using
 * `getBoundingClientRect()`. The overlay recalculates on:
 *   - window resize
 *   - editor state change
 *   - wiring / choreography / signal source state change
 */

import {
  getWiringState,
  removeWire,
  subscribeWiring,
  type WireConnection,
  type WireZone,
} from "../state/wiring-state.js";
import { subscribeEditor } from "../state/editor-state.js";
import {
  getChoreographyState,
  subscribeChoreography,
} from "../state/choreography-state.js";
import {
  getSource,
  getSignalSourcesState,
  subscribeSignalSources,
} from "../state/signal-source-state.js";
import { getSourcesForChoreo } from "../state/wiring-queries.js";
import {
  getActiveBarHSource,
  subscribeActiveSource,
} from "./connector-bar-horizontal.js";
import { subscribeShaders } from "../shader-editor/shader-state.js";
import { getEditorState } from "../state/editor-state.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";
const WIRE_COLOR = "#E8A851";
const WIRE_PREVIEW_COLOR = "#E8A851";
const WIRE_SHADER_COLOR = "#7B61FF";
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
  subscribeSignalSources(renderWires);
  subscribeActiveSource(renderWires);
  subscribeShaders(renderWires);
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

  // Render established wires (skip signal→signal-type, signal-type→choreo,
  // and choreo→shader: these use dedicated orthogonal renderers below)
  for (const wire of wires) {
    if (wire.fromZone === "signal" && wire.toZone === "signal-type") continue;
    if (wire.fromZone === "signal-type" && wire.toZone === "choreographer") continue;
    if (wire.fromZone === "choreographer" && wire.toZone === "shader") continue;
    const path = createWirePath(wire, wsRect);
    if (path) {
      svgEl.appendChild(path);
    }
  }

  // Computed source→choreography orthogonal lines
  renderSourceChoreoLines(wsRect);

  // Choreographer→shader orthogonal lines
  renderChoreoShaderLines(wsRect);

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

  // Resolve wire color and dimming based on source provenance
  const activeSource = getActiveBarHSource();
  let wireColor = WIRE_COLOR;
  let isDimmed = false;

  if (wire.fromZone === "signal" && wire.toZone === "signal-type") {
    // Signal→signal-type: use source identity color
    const source = getSource(wire.fromId);
    if (source) wireColor = source.color;
    // Dim if active source is set and this wire is from a different source
    if (activeSource && wire.fromId !== activeSource) isDimmed = true;
  } else if (wire.fromZone === "signal-type" && wire.toZone === "choreographer") {
    // Signal-type→choreographer: resolve source via 2-hop provenance
    const provenance = getSourcesForChoreo(wire.toId);
    if (provenance.length === 1) {
      // Single source → use its identity color
      const source = getSource(provenance[0]!.sourceId);
      if (source) wireColor = source.color;
    } else if (provenance.length > 1 && activeSource) {
      // Multiple sources but one is active → use its color
      const activeEntry = provenance.find((p) => p.sourceId === activeSource);
      if (activeEntry) {
        const source = getSource(activeSource);
        if (source) wireColor = source.color;
      }
    }
    // Dim if active source is set and this choreo is not connected to it
    if (activeSource) {
      const connected = provenance.some((p) => p.sourceId === activeSource);
      if (!connected) isDimmed = true;
    }
  } else if (wire.fromZone === "choreographer" && wire.toZone === "theme") {
    // Choreographer→theme: check if the choreo is connected to active source
    if (activeSource) {
      const provenance = getSourcesForChoreo(wire.fromId);
      const connected = provenance.some((p) => p.sourceId === activeSource);
      if (!connected) isDimmed = true;
    }
  }

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", wireColor);
  path.setAttribute("stroke-width", String(WIRE_WIDTH));
  path.setAttribute("stroke-linecap", "round");
  if (isDimmed) path.setAttribute("opacity", "0.12");
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
// Source → choreography orthogonal lines
// ---------------------------------------------------------------------------

/** Corner radius for orthogonal elbows. */
const ELBOW_RADIUS = 5;

/** Number of routing lanes for source→choreo lines. */
const LANE_COUNT = 4;

/** Width of the lane area (matches rack-list padding-left). */
const LANE_AREA_WIDTH = 32;

/**
 * Build an orthogonal (90°-elbow) SVG path from (x1,y1) to (x2,y2).
 *
 * Shape: horizontal → 90° bend → vertical → 90° bend → horizontal.
 * Uses quadratic bezier arcs for rounded corners at each bend.
 *
 * @param laneX - X position of the vertical segment (lane routing).
 *                If omitted, defaults to 40% of the horizontal distance.
 */
function buildOrthogonalD(
  x1: number, y1: number,
  x2: number, y2: number,
  laneX?: number,
): string {
  const dy = y2 - y1;

  // Nearly same Y — straight horizontal line
  if (Math.abs(dy) < 2) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const midX = laneX ?? x1 + (x2 - x1) * 0.4;
  const r = Math.min(ELBOW_RADIUS, Math.abs(dy) / 2, Math.abs(midX - x1) - 1, Math.abs(x2 - midX) - 1);

  if (r < 1) {
    // Too tight for rounded corners — use sharp elbows
    return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
  }

  const dySign = dy > 0 ? 1 : -1;

  return [
    `M ${x1} ${y1}`,
    `H ${midX - r}`,
    `Q ${midX} ${y1}, ${midX} ${y1 + dySign * r}`,
    `V ${y2 - dySign * r}`,
    `Q ${midX} ${y2}, ${midX + r} ${y2}`,
    `H ${x2}`,
  ].join(" ");
}

/**
 * Render computed source→choreography orthogonal lines.
 *
 * Uses two-hop provenance resolution: signal→signal-type wires determine
 * which source feeds which choreography (via its effective signal types).
 * Only draws lines when explicit provenance exists.
 *
 * Each source is assigned a routing lane (0–3) so vertical segments
 * don't overlap when multiple sources connect to the same zone.
 */
function renderSourceChoreoLines(wsRect: DOMRect): void {
  if (!svgEl) return;

  const { choreographies } = getChoreographyState();
  const { sources } = getSignalSourcesState();
  const activeSource = getActiveBarHSource();

  // Assign a lane index to each source (stable order by source array position)
  const sourceLaneMap = new Map<string, number>();
  const connectedSources = sources.filter((s) => s.status === "connected");
  for (let i = 0; i < connectedSources.length; i++) {
    sourceLaneMap.set(connectedSources[i]!.id, i % LANE_COUNT);
  }

  // Resolve the lane area X range: from the right edge of the rail to
  // the rack-list left padding area. We compute it from the first
  // choreography badge position (toX - LANE_AREA_WIDTH .. toX).
  let laneAreaRight = 0;

  for (const choreo of choreographies) {
    const provenance = getSourcesForChoreo(choreo.id);
    if (provenance.length === 0) continue;

    // Deduplicate source→choreo pairs
    const seen = new Set<string>();
    for (const p of provenance) {
      if (seen.has(p.sourceId)) continue;
      seen.add(p.sourceId);

      const src = sources.find((s) => s.id === p.sourceId);
      if (!src) continue;

      const fromBadge = findBadge("signal", src.id);
      const toBadge = findBadge("choreographer", choreo.id);
      if (!fromBadge || !toBadge) continue;

      const fromRect = fromBadge.getBoundingClientRect();
      const toRect = toBadge.getBoundingClientRect();
      if (fromRect.width === 0 || toRect.width === 0) continue;

      const fromX = fromRect.right - wsRect.left;
      const fromY = fromRect.top + fromRect.height / 2 - wsRect.top;
      const toX = toRect.left - wsRect.left;
      const toY = toRect.top + toRect.height / 2 - wsRect.top;

      // Compute lane X for this source's vertical segment
      if (laneAreaRight === 0) laneAreaRight = toX;
      const laneIdx = sourceLaneMap.get(src.id) ?? 0;
      const laneSpacing = LANE_AREA_WIDTH / (LANE_COUNT + 1);
      const laneX = laneAreaRight - LANE_AREA_WIDTH + laneSpacing * (laneIdx + 1);

      const d = buildOrthogonalD(fromX, fromY, toX, toY, laneX);
      const isDimmed = activeSource ? src.id !== activeSource : false;

      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", src.color);
      path.setAttribute("stroke-width", String(WIRE_WIDTH));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      if (isDimmed) path.setAttribute("opacity", "0.15");
      path.classList.add("wire-path", "wire-path--source-choreo");

      svgEl.appendChild(path);
    }
  }
}

// ---------------------------------------------------------------------------
// Choreographer → shader orthogonal lines
// ---------------------------------------------------------------------------

/**
 * Render choreographer→shader wires as orthogonal elbows.
 *
 * Only visible when the shader node is extended — the V-bar and shader-bar
 * are adjacent with no Visual node between them, so the short orthogonal
 * route looks clean. When Visual is extended, the wires are hidden to avoid
 * lines cutting across the canvas.
 */
function renderChoreoShaderLines(wsRect: DOMRect): void {
  if (!svgEl) return;

  // Only draw when shader node is extended (badges are visible and close)
  const { pipelineLayout } = getEditorState();
  if (!pipelineLayout.extended.includes("shader")) return;

  const { wires } = getWiringState();
  const shaderWires = wires.filter(
    (w) => w.fromZone === "choreographer" && w.toZone === "shader",
  );
  if (shaderWires.length === 0) return;

  const activeSource = getActiveBarHSource();
  const { sources } = getSignalSourcesState();

  for (const wire of shaderWires) {
    const fromBadge = findBadge(wire.fromZone, wire.fromId);
    const toBadge = findBadge(wire.toZone, wire.toId);
    if (!fromBadge || !toBadge) continue;

    const fromRect = fromBadge.getBoundingClientRect();
    const toRect = toBadge.getBoundingClientRect();
    if (fromRect.width === 0 || toRect.width === 0) continue;

    const fromX = fromRect.right - wsRect.left;
    const fromY = fromRect.top + fromRect.height / 2 - wsRect.top;
    const toX = toRect.left - wsRect.left;
    const toY = toRect.top + toRect.height / 2 - wsRect.top;

    const laneX = fromX + (toX - fromX) * 0.5;
    const d = buildOrthogonalD(fromX, fromY, toX, toY, laneX);

    // Resolve source identity color via the parent choreography
    const choreoId = (fromBadge as HTMLElement).dataset.choreoId ?? "";
    const provenance = choreoId ? getSourcesForChoreo(choreoId) : [];

    let wireColor = WIRE_SHADER_COLOR;
    let isDimmed = false;

    if (provenance.length === 1) {
      const src = sources.find((s) => s.id === provenance[0]!.sourceId);
      if (src) wireColor = src.color;
    } else if (provenance.length > 1 && activeSource) {
      const activeEntry = provenance.find((p) => p.sourceId === activeSource);
      if (activeEntry) {
        const src = sources.find((s) => s.id === activeSource);
        if (src) wireColor = src.color;
      }
    }

    if (activeSource) {
      isDimmed = !provenance.some((p) => p.sourceId === activeSource);
    }

    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", wireColor);
    path.setAttribute("stroke-width", String(WIRE_WIDTH));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    if (isDimmed) path.setAttribute("opacity", "0.15");
    path.classList.add("wire-path", "wire-path--choreo-shader");

    // Hit area for hover/delete
    const hitArea = document.createElementNS(SVG_NS, "path");
    hitArea.setAttribute("d", d);
    hitArea.setAttribute("fill", "none");
    hitArea.setAttribute("stroke", "transparent");
    hitArea.setAttribute("stroke-width", "12");
    hitArea.setAttribute("stroke-linecap", "round");
    hitArea.style.cursor = "pointer";

    hitArea.addEventListener("mouseenter", () => {
      path.setAttribute("stroke-width", String(WIRE_HOVER_WIDTH));
      path.classList.add("wire-path--hover");
    });
    hitArea.addEventListener("mouseleave", () => {
      path.setAttribute("stroke-width", String(WIRE_WIDTH));
      path.classList.remove("wire-path--hover");
    });
    hitArea.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      removeWire(wire.id);
    });

    const group = document.createElementNS(SVG_NS, "g");
    group.appendChild(path);
    group.appendChild(hitArea);
    svgEl.appendChild(group);
  }
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
 * Pipeline layout: all wires are horizontal left-to-right between adjacent nodes.
 *   - signal → signal-type : intra signal node, right→left, horizontal S-curve
 *   - signal-type → choreographer : signal→choreo node, horizontal S-curve
 *   - choreographer → theme : choreo→visual node, horizontal S-curve
 */
function resolveEndpoints(
  fromZone: WireZone,
  toZone: WireZone,
  fromRect: DOMRect,
  toRect: DOMRect,
  wsRect: DOMRect,
): WireEndpoints | null {
  // All wire types now use horizontal S-curves in the pipeline layout
  const fromX = fromRect.right - wsRect.left;
  const fromY = fromRect.top + fromRect.height / 2 - wsRect.top;
  const toX = toRect.left - wsRect.left;
  const toY = toRect.top + toRect.height / 2 - wsRect.top;

  if (fromZone === "signal" && toZone === "signal-type") {
    const cpOffset = Math.max(CONTROL_POINT_OFFSET * 0.5, Math.abs(toX - fromX) * 0.4);
    return { fromX, fromY, toX, toY, curveDirection: "horizontal", cpOffset };
  }

  if (fromZone === "signal-type" && toZone === "choreographer") {
    const cpOffset = Math.max(CONTROL_POINT_OFFSET, Math.abs(toX - fromX) * 0.4);
    return { fromX, fromY, toX, toY, curveDirection: "horizontal", cpOffset };
  }

  if (fromZone === "choreographer" && toZone === "theme") {
    const cpOffset = Math.max(CONTROL_POINT_OFFSET, Math.abs(toX - fromX) * 0.4);
    return { fromX, fromY, toX, toY, curveDirection: "horizontal", cpOffset };
  }

  // Unknown wire type (choreo→shader handled by renderChoreoShaderLines)
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
