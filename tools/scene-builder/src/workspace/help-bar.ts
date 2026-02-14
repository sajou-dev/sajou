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
    hint("<kbd>Ctrl</kbd>+click toggle") + sep() +
    hint("Double-click to edit") + sep() +
    hint("<kbd>Delete</kbd> remove") + sep() +
    hint("<kbd>Ctrl+Z</kbd> undo"),

  hand: () =>
    toolLabel("Hand") +
    hint("Drag to pan") + sep() +
    hint("Scroll to zoom") + sep() +
    hint("<kbd>Space</kbd>+drag from any tool"),

  background: () => {
    const { activeZoneTypeId } = getEditorState();
    if (activeZoneTypeId !== null) {
      return (
        toolLabel("Background") +
        hint("Drag to paint zone") + sep() +
        hint("Right-click to erase") + sep() +
        hint("<kbd>Alt</kbd>+click to erase") + sep() +
        hint("Click chip to deselect")
      );
    }
    return (
      toolLabel("Background") +
      hint("Set scene dimensions and color") + sep() +
      hint("Select a zone type to paint")
    );
  },

  place: () =>
    toolLabel("Place") +
    hint("Select entity in palette, then click canvas to place"),

  position: () =>
    toolLabel("Position") +
    hint("Click to create") + sep() +
    hint("Drag to move") + sep() +
    hint("<kbd>Ctrl</kbd>+click toggle") + sep() +
    hint("<kbd>Delete</kbd> remove selected") + sep() +
    hint("<kbd>Escape</kbd> deselect"),

  route: () => {
    const { routeCreationPreview } = getEditorState();
    if (routeCreationPreview) {
      return (
        toolLabel("Route") +
        hint("Click to add point") + sep() +
        hint("<kbd>Shift</kbd>+click smooth corner") + sep() +
        hint("Double-click to finish") + sep() +
        hint("<kbd>Escape</kbd> cancel")
      );
    }
    return (
      toolLabel("Route") +
      hint("Click to start drawing") + sep() +
      hint("Drag handle to move") + sep() +
      hint("<kbd>Shift</kbd>+click handle sharp\u2194smooth") + sep() +
      hint("Double-click segment to insert") + sep() +
      hint("<kbd>Delete</kbd> point or route")
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
