/**
 * Run mode command sink — bridges @sajou/core's CommandSink to PixiJS sprites.
 *
 * Receives action commands (start/update/complete/execute/interrupt) from the
 * Choreographer runtime and applies them to the PixiJS display objects living
 * in the scene-renderer's existing canvas.
 *
 * Entity resolution:
 *   entityRef (semantic ID from choreography) → PlacedEntity → PixiJS Sprite
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

import { getEntitySpriteById } from "../canvas/scene-renderer.js";
import { resolveEntityId, resolvePosition } from "./run-mode-resolve.js";
import { switchAnimation } from "./run-mode-animator.js";
import type { Sprite } from "pixi.js";

// ---------------------------------------------------------------------------
// Internal animation state
// ---------------------------------------------------------------------------

/** Tracked state for an animated action (move, fly, flash). */
interface ActiveAnimation {
  /** The PixiJS sprite being animated. */
  sprite: Sprite;
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
}

/** Composite key for tracking animations: performanceId:entityRef. */
function animKey(performanceId: string, entityRef: string): string {
  return `${performanceId}:${entityRef}`;
}

// ---------------------------------------------------------------------------
// RunModeSink
// ---------------------------------------------------------------------------

/** Creates a CommandSink implementation that drives PixiJS sprites. */
export function createRunModeSink(): CommandSink {
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

      const sprite = getEntitySpriteById(placedId);
      if (!sprite) return;

      const key = animKey(cmd.performanceId, cmd.entityRef);

      if (cmd.action === "move" || cmd.action === "fly") {
        const toName = cmd.params["to"] as string | undefined;
        const target = toName ? resolvePosition(toName) : null;

        animations.set(key, {
          sprite,
          startX: sprite.x,
          startY: sprite.y,
          targetX: target?.x ?? sprite.x,
          targetY: target?.y ?? sprite.y,
          savedTint: 0xffffff,
          action: cmd.action,
        });
      } else if (cmd.action === "flash") {
        animations.set(key, {
          sprite,
          startX: sprite.x,
          startY: sprite.y,
          targetX: sprite.x,
          targetY: sprite.y,
          savedTint: sprite.tint as number,
          action: cmd.action,
        });
      } else if (cmd.action === "wait") {
        // No visual setup needed — timing is handled by the scheduler.
      }
    },

    onActionUpdate(cmd: ActionUpdateCommand): void {
      const key = animKey(cmd.performanceId, cmd.entityRef);
      const anim = animations.get(key);
      if (!anim) return;

      const { sprite, startX, startY, targetX, targetY } = anim;
      const t = cmd.progress;

      if (anim.action === "move") {
        sprite.x = startX + (targetX - startX) * t;
        sprite.y = startY + (targetY - startY) * t;
      } else if (anim.action === "fly") {
        // Move with arc: vertical offset via sin(progress * PI)
        sprite.x = startX + (targetX - startX) * t;
        const linearY = startY + (targetY - startY) * t;
        const arcHeight = Math.abs(targetX - startX) * 0.3;
        sprite.y = linearY - Math.sin(t * Math.PI) * arcHeight;
      } else if (anim.action === "flash") {
        const colorStr = cmd.params["color"] as string | undefined;
        if (colorStr) {
          const flashColor = parseHexColor(colorStr);
          // Blend: at progress 0.5 = full flash color, then fade back
          const intensity = t <= 0.5 ? t * 2 : (1 - t) * 2;
          sprite.tint = lerpColor(anim.savedTint, flashColor, intensity);
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

      const { sprite } = anim;

      if (anim.action === "move" || anim.action === "fly") {
        // Snap to final position
        sprite.x = anim.targetX;
        sprite.y = anim.targetY;
      } else if (anim.action === "flash") {
        // Restore original tint
        sprite.tint = anim.savedTint;
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

      const sprite = getEntitySpriteById(placedId);
      if (!sprite) return;

      if (cmd.action === "spawn") {
        // Show the entity and teleport to position
        sprite.visible = true;
        const atName = cmd.params["at"] as string | undefined;
        if (atName) {
          const pos = resolvePosition(atName);
          if (pos) {
            sprite.x = pos.x;
            sprite.y = pos.y;
          }
        }
      } else if (cmd.action === "destroy") {
        // Hide the entity
        sprite.visible = false;
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
            anim.sprite.tint = anim.savedTint;
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
