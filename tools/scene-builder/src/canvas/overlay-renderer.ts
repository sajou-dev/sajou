/**
 * Canvas2D overlay renderer.
 *
 * All editor overlay drawing functions: selection, positions, routes,
 * route creation preview, actor badges, topology, binding highlight,
 * and zone grid. These draw on the transparent Canvas2D overlay that
 * sits on top of the Three.js WebGL canvas.
 *
 * All functions receive the Canvas2D context pre-transformed to
 * scene coordinates (via setTransform with zoom/pan).
 */

import { getSceneState } from "../state/scene-state.js";
import { getEditorState } from "../state/editor-state.js";
import { getEntityStore } from "../state/entity-store.js";
import { isRunModeActive } from "../run-mode/run-mode-state.js";
import { buildPathPoints } from "../tools/route-tool.js";
import { flattenRoutePath } from "../tools/route-math.js";
import type { EntityEntry } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse hex color string to numeric (e.g. "#E8A851" → 0xE8A851). */
function parseHexColor(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

/** Convert hex string + alpha to "rgba(r,g,b,a)". */
function hexAlpha(hex: string, alpha: number): string {
  const n = parseHexColor(hex);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Convert numeric color + alpha to "rgba(r,g,b,a)". */
function numAlpha(n: number, alpha: number): string {
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Darken a hex color by a factor (0-1). */
function darkenColor(hex: string, factor: number): string {
  const clean = hex.replace("#", "");
  const r = Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) * (1 - factor)));
  const g = Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) * (1 - factor)));
  const b = Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) * (1 - factor)));
  return `rgb(${r},${g},${b})`;
}

/** Resolve entity definition. */
function getEntityDef(entityId: string): EntityEntry | null {
  const store = getEntityStore();
  return store.entities[entityId] ?? null;
}

// ---------------------------------------------------------------------------
// Zone grid
// ---------------------------------------------------------------------------

/** Render the painted zone grid overlay. */
export function renderZoneGrid(ctx: CanvasRenderingContext2D, _zoom: number): void {
  if (isRunModeActive()) return;

  const { zoneGrid, zoneTypes } = getSceneState();
  const { activeTool } = getEditorState();
  const isBackgroundTool = activeTool === "background";
  const alpha = isBackgroundTool ? 0.35 : 0.12;

  const colorMap = new Map<string, string>();
  for (const zt of zoneTypes) {
    colorMap.set(zt.id, zt.color);
  }

  const { cellSize, cols, rows, cells } = zoneGrid;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const zoneId = cells[r * cols + c];
      if (zoneId === null || zoneId === undefined) continue;
      const color = colorMap.get(zoneId);
      if (!color) continue;

      ctx.fillStyle = hexAlpha(color, alpha);
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }
}

// ---------------------------------------------------------------------------
// Selection overlay
// ---------------------------------------------------------------------------

/** Render selection highlights around selected entities. */
export function renderSelection(ctx: CanvasRenderingContext2D, zoom: number): void {
  if (isRunModeActive()) return;

  const { selectedIds } = getEditorState();
  if (selectedIds.length === 0) return;

  const { entities } = getSceneState();

  for (const id of selectedIds) {
    const placed = entities.find((e) => e.id === id);
    if (!placed) continue;

    const def = getEntityDef(placed.entityId);
    const w = (def?.displayWidth ?? 32) * placed.scale;
    const h = (def?.displayHeight ?? 32) * placed.scale;
    const ax = def?.defaults.anchor?.[0] ?? 0.5;
    const ay = def?.defaults.anchor?.[1] ?? 0.5;

    const left = placed.x - w * ax;
    const top = placed.y - h * ay;

    // Selection rectangle
    ctx.strokeStyle = "#58a6ff";
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(left - 2, top - 2, w + 4, h + 4);

    // Corner handles
    const hs = 5;
    ctx.fillStyle = "#58a6ff";
    const corners = [
      { x: left, y: top },
      { x: left + w, y: top },
      { x: left, y: top + h },
      { x: left + w, y: top + h },
    ];
    for (const c of corners) {
      ctx.fillRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
    }
  }
}

// ---------------------------------------------------------------------------
// Binding drag highlight
// ---------------------------------------------------------------------------

/** Render binding drag highlights around actor entities. */
export function renderBindingHighlight(ctx: CanvasRenderingContext2D, zoom: number): void {
  const { bindingDragActive, bindingDropHighlightId } = getEditorState();
  if (!bindingDragActive) return;

  const { entities } = getSceneState();

  for (const placed of entities) {
    if (!placed.visible) continue;

    const def = getEntityDef(placed.entityId);
    const w = (def?.displayWidth ?? 32) * placed.scale;
    const h = (def?.displayHeight ?? 32) * placed.scale;
    const ax = def?.defaults.anchor?.[0] ?? 0.5;
    const ay = def?.defaults.anchor?.[1] ?? 0.5;

    const left = placed.x - w * ax;
    const top = placed.y - h * ay;
    const isHovered = placed.id === bindingDropHighlightId;

    ctx.strokeStyle = numAlpha(0xe8a851, isHovered ? 0.9 : 0.3);
    ctx.lineWidth = (isHovered ? 2.5 : 1) / zoom;
    ctx.strokeRect(left - 3, top - 3, w + 6, h + 6);
  }
}

// ---------------------------------------------------------------------------
// Position markers
// ---------------------------------------------------------------------------

const TYPE_HINT_BADGES: Record<string, string> = {
  spawn: "S",
  waypoint: "W",
  destination: "D",
};

/** Render position markers. */
export function renderPositions(ctx: CanvasRenderingContext2D, zoom: number): void {
  if (isRunModeActive()) return;

  const { positions } = getSceneState();
  const { activeTool, selectedPositionIds } = getEditorState();
  const isPositionTool = activeTool === "position";

  ctx.globalAlpha = isPositionTool ? 1 : 0.4;

  for (const pos of positions) {
    const isSelected = selectedPositionIds.includes(pos.id);
    const size = isSelected ? 8 : 6;

    // Diamond marker
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - size);
    ctx.lineTo(pos.x + size, pos.y);
    ctx.lineTo(pos.x, pos.y + size);
    ctx.lineTo(pos.x - size, pos.y);
    ctx.closePath();

    ctx.fillStyle = pos.color;
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = "#58a6ff";
      ctx.lineWidth = 2 / zoom;
    } else {
      ctx.strokeStyle = darkenColor(pos.color, 0.3);
      ctx.lineWidth = 1 / zoom;
    }
    ctx.stroke();

    // Type hint badge letter
    const badge = TYPE_HINT_BADGES[pos.typeHint];
    if (badge) {
      ctx.save();
      ctx.font = `bold ${7 / zoom}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#000000";
      ctx.fillText(badge, pos.x, pos.y);
      ctx.restore();
    }

    // Name label above
    ctx.save();
    const fontSize = 10 / zoom;
    ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    const labelY = pos.y - size - 4 / zoom;
    const metrics = ctx.measureText(pos.name);
    const pad = 3 / zoom;
    const pillW = metrics.width + pad * 2;
    const pillH = fontSize + pad;

    // Label pill background
    ctx.fillStyle = numAlpha(isSelected ? 0x58a6ff : 0x0e0e16, 0.85);
    roundRect(ctx, pos.x - pillW / 2, labelY - pillH, pillW, pillH, 3 / zoom);
    ctx.fill();

    // Label text
    ctx.fillStyle = "#ffffff";
    ctx.fillText(pos.name, pos.x, labelY);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Route rendering
// ---------------------------------------------------------------------------

/** Draw an arrowhead at a given tip, pointing from (fromX, fromY). */
function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  tipX: number, tipY: number,
  fromX: number, fromY: number,
  size: number,
  color: string,
): void {
  const dx = tipX - fromX;
  const dy = tipY - fromY;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const baseX = tipX - ux * size;
  const baseY = tipY - uy * size;

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + px * size * 0.5, baseY + py * size * 0.5);
  ctx.lineTo(baseX - px * size * 0.5, baseY - py * size * 0.5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Draw a dashed polyline. */
function drawDashedPolyline(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number }>,
  dashLen: number,
  gapLen: number,
  color: string,
  width: number,
): void {
  if (pts.length < 2) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([dashLen, gapLen]);

  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i]!.x, pts[i]!.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Render routes in scene coordinates. */
export function renderRoutes(ctx: CanvasRenderingContext2D, zoom: number): void {
  if (isRunModeActive()) return;

  const { routes } = getSceneState();
  const { activeTool, selectedRouteIds } = getEditorState();
  const isRouteTool = activeTool === "route";

  for (const route of routes) {
    const points = buildPathPoints(route);
    if (points.length < 2) continue;

    const isSelected = selectedRouteIds.includes(route.id);
    const color = route.color;
    const lineWidth = (isSelected ? 2.5 : 1.5) / zoom;
    const lineAlpha = isSelected ? 1 : 0.8;

    ctx.globalAlpha = isRouteTool ? lineAlpha : 0.3 * lineAlpha;

    // Path line
    if (route.style === "dashed") {
      const flat = flattenRoutePath(points, route.points);
      drawDashedPolyline(ctx, flat, 8 / zoom, 5 / zoom, color, lineWidth);
    } else {
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);

      for (let i = 1; i < points.length; i++) {
        const curr = points[i]!;
        const rp = route.points[i]!;

        if (rp.cornerStyle === "smooth" && i < points.length - 1) {
          const next = points[i + 1]!;
          const midX = (curr.x + next.x) / 2;
          const midY = (curr.y + next.y) / 2;
          ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
        } else {
          ctx.lineTo(curr.x, curr.y);
        }
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    // Arrowhead at end
    const lastPt = points[points.length - 1]!;
    const prevPt = points[points.length - 2]!;
    drawArrowhead(ctx, lastPt.x, lastPt.y, prevPt.x, prevPt.y, 8 / zoom, color);

    // Bidirectional: arrow at start
    if (route.bidirectional) {
      const firstPt = points[0]!;
      const secondPt = points[1]!;
      drawArrowhead(ctx, firstPt.x, firstPt.y, secondPt.x, secondPt.y, 8 / zoom, color);
    }

    // Point handles (when route tool active and route selected)
    if (isRouteTool && isSelected) {
      for (let pi = 0; pi < route.points.length; pi++) {
        const rp = route.points[pi]!;
        const handleSize = 4 / zoom;
        const isEndpoint = pi === 0 || pi === route.points.length - 1;

        ctx.beginPath();
        if (rp.cornerStyle === "smooth") {
          ctx.arc(rp.x, rp.y, handleSize, 0, Math.PI * 2);
        } else {
          ctx.rect(rp.x - handleSize, rp.y - handleSize, handleSize * 2, handleSize * 2);
        }

        ctx.fillStyle = isEndpoint ? color : "#ffffff";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 / zoom;
        ctx.stroke();

        // Waypoint name label
        if (rp.name) {
          ctx.save();
          const fs = 8 / zoom;
          ctx.font = `${fs}px "JetBrains Mono", monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";

          const wpLabelY = rp.y + handleSize + 3 / zoom;
          const wpMetrics = ctx.measureText(rp.name);
          const wpPad = 2 / zoom;
          const wpPillW = wpMetrics.width + wpPad * 2;
          const wpPillH = fs + wpPad;

          ctx.fillStyle = numAlpha(0x0e0e16, 0.85);
          roundRect(ctx, rp.x - wpPillW / 2, wpLabelY - wpPad / 2, wpPillW, wpPillH, 2 / zoom);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.fillText(rp.name, rp.x, wpLabelY);
          ctx.restore();
        }
      }
    }

    // Route name label (when selected)
    if (isSelected) {
      ctx.save();
      const midIdx = Math.floor(points.length / 2);
      const midPt = points[midIdx]!;
      const fs = 9 / zoom;
      ctx.font = `${fs}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";

      const nameLabelY = midPt.y - 8 / zoom;
      const nameMetrics = ctx.measureText(route.name);
      const pad = 3 / zoom;
      const pillW = nameMetrics.width + pad * 2;
      const pillH = fs + pad;

      ctx.fillStyle = numAlpha(0x0e0e16, 0.85);
      roundRect(ctx, midPt.x - pillW / 2, nameLabelY - pillH, pillW, pillH, 3 / zoom);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.fillText(route.name, midPt.x, nameLabelY);
      ctx.restore();
    }
  }

  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Route creation preview
// ---------------------------------------------------------------------------

/** Render the live preview during route creation. */
export function renderRouteCreationPreview(ctx: CanvasRenderingContext2D, zoom: number): void {
  if (isRunModeActive()) return;

  const { routeCreationPreview } = getEditorState();
  if (!routeCreationPreview) return;

  const { points, cursor } = routeCreationPreview;
  if (points.length === 0) return;

  const previewColor = "#e8a851";

  // Draw placed segments
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    const curr = points[i]!;
    if (curr.cornerStyle === "smooth" && i < points.length - 1) {
      const next = points[i + 1]!;
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
    } else {
      ctx.lineTo(curr.x, curr.y);
    }
  }
  ctx.strokeStyle = previewColor;
  ctx.lineWidth = 2 / zoom;
  ctx.globalAlpha = 0.9;
  ctx.stroke();

  // Dashed line from last point to cursor
  if (cursor && points.length > 0) {
    const last = points[points.length - 1]!;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(cursor.x, cursor.y);
    ctx.strokeStyle = previewColor;
    ctx.lineWidth = 1 / zoom;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  // Point handles
  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!;
    const isFirst = i === 0;
    const handleSize = (isFirst ? 5 : 4) / zoom;

    ctx.beginPath();
    if (pt.cornerStyle === "smooth") {
      ctx.arc(pt.x, pt.y, handleSize, 0, Math.PI * 2);
    } else {
      ctx.rect(pt.x - handleSize, pt.y - handleSize, handleSize * 2, handleSize * 2);
    }
    ctx.fillStyle = isFirst ? previewColor : "#ffffff";
    ctx.fill();
    ctx.strokeStyle = previewColor;
    ctx.lineWidth = 1.5 / zoom;
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Actor badges
// ---------------------------------------------------------------------------

/** Render small diamond badges on entities that have a semanticId. */
export function renderActorBadges(ctx: CanvasRenderingContext2D, _zoom: number): void {
  if (isRunModeActive()) return;

  const { entities } = getSceneState();
  const entityStore = getEntityStore();

  for (const placed of entities) {
    if (!placed.semanticId || !placed.visible) continue;

    const def = entityStore.entities[placed.entityId];
    const w = (def?.displayWidth ?? 32) * placed.scale;
    const h = (def?.displayHeight ?? 32) * placed.scale;
    const ax = def?.defaults.anchor?.[0] ?? 0.5;
    const ay = def?.defaults.anchor?.[1] ?? 0.5;

    const right = placed.x + w * (1 - ax);
    const top = placed.y - h * ay;
    const bx = right - 2;
    const by = top + 2;
    const bs = 4;

    ctx.beginPath();
    ctx.moveTo(bx, by - bs);
    ctx.lineTo(bx + bs, by);
    ctx.lineTo(bx, by + bs);
    ctx.lineTo(bx - bs, by);
    ctx.closePath();
    ctx.fillStyle = numAlpha(0xe8a851, 0.9);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Topology overlay
// ---------------------------------------------------------------------------

/** Render topology overlay when a single actor entity is selected. */
export function renderTopologyOverlay(ctx: CanvasRenderingContext2D, zoom: number): void {
  if (isRunModeActive()) return;

  const { selectedIds, topologyAssociationPreview } = getEditorState();
  const { entities, positions, routes } = getSceneState();

  const ACCENT = "#e8a851";

  // Association preview line (Alt+drag)
  if (topologyAssociationPreview) {
    const { fromX, fromY, toX, toY } = topologyAssociationPreview;
    drawDashedPolyline(
      ctx,
      [{ x: fromX, y: fromY }, { x: toX, y: toY }],
      6 / zoom, 4 / zoom, ACCENT, 1.5 / zoom,
    );
    ctx.beginPath();
    ctx.arc(toX, toY, 6 / zoom, 0, Math.PI * 2);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5 / zoom;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (selectedIds.length !== 1) return;

  const placed = entities.find((e) => e.id === selectedIds[0]);
  if (!placed?.semanticId || !placed.topology) return;

  const topo = placed.topology;
  const allPositionIds = new Set<string>();
  if (topo.home) allPositionIds.add(topo.home);
  for (const wp of topo.waypoints) allPositionIds.add(wp);

  if (allPositionIds.size === 0) return;

  const posMap = new Map(positions.map((p) => [p.id, p]));

  // Home waypoint: filled circle
  if (topo.home) {
    const homePos = posMap.get(topo.home);
    if (homePos) {
      ctx.beginPath();
      ctx.arc(homePos.x, homePos.y, 10 / zoom, 0, Math.PI * 2);
      ctx.fillStyle = numAlpha(0xe8a851, 0.9);
      ctx.fill();
    }
  }

  // Accessible waypoints (excluding home): outlined circles
  for (const wpId of topo.waypoints) {
    if (wpId === topo.home) continue;
    const wp = posMap.get(wpId);
    if (!wp) continue;
    ctx.beginPath();
    ctx.arc(wp.x, wp.y, 8 / zoom, 0, Math.PI * 2);
    ctx.strokeStyle = numAlpha(0xe8a851, 0.5);
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();
  }

  // Highlight routes between topology positions
  const topoRoutes = routes.filter((r) =>
    r.fromPositionId && r.toPositionId
    && allPositionIds.has(r.fromPositionId) && allPositionIds.has(r.toPositionId),
  );
  for (const route of topoRoutes) {
    const pts = buildPathPoints(route);
    if (pts.length < 2) continue;
    const flat = flattenRoutePath(pts, route.points);
    ctx.beginPath();
    ctx.moveTo(flat[0]!.x, flat[0]!.y);
    for (let i = 1; i < flat.length; i++) {
      ctx.lineTo(flat[i]!.x, flat[i]!.y);
    }
    ctx.strokeStyle = numAlpha(0xe8a851, 0.3);
    ctx.lineWidth = 3 / zoom;
    ctx.stroke();
  }

  // Dashed line from entity to home waypoint
  if (topo.home) {
    const homePos = posMap.get(topo.home);
    if (homePos) {
      drawDashedPolyline(
        ctx,
        [{ x: placed.x, y: placed.y }, { x: homePos.x, y: homePos.y }],
        6 / zoom, 4 / zoom, numAlpha(0xe8a851, 0.6), 1 / zoom,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Canvas2D round rect helper
// ---------------------------------------------------------------------------

/** Draw a rounded rectangle path (no stroke/fill). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
