/**
 * Speech bubble renderer — Canvas2D overlay.
 *
 * Draws speech bubbles above entities during run mode.
 * Each bubble shows text with a typewriter effect, a pointer triangle
 * pointing down to the entity, word-wrapping, and fade-out on dismiss.
 *
 * Renders in screen-space (not scene-coordinate space) so text is
 * always pixel-perfect regardless of zoom level.
 */

import { getSpeechBubbles, type SpeechBubbleEntry } from "../run-mode/speech-bubble-state.js";
import { getEntityRecord } from "./scene-renderer.js";
import { worldToScreen } from "./canvas.js";
import { getSceneState } from "../state/scene-state.js";
import type { SpeechBubbleConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Default visual config (sajou brand)
// ---------------------------------------------------------------------------

const DEFAULTS: SpeechBubbleConfig = {
  bgColor: "rgba(14, 14, 22, 0.85)",
  borderColor: "rgba(232, 168, 81, 0.3)",
  textColor: "#E0E0E8",
  opacity: 1,
  retentionMs: 5000,
  maxChars: 200,
  fontSize: 12,
  maxWidth: 220,
  tailPosition: "bottom",
};

// ---------------------------------------------------------------------------
// Layout constants (not per-entity)
// ---------------------------------------------------------------------------

const BORDER_RADIUS = 8;
const PADDING_X = 8;
const PADDING_Y = 6;
const MAX_LINES = 5;
const POINTER_WIDTH = 8;
const POINTER_HEIGHT = 6;
const BUBBLE_OFFSET_Y = 12;
const CURSOR_CHAR = "\u258C"; // ▌

/** Resolve per-entity bubble config, merging with defaults. */
function resolveConfig(placedId: string): SpeechBubbleConfig {
  const placed = getSceneState().entities.find(e => e.id === placedId);
  if (!placed?.speechBubble) return DEFAULTS;
  return { ...DEFAULTS, ...placed.speechBubble };
}

// ---------------------------------------------------------------------------
// Word wrap
// ---------------------------------------------------------------------------

/** Word-wrap text to fit within maxWidth, returning lines (max maxLines). */
function wordWrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (!word) continue;
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;

      // Check if we hit the max lines limit
      if (lines.length >= MAX_LINES) {
        // Truncate the last line with ellipsis
        lines[lines.length - 1] = lines[lines.length - 1]! + "...";
        return lines;
      }
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    if (lines.length >= MAX_LINES) {
      lines[lines.length - 1] = lines[lines.length - 1]! + "...";
    } else {
      lines.push(currentLine);
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Rounded rect helper
// ---------------------------------------------------------------------------

/** Draw a rounded rectangle path. */
function roundedRect(
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render all active speech bubbles on the Canvas2D overlay.
 *
 * Called from `drawSceneOverlays()` in screen-space (after ctx.restore()).
 * Each bubble reads its entity's live world position from the Three.js
 * group and projects it to screen coordinates.
 */
export function renderSpeechBubbles(ctx: CanvasRenderingContext2D): void {
  const bubbles = getSpeechBubbles();
  if (bubbles.size === 0) return;

  // Save context state — we draw in raw screen pixels
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textBaseline = "top";

  for (const [placedId, entry] of bubbles) {
    renderOneBubble(ctx, placedId, entry);
  }

  ctx.restore();
}

/** Render a single speech bubble for one entity. */
function renderOneBubble(
  ctx: CanvasRenderingContext2D,
  placedId: string,
  entry: SpeechBubbleEntry,
): void {
  // Get live entity position from Three.js mesh record
  const record = getEntityRecord(placedId);
  if (!record) return;
  if (!record.group.visible) return;

  const pos = record.group.position;
  const screen = worldToScreen(pos.x, pos.y, pos.z);

  // Resolve per-entity config (merges with defaults)
  const config = resolveConfig(placedId);
  const font = `${config.fontSize}px "DM Sans", sans-serif`;
  const lineHeight = Math.round(config.fontSize * 1.33);

  ctx.font = font;

  // Typewriter: show only displayLength characters
  const visibleText = entry.text.slice(0, Math.floor(entry.displayLength));
  if (!visibleText && entry.phase === "typing") return; // Nothing to show yet

  // Add cursor during typing phase
  const displayText = entry.phase === "typing"
    ? visibleText + CURSOR_CHAR
    : visibleText;

  // Word wrap
  const contentWidth = config.maxWidth - PADDING_X * 2;
  const lines = wordWrap(ctx, displayText, contentWidth);
  if (lines.length === 0) return;

  // Measure actual width needed
  let maxLineWidth = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxLineWidth) maxLineWidth = w;
  }

  const bubbleWidth = Math.min(config.maxWidth, maxLineWidth + PADDING_X * 2);
  const bubbleHeight = lines.length * lineHeight + PADDING_Y * 2;

  // Apply opacity: entry fade * config opacity
  ctx.globalAlpha = entry.opacity * config.opacity;

  // Compute bubble + pointer position based on tail position
  let bx: number;
  let by: number;

  switch (config.tailPosition) {
    case "left":
      bx = screen.x + POINTER_HEIGHT + BUBBLE_OFFSET_Y;
      by = screen.y - bubbleHeight / 2;
      break;
    case "right":
      bx = screen.x - bubbleWidth - POINTER_HEIGHT - BUBBLE_OFFSET_Y;
      by = screen.y - bubbleHeight / 2;
      break;
    case "bottom":
    default:
      bx = screen.x - bubbleWidth / 2;
      by = screen.y - bubbleHeight - POINTER_HEIGHT - BUBBLE_OFFSET_Y;
      break;
  }

  // Draw bubble background
  roundedRect(ctx, bx, by, bubbleWidth, bubbleHeight, BORDER_RADIUS);
  ctx.fillStyle = config.bgColor;
  ctx.fill();

  // Draw border
  ctx.strokeStyle = config.borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw pointer triangle
  drawPointerTail(ctx, config, screen, bx, by, bubbleWidth, bubbleHeight);

  // Draw text
  ctx.fillStyle = config.textColor;
  ctx.font = font;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(
      lines[i]!,
      bx + PADDING_X,
      by + PADDING_Y + i * lineHeight,
    );
  }

  // Reset globalAlpha
  ctx.globalAlpha = 1;
}

/** Draw the pointer tail triangle based on tail position. */
function drawPointerTail(
  ctx: CanvasRenderingContext2D,
  config: SpeechBubbleConfig,
  screen: { x: number; y: number },
  bx: number, by: number,
  bubbleWidth: number, bubbleHeight: number,
): void {
  switch (config.tailPosition) {
    case "left": {
      // Pointer on left side, pointing left toward entity
      const pointerX = bx;
      const pointerY = screen.y;
      ctx.beginPath();
      ctx.moveTo(pointerX, pointerY - POINTER_WIDTH / 2);
      ctx.lineTo(pointerX - POINTER_HEIGHT, pointerY);
      ctx.lineTo(pointerX, pointerY + POINTER_WIDTH / 2);
      ctx.closePath();
      ctx.fillStyle = config.bgColor;
      ctx.fill();
      ctx.strokeStyle = config.borderColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      // Seamless edge cover
      ctx.beginPath();
      ctx.moveTo(pointerX, pointerY - POINTER_WIDTH / 2);
      ctx.lineTo(pointerX, pointerY + POINTER_WIDTH / 2);
      ctx.strokeStyle = config.bgColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case "right": {
      // Pointer on right side, pointing right toward entity
      const pointerX = bx + bubbleWidth;
      const pointerY = screen.y;
      ctx.beginPath();
      ctx.moveTo(pointerX, pointerY - POINTER_WIDTH / 2);
      ctx.lineTo(pointerX + POINTER_HEIGHT, pointerY);
      ctx.lineTo(pointerX, pointerY + POINTER_WIDTH / 2);
      ctx.closePath();
      ctx.fillStyle = config.bgColor;
      ctx.fill();
      ctx.strokeStyle = config.borderColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      // Seamless edge cover
      ctx.beginPath();
      ctx.moveTo(pointerX, pointerY - POINTER_WIDTH / 2);
      ctx.lineTo(pointerX, pointerY + POINTER_WIDTH / 2);
      ctx.strokeStyle = config.bgColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case "bottom":
    default: {
      // Pointer below bubble, pointing down to entity
      const pointerX = screen.x;
      const pointerY = by + bubbleHeight;
      ctx.beginPath();
      ctx.moveTo(pointerX - POINTER_WIDTH / 2, pointerY);
      ctx.lineTo(pointerX, pointerY + POINTER_HEIGHT);
      ctx.lineTo(pointerX + POINTER_WIDTH / 2, pointerY);
      ctx.closePath();
      ctx.fillStyle = config.bgColor;
      ctx.fill();
      ctx.strokeStyle = config.borderColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      // Seamless edge cover
      ctx.beginPath();
      ctx.moveTo(pointerX - POINTER_WIDTH / 2, pointerY);
      ctx.lineTo(pointerX + POINTER_WIDTH / 2, pointerY);
      ctx.strokeStyle = config.bgColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
  }
}
