/**
 * Run mode command sink — bridges @sajou/core's CommandSink to rendered entities.
 *
 * Receives action commands (start/update/complete/execute/interrupt) from the
 * Choreographer runtime and applies them to display objects via a RenderAdapter.
 *
 * Entity resolution:
 *   entityRef (semantic ID from choreography) → PlacedEntity → DisplayObjectHandle
 *
 * Position resolution:
 *   params.to / params.at (position name) → ScenePosition → { x, y }
 */

import type {
  CommandSink,
  ActionStartCommand,
  ActionUpdateCommand,
  ActionCompleteCommand,
  ActionExecuteCommand,
  InterruptCommand,
} from "@sajou/core";

import type { RenderAdapter, DisplayObjectHandle } from "../canvas/render-adapter.js";
import { resolveEntityId, resolvePosition, resolveRoute } from "./run-mode-resolve.js";
import { switchAnimation } from "./run-mode-animator.js";
import { buildPathPoints } from "../tools/route-tool.js";
import { flattenRoutePathWithMapping, computeSegmentLengths, interpolateAlongPath } from "../tools/route-math.js";

// ---------------------------------------------------------------------------
// Internal animation state
// ---------------------------------------------------------------------------

/** Tracked state for an animated action (move, fly, flash, followRoute). */
interface ActiveAnimation {
  /** The display object being animated. */
  handle: DisplayObjectHandle;
  /** Start X position. */
  startX: number;
  /** Start Y position. */
  startY: number;
  /** Target X position (move, fly). */
  targetX: number;
  /** Target Y position (move, fly). */
  targetY: number;
  /** Saved tint (flash). */
  savedTint: number;
  /** Action name (for update dispatch). */
  action: string;
  /** Flattened polyline for followRoute. */
  polyline?: ReadonlyArray<{ x: number; y: number }>;
  /** Cumulative arc lengths for followRoute interpolation. */
  cumulativeLengths?: readonly number[];
  /** Original sign of scale.x for restoring after flip (followRoute). */
  originalScaleXSign?: number;
  /** Animation state to set on arrival (followRoute). */
  animationOnArrival?: string;
  /** Placed entity ID for animation switching (followRoute). */
  placedId?: string;
}

/** Composite key for tracking animations: performanceId:entityRef. */
function animKey(performanceId: string, entityRef: string): string {
  return `${performanceId}:${entityRef}`;
}

// ---------------------------------------------------------------------------
// RunModeSink
// ---------------------------------------------------------------------------

/** Creates a CommandSink implementation that drives rendered entities via adapter. */
export function createRunModeSink(adapter: RenderAdapter): CommandSink {
  const animations = new Map<string, ActiveAnimation>();

  return {
    onActionStart(cmd: ActionStartCommand): void {
      const placedId = resolveEntityId(cmd.entityRef);
      if (!placedId) {
        if (cmd.entityRef) {
          console.warn(`[run-mode] ${cmd.action} start: entity "${cmd.entityRef}" not found`);
        } else {
          console.warn(`[run-mode] ${cmd.action} start: no entity specified`);
        }
        return;
      }

      const handle = adapter.getHandle(placedId);
      if (!handle) return;

      const key = animKey(cmd.performanceId, cmd.entityRef);

      if (cmd.action === "move" || cmd.action === "fly") {
        const toName = cmd.params["to"] as string | undefined;
        const target = toName ? resolvePosition(toName) : null;

        // Start "during" animation if specified
        const animDuring = cmd.params["animationDuring"] as string | undefined;
        if (animDuring && placedId) switchAnimation(placedId, animDuring);

        animations.set(key, {
          handle,
          startX: handle.x,
          startY: handle.y,
          targetX: target?.x ?? handle.x,
          targetY: target?.y ?? handle.y,
          savedTint: 0xffffff,
          action: cmd.action,
          animationOnArrival: cmd.params["animationOnArrival"] as string | undefined,
          placedId: placedId ?? undefined,
        });
      } else if (cmd.action === "flash") {
        animations.set(key, {
          handle,
          startX: handle.x,
          startY: handle.y,
          targetX: handle.x,
          targetY: handle.y,
          savedTint: handle.tint,
          action: cmd.action,
        });
      } else if (cmd.action === "followRoute") {
        const routeName = cmd.params["route"] as string | undefined;
        const route = routeName ? resolveRoute(routeName) : null;
        if (!route) {
          console.warn(`[run-mode] followRoute: route "${routeName}" not found`);
          return;
        }

        // Build display points (snapped to linked positions)
        const displayPoints = buildPathPoints(route);
        if (displayPoints.length < 2) return;

        // Flatten to dense polyline with original-point index mapping
        const { polyline: fullPolyline, pointIndices } = flattenRoutePathWithMapping(displayPoints, route.points);

        // Slice polyline to from/to waypoint range if specified
        const fromName = cmd.params["from"] as string | undefined;
        const toName = cmd.params["to"] as string | undefined;

        let sliceStart = 0;
        let sliceEnd = fullPolyline.length;

        if (fromName) {
          const rpIdx = route.points.findIndex((rp) => rp.name === fromName);
          if (rpIdx >= 0 && rpIdx < pointIndices.length) {
            sliceStart = pointIndices[rpIdx]!;
          } else {
            console.warn(`[run-mode] followRoute: waypoint "${fromName}" not found on route "${routeName}"`);
          }
        }
        if (toName) {
          const rpIdx = route.points.findIndex((rp) => rp.name === toName);
          if (rpIdx >= 0 && rpIdx < pointIndices.length) {
            sliceEnd = pointIndices[rpIdx]! + 1; // inclusive
          } else {
            console.warn(`[run-mode] followRoute: waypoint "${toName}" not found on route "${routeName}"`);
          }
        }

        let polyline = fullPolyline.slice(sliceStart, sliceEnd);
        if (polyline.length < 2) {
          console.warn(`[run-mode] followRoute: sliced path too short (from="${fromName}", to="${toName}")`);
          return;
        }

        // Reverse if requested
        const reverse = cmd.params["reverse"] as boolean | undefined;
        if (reverse) polyline = [...polyline].reverse();

        // Compute arc-length parameterization
        const cumulativeLengths = computeSegmentLengths(polyline);

        // Teleport entity to start of path
        handle.x = polyline[0]!.x;
        handle.y = polyline[0]!.y;

        // Start "during" animation
        const animDuring = cmd.params["animationDuring"] as string | undefined;
        if (animDuring && placedId) switchAnimation(placedId, animDuring);

        animations.set(key, {
          handle,
          startX: handle.x,
          startY: handle.y,
          targetX: polyline[polyline.length - 1]!.x,
          targetY: polyline[polyline.length - 1]!.y,
          savedTint: 0xffffff,
          action: cmd.action,
          polyline,
          cumulativeLengths,
          originalScaleXSign: handle.scale.x >= 0 ? 1 : -1,
          animationOnArrival: cmd.params["animationOnArrival"] as string | undefined,
          placedId: placedId ?? undefined,
        });
      } else if (cmd.action === "wait") {
        // No visual setup needed — timing is handled by the scheduler.
      }
    },

    onActionUpdate(cmd: ActionUpdateCommand): void {
      const key = animKey(cmd.performanceId, cmd.entityRef);
      const anim = animations.get(key);
      if (!anim) return;

      const { handle, startX, startY, targetX, targetY } = anim;
      const t = cmd.progress;

      if (anim.action === "move") {
        handle.x = startX + (targetX - startX) * t;
        handle.y = startY + (targetY - startY) * t;
      } else if (anim.action === "fly") {
        // Move with arc: vertical offset via sin(progress * PI)
        handle.x = startX + (targetX - startX) * t;
        const linearY = startY + (targetY - startY) * t;
        const arcHeight = Math.abs(targetX - startX) * 0.3;
        handle.y = linearY - Math.sin(t * Math.PI) * arcHeight;
      } else if (anim.action === "followRoute") {
        if (anim.polyline && anim.cumulativeLengths) {
          const sample = interpolateAlongPath(anim.polyline, anim.cumulativeLengths, t);
          handle.x = sample.x;
          handle.y = sample.y;
          // Flip entity based on movement direction
          const origSign = anim.originalScaleXSign ?? 1;
          handle.scale.x = Math.abs(handle.scale.x) * sample.directionX * origSign;
        }
      } else if (anim.action === "flash") {
        const colorStr = cmd.params["color"] as string | undefined;
        if (colorStr) {
          const flashColor = parseHexColor(colorStr);
          // Blend: at progress 0.5 = full flash color, then fade back
          const intensity = t <= 0.5 ? t * 2 : (1 - t) * 2;
          handle.tint = lerpColor(anim.savedTint, flashColor, intensity);
        }
      }
    },

    onActionComplete(cmd: ActionCompleteCommand): void {
      const key = animKey(cmd.performanceId, cmd.entityRef);
      const anim = animations.get(key);
      if (!anim) {
        animations.delete(key);
        return;
      }

      const { handle } = anim;

      if (anim.action === "move" || anim.action === "fly") {
        // Snap to final position
        handle.x = anim.targetX;
        handle.y = anim.targetY;
        // Switch to arrival animation if specified
        if (anim.animationOnArrival && anim.placedId) {
          switchAnimation(anim.placedId, anim.animationOnArrival);
        }
      } else if (anim.action === "followRoute") {
        // Snap to final path point
        handle.x = anim.targetX;
        handle.y = anim.targetY;
        // Restore original flip direction
        const origSign = anim.originalScaleXSign ?? 1;
        handle.scale.x = Math.abs(handle.scale.x) * origSign;
        // Switch to arrival animation
        if (anim.animationOnArrival && anim.placedId) {
          switchAnimation(anim.placedId, anim.animationOnArrival);
        }
      } else if (anim.action === "flash") {
        // Restore original tint
        handle.tint = anim.savedTint;
      }

      animations.delete(key);
    },

    onActionExecute(cmd: ActionExecuteCommand): void {
      const placedId = resolveEntityId(cmd.entityRef);
      if (!placedId) {
        if (cmd.entityRef) {
          console.warn(`[run-mode] ${cmd.action}: entity "${cmd.entityRef}" not found in scene`);
        } else {
          console.warn(`[run-mode] ${cmd.action}: no entity specified`);
        }
        return;
      }

      const handle = adapter.getHandle(placedId);
      if (!handle) return;

      if (cmd.action === "spawn") {
        // Show the entity and teleport to position
        handle.visible = true;
        const atName = cmd.params["at"] as string | undefined;
        if (atName) {
          const pos = resolvePosition(atName);
          if (pos) {
            handle.x = pos.x;
            handle.y = pos.y;
          }
        }
      } else if (cmd.action === "destroy") {
        // Hide the entity
        handle.visible = false;
      } else if (cmd.action === "playSound") {
        // Skip V1 — just log
        console.log("[run-mode] playSound:", cmd.params["sound"]);
      } else if (cmd.action === "setAnimation") {
        const newState = cmd.params["state"] as string | undefined;
        if (newState) switchAnimation(placedId, newState);
      }
    },

    onInterrupt(cmd: InterruptCommand): void {
      // Clean up all animations for this performance
      const prefix = `${cmd.performanceId}:`;
      for (const [key, anim] of animations) {
        if (key.startsWith(prefix)) {
          // Restore flash tint if interrupted mid-flash
          if (anim.action === "flash") {
            anim.handle.tint = anim.savedTint;
          }
          animations.delete(key);
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Parse a hex color string (#RRGGBB or #RGB) to a numeric value. */
function parseHexColor(hex: string): number {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    const r = parseInt(clean[0]! + clean[0]!, 16);
    const g = parseInt(clean[1]! + clean[1]!, 16);
    const b = parseInt(clean[2]! + clean[2]!, 16);
    return (r << 16) | (g << 8) | b;
  }
  return parseInt(clean, 16);
}

/** Linear interpolation between two colors. t in [0, 1]. */
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bv;
}
