/**
 * Shortcut registry.
 *
 * Single source of truth for keyboard shortcut suppression and the
 * declarative shortcut catalog displayed in the shortcuts panel.
 */

// ---------------------------------------------------------------------------
// Suppression helper
// ---------------------------------------------------------------------------

/**
 * Returns `true` when a keyboard event originates from an interactive
 * text-editing context where tool shortcuts must NOT fire.
 *
 * Covers: `<input>`, `<textarea>`, `<select>`, any `contentEditable`
 * element, and CodeMirror editors (`.cm-editor`).
 */
export function shouldSuppressShortcut(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.closest(".cm-editor")) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Shortcut catalog
// ---------------------------------------------------------------------------

/** Shortcut category for grouping in the panel display. */
export type ShortcutCategory =
  | "file"
  | "tools"
  | "panels"
  | "canvas"
  | "editing"
  | "pipeline";

/** A single shortcut entry for display purposes. */
export interface ShortcutEntry {
  /** Human-readable label. */
  label: string;
  /** Key combination displayed in `<kbd>` elements (e.g. `["Ctrl", "S"]`). */
  keys: string[];
  /** Display category. */
  category: ShortcutCategory;
}

/** Declarative catalog of all scene-builder keyboard shortcuts. */
export const SHORTCUTS: readonly ShortcutEntry[] = [
  // -- File --
  { label: "New scene",       keys: ["Ctrl", "N"], category: "file" },
  { label: "Export (save)",   keys: ["Ctrl", "S"], category: "file" },
  { label: "Run / Stop",     keys: ["Ctrl", "R"], category: "file" },

  // -- Tools --
  { label: "Select",         keys: ["V"], category: "tools" },
  { label: "Hand (pan)",     keys: ["H"], category: "tools" },
  { label: "Background",     keys: ["B"], category: "tools" },
  { label: "Place entity",   keys: ["O"], category: "tools" },
  { label: "Position",       keys: ["P"], category: "tools" },
  { label: "Route",          keys: ["R"], category: "tools" },
  { label: "Light",          keys: ["J"], category: "tools" },
  { label: "Particle",       keys: ["K"], category: "tools" },

  // -- Panels --
  { label: "Asset Manager",  keys: ["A"], category: "panels" },
  { label: "Entity Editor",  keys: ["E"], category: "panels" },
  { label: "Layers",         keys: ["L"], category: "panels" },
  { label: "Shortcuts",      keys: ["?"], category: "panels" },

  // -- Canvas --
  { label: "Toggle grid",    keys: ["G"], category: "canvas" },
  { label: "Toggle iso/top", keys: ["I"], category: "canvas" },
  { label: "Pan (hold)",     keys: ["Space"], category: "canvas" },
  { label: "Zoom in",        keys: ["+"], category: "canvas" },
  { label: "Zoom out",       keys: ["-"], category: "canvas" },
  { label: "Zoom 100%",      keys: ["Ctrl", "0"], category: "canvas" },
  { label: "Fit to view",    keys: ["Ctrl", "1"], category: "canvas" },

  // -- Editing --
  { label: "Undo",           keys: ["Ctrl", "Z"], category: "editing" },
  { label: "Redo",           keys: ["Ctrl", "Shift", "Z"], category: "editing" },
  { label: "Delete",         keys: ["Delete"], category: "editing" },
  { label: "Deselect",       keys: ["Escape"], category: "editing" },

  // -- Pipeline --
  { label: "Toggle Signal",        keys: ["1"], category: "pipeline" },
  { label: "Toggle Choreographer", keys: ["2"], category: "pipeline" },
  { label: "Toggle Visual",        keys: ["3"], category: "pipeline" },
  { label: "Toggle Shader",        keys: ["4"], category: "pipeline" },
  { label: "Toggle p5.js",         keys: ["5"], category: "pipeline" },
] as const;
