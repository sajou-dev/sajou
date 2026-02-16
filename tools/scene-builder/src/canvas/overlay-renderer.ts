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
import { sceneToScreen, worldToScreen } from "./canvas.js";
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

/** Check if we're in isometric view mode. */
function isIsoMode(): boolean {
  return getEditorState().viewMode === "isometric";
}

/**
 * Draw a label at a scene position, handling iso text projection.
 *
 * In top-down mode, text is drawn directly in scene coordinates (the affine
 * transform is identity-scale, so text is not deformed).
 * In iso mode, the affine transform would shear text, so we reset the
 * transform and project the anchor to screen pixels.
 *
 * @param sceneX - Text anchor X in scene coordinates
 * @param sceneY - Text anchor Y in scene coordinates
 */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  sceneX: number,
  sceneY: number,
  text: string,
  opts: {
    font: string;
    fillStyle: string;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    pillBg?: string;
    pillPad?: number;
    pillRadius?: number;
  },
): void {
  if (!isIsoMode()) {
    // Top-down: draw directly in scene coords (transform already set)
    if (opts.pillBg !== undefined && opts.pillPad !== undefined) {
      ctx.font = opts.font;
      const metrics = ctx.measureText(text);
      const pad = opts.pillPad;
      const pillW = metrics.width + pad * 2;
      const fontSize = parseFloat(opts.font);
      const pillH = fontSize + pad;
      const pillX = opts.textAlign === "center" ? sceneX - pillW / 2 : sceneX;
      const pillY = sceneY - pillH;

      ctx.fillStyle = opts.pillBg;
      roundRect(ctx, pillX, pillY, pillW, pillH, opts.pillRadius ?? 3);
      ctx.fill();
    }

    ctx.font = opts.font;
    ctx.textAlign = opts.textAlign;
    ctx.textBaseline = opts.textBaseline;
    ctx.fillStyle = opts.fillStyle;
    ctx.fillText(text, sceneX, sceneY);
    return;
  }

  // Iso: project to screen coords, reset transform, draw clean text
  const screen = sceneToScreen(sceneX, sceneY);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Use a fixed screen-pixel font size for readability in iso
  const isoFontSize = 10;
  const fontStr = opts.font.replace(/^(bold\s+)?[\d.]+/, `$1${isoFontSize}`);

  if (opts.pillBg !== undefined) {
    ctx.font = fontStr;
    const metrics = ctx.measureText(text);
    const pad = 3;
    const pillW = metrics.width + pad * 2;
    const pillH = isoFontSize + pad;
    const pillX = opts.textAlign === "center" ? screen.x - pillW / 2 : screen.x;
    const pillY = screen.y - pillH;

    ctx.fillStyle = opts.pillBg;
    roundRect(ctx, pillX, pillY, pillW, pillH, 3);
    ctx.fill();
  }

  ctx.font = fontStr;
  ctx.textAlign = opts.textAlign;
  ctx.textBaseline = opts.textBaseline;
  ctx.fillStyle = opts.fillStyle;
  ctx.fillText(text, screen.x, screen.y);

  ctx.restore();
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

    if (isIsoMode() && !def?.defaults.flat) {
      // Billboard entity in iso: project the entity's world-space vertical
      // extent to screen coordinates so the selection box wraps around the
      // standing sprite, not flat on the ground.
      // Use shifted Z so feet align with their top-down position.
      const feetZ = placed.y + (1 - ay) * h;
      const bottomPt = worldToScreen(placed.x, 0, feetZ);
      const topPt = worldToScreen(placed.x, h, feetZ);

      // Pixels per world unit (ortho: same horizontally and vertically)
      const pxPerUnit = Math.abs(bottomPt.y - topPt.y) / h;
      const screenW = w * pxPerUnit;
      const screenH = Math.abs(bottomPt.y - topPt.y);

      const selLeft = bottomPt.x - screenW * ax;
      const selTop = topPt.y; // topPt has lower screen Y (screen Y grows downward)

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Selection rectangle
      ctx.strokeStyle = "#58a6ff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(selLeft - 2, selTop - 2, screenW + 4, screenH + 4);

      // Corner handles
      const hs = 5;
      ctx.fillStyle = "#58a6ff";
      const corners = [
        { x: selLeft, y: selTop },
        { x: selLeft + screenW, y: selTop },
        { x: selLeft, y: selTop + screenH },
        { x: selLeft + screenW, y: selTop + screenH },
      ];
      for (const c of corners) {
        ctx.fillRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
      }

      ctx.restore();
      continue;
    }

    // Flat entity (top-down or non-billboard iso): selection on scene plane
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
  const iso = isIsoMode();

  for (const placed of entities) {
    if (!placed.visible) continue;

    const def = getEntityDef(placed.entityId);
    const w = (def?.displayWidth ?? 32) * placed.scale;
    const h = (def?.displayHeight ?? 32) * placed.scale;
    const ax = def?.defaults.anchor?.[0] ?? 0.5;
    const isHovered = placed.id === bindingDropHighlightId;

    if (iso && !def?.defaults.flat) {
      const ay = def?.defaults.anchor?.[1] ?? 0.5;
      const feetZ = placed.y + (1 - ay) * h;
      const bottomPt = worldToScreen(placed.x, 0, feetZ);
      const topPt = worldToScreen(placed.x, h, feetZ);
      const pxPerUnit = Math.abs(bottomPt.y - topPt.y) / h;
      const screenW = w * pxPerUnit;
      const screenH = Math.abs(bottomPt.y - topPt.y);
      const selLeft = bottomPt.x - screenW * ax;
      const selTop = topPt.y;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = numAlpha(0xe8a851, isHovered ? 0.9 : 0.3);
      ctx.lineWidth = isHovered ? 2.5 : 1;
      ctx.strokeRect(selLeft - 3, selTop - 3, screenW + 6, screenH + 6);
      ctx.restore();
    } else {
      const ay = def?.defaults.anchor?.[1] ?? 0.5;
      const left = placed.x - w * ax;
      const top = placed.y - h * ay;

      ctx.strokeStyle = numAlpha(0xe8a851, isHovered ? 0.9 : 0.3);
      ctx.lineWidth = (isHovered ? 2.5 : 1) / zoom;
      ctx.strokeRect(left - 3, top - 3, w + 6, h + 6);
    }
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
      drawLabel(ctx, pos.x, pos.y, badge, {
        font: `bold ${7 / zoom}px "JetBrains Mono", monospace`,
        fillStyle: "#000000",
        textAlign: "center",
        textBaseline: "middle",
      });
      ctx.restore();
    }

    // Name label above
    ctx.save();
    const fontSize = 10 / zoom;
    const labelY = pos.y - size - 4 / zoom;

    drawLabel(ctx, pos.x, labelY, pos.name, {
      font: `${fontSize}px "JetBrains Mono", monospace`,
      fillStyle: "#ffffff",
      textAlign: "center",
      textBaseline: "bottom",
      pillBg: numAlpha(isSelected ? 0x58a6ff : 0x0e0e16, 0.85),
      pillPad: 3 / zoom,
      pillRadius: 3 / zoom,
    });
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
          const wpLabelY = rp.y + handleSize + 3 / zoom;

          drawLabel(ctx, rp.x, wpLabelY, rp.name, {
            font: `${fs}px "JetBrains Mono", monospace`,
            fillStyle: "#ffffff",
            textAlign: "center",
            textBaseline: "top",
            pillBg: numAlpha(0x0e0e16, 0.85),
            pillPad: 2 / zoom,
            pillRadius: 2 / zoom,
          });
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
      const nameLabelY = midPt.y - 8 / zoom;

      drawLabel(ctx, midPt.x, nameLabelY, route.name, {
        font: `${fs}px "JetBrains Mono", monospace`,
        fillStyle: "#ffffff",
        textAlign: "center",
        textBaseline: "bottom",
        pillBg: numAlpha(0x0e0e16, 0.85),
        pillPad: 3 / zoom,
        pillRadius: 3 / zoom,
      });
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
  const iso = isIsoMode();

  for (const placed of entities) {
    if (!placed.semanticId || !placed.visible) continue;

    const def = entityStore.entities[placed.entityId];
    const w = (def?.displayWidth ?? 32) * placed.scale;
    const h = (def?.displayHeight ?? 32) * placed.scale;
    const ax = def?.defaults.anchor?.[0] ?? 0.5;
    const bs = 4;

    if (iso && !def?.defaults.flat) {
      const ay = def?.defaults.anchor?.[1] ?? 0.5;
      const feetZ = placed.y + (1 - ay) * h;
      const topPt = worldToScreen(placed.x, h, feetZ);
      const pxPerUnit = Math.abs(worldToScreen(placed.x, 0, feetZ).y - topPt.y) / h;
      const screenW = w * pxPerUnit;
      const bx = topPt.x + screenW * (1 - ax) - 2;
      const by = topPt.y + 2;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.moveTo(bx, by - bs);
      ctx.lineTo(bx + bs, by);
      ctx.lineTo(bx, by + bs);
      ctx.lineTo(bx - bs, by);
      ctx.closePath();
      ctx.fillStyle = numAlpha(0xe8a851, 0.9);
      ctx.fill();
      ctx.restore();
    } else {
      const ay = def?.defaults.anchor?.[1] ?? 0.5;
      const right = placed.x + w * (1 - ax);
      const top = placed.y - h * ay;
      const bx = right - 2;
      const by = top + 2;

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
// Light markers
// ---------------------------------------------------------------------------

/** Render light source markers on the Canvas2D overlay. */
export function renderLightMarkers(ctx: CanvasRenderingContext2D, zoom: number): void {
  if (isRunModeActive()) return;

  const { lighting } = getSceneState();
  const { activeTool, selectedLightIds } = getEditorState();
  const isLightTool = activeTool === "light";

  // Draw all point light sources
  ctx.globalAlpha = isLightTool ? 1 : 0.3;

  for (const source of lighting.sources) {
    const isSelected = selectedLightIds.includes(source.id);
    const r = 6 / zoom;

    // Radius circle (dashed, only when light tool active)
    if (isLightTool) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(source.x, source.y, source.radius, 0, Math.PI * 2);
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.strokeStyle = hexAlpha(source.color, 0.25);
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Sun icon: filled circle + 4 short rays
    ctx.beginPath();
    ctx.arc(source.x, source.y, r, 0, Math.PI * 2);
    ctx.fillStyle = source.color;
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = "#58a6ff";
      ctx.lineWidth = 2 / zoom;
    } else {
      ctx.strokeStyle = darkenColor(source.color, 0.3);
      ctx.lineWidth = 1 / zoom;
    }
    ctx.stroke();

    // 4 rays (N, E, S, W)
    const rayLen = 4 / zoom;
    const rayGap = r + 2 / zoom;
    ctx.strokeStyle = source.color;
    ctx.lineWidth = 1.5 / zoom;

    ctx.beginPath();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      ctx.moveTo(source.x + dx * rayGap, source.y + dy * rayGap);
      ctx.lineTo(source.x + dx * (rayGap + rayLen), source.y + dy * (rayGap + rayLen));
    }
    ctx.stroke();

    // ID label (when selected)
    if (isSelected && isLightTool) {
      ctx.save();
      const fontSize = 9 / zoom;
      const labelY = source.y - r - 6 / zoom;

      drawLabel(ctx, source.x, labelY, source.id, {
        font: `${fontSize}px "JetBrains Mono", monospace`,
        fillStyle: "#ffffff",
        textAlign: "center",
        textBaseline: "bottom",
        pillBg: numAlpha(0x0e0e16, 0.85),
        pillPad: 3 / zoom,
        pillRadius: 3 / zoom,
      });
      ctx.restore();
    }
  }

  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Particle markers
// ---------------------------------------------------------------------------

/** Render particle emitter markers on the Canvas2D overlay. */
export function renderParticleMarkers(ctx: CanvasRenderingContext2D, zoom: number): void {
  if (isRunModeActive()) return;

  const { particles } = getSceneState();
  const { activeTool, selectedParticleIds } = getEditorState();
  const isParticleTool = activeTool === "particle";

  ctx.globalAlpha = isParticleTool ? 1 : 0.3;

  for (const emitter of particles) {
    const isSelected = selectedParticleIds.includes(emitter.id);
    const firstColor = emitter.colorOverLife[0] ?? "#FFA040";
    const s = 7 / zoom;

    // Diamond marker (filled with first color stop)
    ctx.beginPath();
    ctx.moveTo(emitter.x, emitter.y - s);
    ctx.lineTo(emitter.x + s, emitter.y);
    ctx.lineTo(emitter.x, emitter.y + s);
    ctx.lineTo(emitter.x - s, emitter.y);
    ctx.closePath();

    ctx.fillStyle = firstColor;
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = "#58a6ff";
      ctx.lineWidth = 2 / zoom;
    } else {
      ctx.strokeStyle = darkenColor(firstColor, 0.3);
      ctx.lineWidth = 1 / zoom;
    }
    ctx.stroke();

    // Extent circle (dashed, only when particle tool active)
    if (isParticleTool) {
      // Approximate extent: max velocity * max lifetime
      let maxVel: number;
      if (emitter.type === "radial") {
        const maxVx = Math.max(Math.abs(emitter.velocity.x[0]), Math.abs(emitter.velocity.x[1]));
        const maxVy = Math.max(Math.abs(emitter.velocity.y[0]), Math.abs(emitter.velocity.y[1]));
        maxVel = Math.hypot(maxVx, maxVy);
      } else {
        maxVel = Math.max(Math.abs(emitter.speed[0]), Math.abs(emitter.speed[1]));
      }
      const extent = maxVel * emitter.lifetime[1];

      if (extent > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(emitter.x, emitter.y, extent, 0, Math.PI * 2);
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.strokeStyle = hexAlpha(firstColor, 0.2);
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // Direction arrow (directional emitters, when particle tool active)
    if (isParticleTool && emitter.type === "directional") {
      const len = Math.hypot(emitter.direction.x, emitter.direction.y);
      if (len > 0) {
        const nx = emitter.direction.x / len;
        const ny = emitter.direction.y / len;
        const arrowLen = 20 / zoom;

        ctx.beginPath();
        ctx.moveTo(emitter.x, emitter.y);
        ctx.lineTo(emitter.x + nx * arrowLen, emitter.y + ny * arrowLen);
        ctx.strokeStyle = firstColor;
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();

        // Arrowhead
        const tipX = emitter.x + nx * arrowLen;
        const tipY = emitter.y + ny * arrowLen;
        const headSize = 5 / zoom;
        const px = -ny;
        const py = nx;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - nx * headSize + px * headSize * 0.5, tipY - ny * headSize + py * headSize * 0.5);
        ctx.lineTo(tipX - nx * headSize - px * headSize * 0.5, tipY - ny * headSize - py * headSize * 0.5);
        ctx.closePath();
        ctx.fillStyle = firstColor;
        ctx.fill();
      }
    }

    // ID label (when selected)
    if (isSelected && isParticleTool) {
      ctx.save();
      const fontSize = 9 / zoom;
      const labelY = emitter.y - s - 6 / zoom;

      drawLabel(ctx, emitter.x, labelY, emitter.id, {
        font: `${fontSize}px "JetBrains Mono", monospace`,
        fillStyle: "#ffffff",
        textAlign: "center",
        textBaseline: "bottom",
        pillBg: numAlpha(0x0e0e16, 0.85),
        pillPad: 3 / zoom,
        pillRadius: 3 / zoom,
      });
      ctx.restore();
    }
  }

  ctx.globalAlpha = 1;
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
