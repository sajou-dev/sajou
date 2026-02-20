/**
 * Route tool.
 *
 * Click on the canvas to start a new route path, keep clicking to add
 * points, double-click or press Enter to finish. Click to select existing
 * routes, drag point handles to edit path geometry.
 *
 * Point editing (when a route is selected):
 * - Drag handle to move point
 * - Shift+click handle to toggle sharp↔smooth
 * - Delete/Backspace when hovering a handle to delete point (min 2 enforced)
 * - Double-click on segment to insert a new point
 *
 * Routes are standalone vector paths — they don't require position markers.
 */

import { shouldSuppressShortcut } from "../shortcuts/shortcut-registry.js";

import type { CanvasToolHandler } from "../canvas/canvas.js";
import {
  getEditorState,
  setRouteSelection,
  showPanel,
  updateEditorState,
} from "../state/editor-state.js";
import {
  getSceneState,
  updateSceneState,
} from "../state/scene-state.js";
import { executeCommand } from "../state/undo.js";
import { snap } from "./snap.js";
import { hitTestPosition } from "./hit-test.js";
import type { SceneRoute, RoutePoint, UndoableCommand } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hit distance for route lines (scene px). */
const ROUTE_HIT_DISTANCE = 6;

/** Hit radius for route point handles (scene px). */
const POINT_HIT_RADIUS = 8;

/** Default route color palette (cycles). */
const ROUTE_COLORS = [
  "#555555",
  "#E8A851",
  "#58a6ff",
  "#7ee787",
  "#f778ba",
  "#d2a8ff",
  "#ffa657",
  "#ff7b72",
];

let colorIndex = 0;

/** Pick the next color in the palette. */
function nextColor(): string {
  const c = ROUTE_COLORS[colorIndex % ROUTE_COLORS.length]!;
  colorIndex++;
  return c;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Point-to-line-segment distance. */
function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Build the display point array for a route.
 *
 * When the route is linked to positions via `fromPositionId` / `toPositionId`,
 * the first / last point is overridden with the linked position's coordinates
 * so that the route visually follows the position when it moves.
 */
function buildPathPoints(route: SceneRoute): Array<{ x: number; y: number }> {
  const pts = route.points.map((p) => ({ x: p.x, y: p.y }));
  if (pts.length < 2) return pts;

  const { positions } = getSceneState();

  // Snap first point to linked origin position
  if (route.fromPositionId) {
    const pos = positions.find((p) => p.id === route.fromPositionId);
    if (pos) pts[0] = { x: pos.x, y: pos.y };
  }
  // Snap last point to linked destination position
  if (route.toPositionId) {
    const pos = positions.find((p) => p.id === route.toPositionId);
    if (pos) pts[pts.length - 1] = { x: pos.x, y: pos.y };
  }

  return pts;
}

// ---------------------------------------------------------------------------
// Hit-testing
// ---------------------------------------------------------------------------

/** Hit-test against route lines. Returns route ID or null. */
function hitTestRoute(sx: number, sy: number): string | null {
  const { routes } = getSceneState();

  for (let i = routes.length - 1; i >= 0; i--) {
    const route = routes[i]!;
    const points = buildPathPoints(route);
    if (points.length < 2) continue;

    for (let j = 0; j < points.length - 1; j++) {
      const a = points[j]!;
      const b = points[j + 1]!;
      const dist = pointToSegmentDist(sx, sy, a.x, a.y, b.x, b.y);
      if (dist <= ROUTE_HIT_DISTANCE) return route.id;
    }
  }
  return null;
}

/**
 * Hit-test against point handles of a selected route.
 * Returns { routeId, pointIndex } or null.
 */
function hitTestPoint(
  sx: number, sy: number, routeId: string,
): { routeId: string; pointIndex: number } | null {
  const { routes } = getSceneState();
  const route = routes.find((r) => r.id === routeId);
  if (!route) return null;

  for (let i = 0; i < route.points.length; i++) {
    const pt = route.points[i]!;
    const dx = sx - pt.x;
    const dy = sy - pt.y;
    if (dx * dx + dy * dy <= POINT_HIT_RADIUS * POINT_HIT_RADIUS) {
      return { routeId, pointIndex: i };
    }
  }
  return null;
}

/**
 * Hit-test against segments of a specific route.
 * Returns the index of the first point of the hit segment, or null.
 */
function hitTestSegment(
  sx: number, sy: number, routeId: string,
): { routeId: string; segmentIndex: number } | null {
  const { routes } = getSceneState();
  const route = routes.find((r) => r.id === routeId);
  if (!route) return null;

  const points = buildPathPoints(route);
  if (points.length < 2) return null;

  for (let j = 0; j < points.length - 1; j++) {
    const a = points[j]!;
    const b = points[j + 1]!;
    const dist = pointToSegmentDist(sx, sy, a.x, a.y, b.x, b.y);
    if (dist <= ROUTE_HIT_DISTANCE) return { routeId, segmentIndex: j };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique route ID. */
function generateRouteId(): string {
  return `route-${Date.now().toString(36)}`;
}

/** Generate an auto-incremented route name. */
function generateRouteName(): string {
  const { routes } = getSceneState();
  let n = routes.length + 1;
  let name = `route-${n}`;
  const existing = new Set(routes.map((r) => r.name));
  while (existing.has(name)) {
    n++;
    name = `route-${n}`;
  }
  return name;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

/** Route creation state (tool-local). */
interface RouteCreation {
  points: RoutePoint[];
}

/** Publish current creation preview to editor state (triggers render). */
function publishPreview(creating: RouteCreation | null, cursor: { x: number; y: number } | null): void {
  if (!creating) {
    updateEditorState({ routeCreationPreview: null });
    return;
  }
  updateEditorState({
    routeCreationPreview: {
      points: creating.points.map((p) => ({
        x: p.x,
        y: p.y,
        cornerStyle: p.cornerStyle,
      })),
      cursor,
    },
  });
}

/** Result of createRouteTool: the handler + control functions. */
export interface RouteToolResult {
  handler: CanvasToolHandler;
  /** Cancel any in-progress route creation. */
  cancelCreation: () => void;
  /** Get the currently hovered point handle (for keyboard delete). */
  getHoveredPoint: () => { routeId: string; pointIndex: number } | null;
}

/** Create the Route tool handler. */
export function createRouteTool(): RouteToolResult {
  /** Active route creation state (null = not creating). */
  let creating: RouteCreation | null = null;

  /** Last known cursor position (for preview). */
  let lastCursor: { x: number; y: number } | null = null;

  /** Currently hovered point handle (for keyboard Delete). */
  let hoveredPoint: { routeId: string; pointIndex: number } | null = null;

  /** Point drag state. */
  let draggingPt: {
    routeId: string;
    pointIndex: number;
    startX: number;
    startY: number;
  } | null = null;

  const handler: CanvasToolHandler = {
    onMouseDown(e: MouseEvent, scenePos: { x: number; y: number }) {
      const { selectedRouteIds } = getEditorState();

      // --- Point drag on selected route ---
      if (selectedRouteIds.length === 1 && !creating) {
        const ptHit = hitTestPoint(scenePos.x, scenePos.y, selectedRouteIds[0]!);
        if (ptHit) {
          const { routes } = getSceneState();
          const route = routes.find((r) => r.id === ptHit.routeId);
          const pt = route?.points[ptHit.pointIndex];
          if (pt) {
            // Shift+click = toggle sharp↔smooth
            if (e.shiftKey) {
              toggleCornerStyle(ptHit.routeId, ptHit.pointIndex);
              return;
            }
            draggingPt = {
              routeId: ptHit.routeId,
              pointIndex: ptHit.pointIndex,
              startX: pt.x,
              startY: pt.y,
            };
          }
          return;
        }
      }

      // --- Route creation mode (adding points) ---
      if (creating) {
        creating.points.push({
          x: snap(scenePos.x),
          y: snap(scenePos.y),
          cornerStyle: e.shiftKey ? "smooth" : "sharp",
        });
        publishPreview(creating, lastCursor);
        return;
      }

      // --- Select existing route or start creation ---
      const routeHit = hitTestRoute(scenePos.x, scenePos.y);
      if (routeHit) {
        // Select route
        if (e.ctrlKey || e.metaKey) {
          if (selectedRouteIds.includes(routeHit)) {
            setRouteSelection(selectedRouteIds.filter((id) => id !== routeHit));
          } else {
            setRouteSelection([...selectedRouteIds, routeHit]);
          }
        } else {
          setRouteSelection([routeHit]);
        }
        showPanel("inspector");
        return;
      }

      // Start a new route: first click = first point
      creating = {
        points: [{
          x: snap(scenePos.x),
          y: snap(scenePos.y),
          cornerStyle: e.shiftKey ? "smooth" : "sharp",
        }],
      };
      lastCursor = scenePos;
      setRouteSelection([]);
      publishPreview(creating, lastCursor);
    },

    onMouseMove(_e: MouseEvent, scenePos: { x: number; y: number }) {
      // Update cursor preview during creation
      if (creating) {
        lastCursor = scenePos;
        publishPreview(creating, lastCursor);
        hoveredPoint = null;
        return;
      }

      // Track hovered point handle (for keyboard Delete)
      if (!draggingPt) {
        const { selectedRouteIds } = getEditorState();
        if (selectedRouteIds.length === 1) {
          hoveredPoint = hitTestPoint(scenePos.x, scenePos.y, selectedRouteIds[0]!);
        } else {
          hoveredPoint = null;
        }
      }

      if (!draggingPt) return;

      const x = snap(scenePos.x);
      const y = snap(scenePos.y);
      const { routes } = getSceneState();
      updateSceneState({
        routes: routes.map((r) => {
          if (r.id !== draggingPt!.routeId) return r;
          const pts = [...r.points];
          pts[draggingPt!.pointIndex] = { ...pts[draggingPt!.pointIndex]!, x, y };
          return { ...r, points: pts };
        }),
      });
    },

    onMouseUp() {
      if (!draggingPt) return;

      // Check if moved
      const { routes } = getSceneState();
      const route = routes.find((r) => r.id === draggingPt!.routeId);
      const pt = route?.points[draggingPt!.pointIndex];

      if (pt && (pt.x !== draggingPt.startX || pt.y !== draggingPt.startY)) {
        const movedRouteId = draggingPt.routeId;
        const movedIndex = draggingPt.pointIndex;
        const finalX = pt.x;
        const finalY = pt.y;
        const origX = draggingPt.startX;
        const origY = draggingPt.startY;

        const cmd: UndoableCommand = {
          execute() {
            const { routes: cur } = getSceneState();
            updateSceneState({
              routes: cur.map((r) => {
                if (r.id !== movedRouteId) return r;
                const pts = [...r.points];
                pts[movedIndex] = { ...pts[movedIndex]!, x: finalX, y: finalY };
                return { ...r, points: pts };
              }),
            });
          },
          undo() {
            const { routes: cur } = getSceneState();
            updateSceneState({
              routes: cur.map((r) => {
                if (r.id !== movedRouteId) return r;
                const pts = [...r.points];
                pts[movedIndex] = { ...pts[movedIndex]!, x: origX, y: origY };
                return { ...r, points: pts };
              }),
            });
          },
          description: "Move route point",
        };
        cmd.undo();
        executeCommand(cmd);
      }

      draggingPt = null;
    },

    onDoubleClick(e: MouseEvent, scenePos: { x: number; y: number }) {
      // --- Insert point on segment (when route selected, not creating) ---
      if (!creating) {
        const { selectedRouteIds } = getEditorState();
        if (selectedRouteIds.length === 1) {
          const segHit = hitTestSegment(scenePos.x, scenePos.y, selectedRouteIds[0]!);
          if (segHit) {
            insertPoint(
              segHit.routeId,
              segHit.segmentIndex + 1,
              snap(scenePos.x),
              snap(scenePos.y),
              e.shiftKey ? "smooth" : "sharp",
            );
            return;
          }
        }
      }

      // Finish route creation on double-click
      if (creating) {
        finishCreation(creating);
        creating = null;
        publishPreview(null, null);
      }
    },
  };

  /** Cancel any in-progress route creation. */
  function cancelCreation(): void {
    if (creating) {
      creating = null;
      publishPreview(null, null);
    }
  }

  return { handler, cancelCreation, getHoveredPoint: () => hoveredPoint };

  // ── Internal helpers ──

  /** Finish route creation. Requires at least 2 points. */
  function finishCreation(creation: RouteCreation): void {
    // The last point was added by the first click of the double-click,
    // so we may have a duplicate — remove it if it's the same as the
    // previous point.
    const pts = [...creation.points];
    if (pts.length >= 2) {
      const last = pts[pts.length - 1]!;
      const prev = pts[pts.length - 2]!;
      if (last.x === prev.x && last.y === prev.y) {
        pts.pop();
      }
    }

    if (pts.length < 2) return; // Need at least 2 points

    // Auto-name waypoints (all points get sequential names)
    const namedPts = pts.map((p, i) => ({
      ...p,
      name: p.name ?? `wp${i + 1}`,
    }));

    // Auto-link to nearby positions (within 20px)
    const fromPosId = hitTestPosition(namedPts[0]!.x, namedPts[0]!.y) ?? undefined;
    const toPosHit = hitTestPosition(namedPts[namedPts.length - 1]!.x, namedPts[namedPts.length - 1]!.y);
    const toPosId = toPosHit && toPosHit !== fromPosId ? toPosHit : undefined;

    const newRoute: SceneRoute = {
      id: generateRouteId(),
      name: generateRouteName(),
      points: namedPts,
      style: "solid",
      color: nextColor(),
      bidirectional: false,
      fromPositionId: fromPosId,
      toPositionId: toPosId,
    };

    const cmd: UndoableCommand = {
      execute() {
        const { routes } = getSceneState();
        updateSceneState({ routes: [...routes, newRoute] });
      },
      undo() {
        const { routes } = getSceneState();
        updateSceneState({ routes: routes.filter((r) => r.id !== newRoute.id) });
      },
      description: `Create route "${newRoute.name}"`,
    };
    executeCommand(cmd);

    setRouteSelection([newRoute.id]);
    showPanel("inspector");
  }

  function insertPoint(
    routeId: string,
    insertIndex: number,
    x: number,
    y: number,
    cornerStyle: "sharp" | "smooth",
  ): void {
    // Auto-name: find next available wp index for this route
    const { routes: curRoutes } = getSceneState();
    const curRoute = curRoutes.find((r) => r.id === routeId);
    let wpNum = (curRoute?.points.length ?? 0) + 1;
    const usedNames = new Set(curRoute?.points.map((p) => p.name).filter(Boolean));
    while (usedNames.has(`wp${wpNum}`)) wpNum++;
    const newPt: RoutePoint = { x, y, cornerStyle, name: `wp${wpNum}` };

    const cmd: UndoableCommand = {
      execute() {
        const { routes: cur } = getSceneState();
        updateSceneState({
          routes: cur.map((r) => {
            if (r.id !== routeId) return r;
            const pts = [...r.points];
            pts.splice(insertIndex, 0, newPt);
            return { ...r, points: pts };
          }),
        });
      },
      undo() {
        const { routes: cur } = getSceneState();
        updateSceneState({
          routes: cur.map((r) => {
            if (r.id !== routeId) return r;
            const pts = r.points.filter((_, i) => i !== insertIndex);
            return { ...r, points: pts };
          }),
        });
      },
      description: "Insert route point",
    };
    executeCommand(cmd);
  }

  function toggleCornerStyle(routeId: string, pointIndex: number): void {
    const { routes } = getSceneState();
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;
    const pt = route.points[pointIndex];
    if (!pt) return;

    const oldStyle = pt.cornerStyle;
    const newStyle: "sharp" | "smooth" = oldStyle === "sharp" ? "smooth" : "sharp";

    const cmd: UndoableCommand = {
      execute() {
        const { routes: cur } = getSceneState();
        updateSceneState({
          routes: cur.map((r) => {
            if (r.id !== routeId) return r;
            const pts = [...r.points];
            pts[pointIndex] = { ...pts[pointIndex]!, cornerStyle: newStyle };
            return { ...r, points: pts };
          }),
        });
      },
      undo() {
        const { routes: cur } = getSceneState();
        updateSceneState({
          routes: cur.map((r) => {
            if (r.id !== routeId) return r;
            const pts = [...r.points];
            pts[pointIndex] = { ...pts[pointIndex]!, cornerStyle: oldStyle };
            return { ...r, points: pts };
          }),
        });
      },
      description: `Toggle point to ${newStyle}`,
    };
    executeCommand(cmd);
  }

}

/** Initialize Route tool keyboard shortcuts (Delete, Escape). */
export function initRouteToolKeyboard(
  cancelCreation: () => void,
  getHoveredPoint: () => { routeId: string; pointIndex: number } | null,
): void {
  document.addEventListener("keydown", (e) => {
    if (shouldSuppressShortcut(e)) return;

    const { activeTool, selectedRouteIds, routeCreationPreview } = getEditorState();
    if (activeTool !== "route") return;

    if (e.key === "Escape") {
      e.preventDefault();
      // Cancel in-progress creation first, otherwise deselect
      if (routeCreationPreview) {
        cancelCreation();
      } else {
        setRouteSelection([]);
      }
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedRouteIds.length === 0) return;
      e.preventDefault();

      // If hovering a point handle, delete that point (not the whole route)
      const hp = getHoveredPoint();
      if (hp && selectedRouteIds.includes(hp.routeId)) {
        const { routes } = getSceneState();
        const route = routes.find((r) => r.id === hp.routeId);
        if (route && route.points.length > 2) {
          const removedPt = route.points[hp.pointIndex]!;
          const delRouteId = hp.routeId;
          const delIndex = hp.pointIndex;

          const cmd: UndoableCommand = {
            execute() {
              const { routes: cur } = getSceneState();
              updateSceneState({
                routes: cur.map((r) => {
                  if (r.id !== delRouteId) return r;
                  return { ...r, points: r.points.filter((_, i) => i !== delIndex) };
                }),
              });
            },
            undo() {
              const { routes: cur } = getSceneState();
              updateSceneState({
                routes: cur.map((r) => {
                  if (r.id !== delRouteId) return r;
                  const pts = [...r.points];
                  pts.splice(delIndex, 0, removedPt);
                  return { ...r, points: pts };
                }),
              });
            },
            description: "Delete route point",
          };
          executeCommand(cmd);
        }
        return;
      }

      // Otherwise delete entire selected route(s)
      const idsToRemove = [...selectedRouteIds];
      const { routes } = getSceneState();
      const removed = routes.filter((r) => idsToRemove.includes(r.id));

      const cmd: UndoableCommand = {
        execute() {
          const { routes: cur } = getSceneState();
          updateSceneState({
            routes: cur.filter((r) => !idsToRemove.includes(r.id)),
          });
          setRouteSelection([]);
        },
        undo() {
          const { routes: cur } = getSceneState();
          updateSceneState({ routes: [...cur, ...removed] });
          setRouteSelection(idsToRemove);
        },
        description: `Delete ${idsToRemove.length} route(s)`,
      };
      executeCommand(cmd);
    }
  });
}

/** Export buildPathPoints for use by scene-renderer. */
export { buildPathPoints };
