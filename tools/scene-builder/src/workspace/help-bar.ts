/**
 * Help bar module.
 *
 * Thin contextual hint bar at the bottom of the workspace.
 * Shows keyboard shortcuts and interaction hints for the active tool.
 * Subscribes to editor state and updates automatically on tool change.
 */

import type { ToolId } from "../types.js";
import { getEditorState, subscribeEditor } from "../state/editor-state.js";

// ---------------------------------------------------------------------------
// Hint definitions (static HTML per tool)
// ---------------------------------------------------------------------------

/** Build a hint segment with optional kbd-styled shortcuts. */
function hint(text: string): string {
  return `<span class="hb-hint">${text}</span>`;
}

function sep(): string {
  return '<span class="hb-sep">&middot;</span>';
}

function toolLabel(name: string): string {
  return `<span class="hb-tool">${name}</span>`;
}

/**
 * Tool hints — one entry per ToolId.
 * Each returns an HTML string describing available interactions.
 */
const TOOL_HINTS: Record<ToolId, () => string> = {
  select: () =>
    toolLabel("Select") +
    hint("Click to select") + sep() +
    hint("Drag to move") + sep() +
    hint("<kbd>Shift</kbd>+click multi-select") + sep() +
    hint("<kbd>Delete</kbd> to remove"),

  hand: () =>
    toolLabel("Hand") +
    hint("Drag to pan") + sep() +
    hint("Scroll to zoom") + sep() +
    hint("<kbd>Space</kbd>+drag from any tool"),

  background: () =>
    toolLabel("Background") +
    hint("Click canvas to set background color") + sep() +
    hint("Use toolbar color picker"),

  place: () =>
    toolLabel("Place") +
    hint("Select entity in palette, then click canvas to place"),

  position: () =>
    toolLabel("Position") +
    hint("Click to create marker") + sep() +
    hint("Drag to move") + sep() +
    hint("<kbd>Alt</kbd>+click to delete") + sep() +
    hint("<kbd>Delete</kbd> to remove selected"),

  route: () => {
    const { routeCreationPreview } = getEditorState();
    if (routeCreationPreview) {
      return (
        toolLabel("Route") +
        hint("Adding points\u2026") + sep() +
        hint("<kbd>Shift</kbd>+click for smooth corner") + sep() +
        hint("Double-click to finish") + sep() +
        hint("<kbd>Escape</kbd> to cancel")
      );
    }
    return (
      toolLabel("Route") +
      hint("Click to place points") + sep() +
      hint("<kbd>Shift</kbd>+click for smooth corner") + sep() +
      hint("Double-click to finish") + sep() +
      hint("<kbd>Escape</kbd> to cancel") + sep() +
      hint("<kbd>Delete</kbd> to remove selected")
    );
  },
};

// ---------------------------------------------------------------------------
// Visibility toggle
// ---------------------------------------------------------------------------

let visible = true;

/** Toggle help bar visibility. Returns new visibility state. */
export function toggleHelpBar(): boolean {
  visible = !visible;
  applyVisibility();
  return visible;
}

/** Get current help bar visibility. */
export function isHelpBarVisible(): boolean {
  return visible;
}

function applyVisibility(): void {
  const el = document.getElementById("help-bar");
  if (!el) return;
  el.classList.toggle("help-bar--hidden", !visible);

  // Adjust workspace height
  const workspace = document.getElementById("workspace");
  if (workspace) {
    workspace.style.height = visible
      ? "calc(100vh - 40px - 24px)"
      : "calc(100vh - 40px)";
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

let lastHtml = "";

function render(): void {
  const el = document.getElementById("help-bar");
  if (!el || !visible) return;

  const { activeTool } = getEditorState();
  const buildHint = TOOL_HINTS[activeTool];
  const html = buildHint ? buildHint() : "";

  // Skip DOM write if unchanged
  if (html === lastHtml) return;
  lastHtml = html;
  el.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the help bar. Call once after DOM is ready. */
export function initHelpBar(): void {
  applyVisibility();
  render();
  subscribeEditor(render);
}
