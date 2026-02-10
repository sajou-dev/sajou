/**
 * Undo/redo manager.
 *
 * Command pattern with symmetric stacks.
 * Global Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts.
 */

import type { UndoableCommand } from "../types.js";

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------

const MAX_STACK = 50;
const undoStack: UndoableCommand[] = [];
const redoStack: UndoableCommand[] = [];

/** Execute a command and push it onto the undo stack. */
export function executeCommand(cmd: UndoableCommand): void {
  cmd.execute();
  undoStack.push(cmd);
  if (undoStack.length > MAX_STACK) {
    undoStack.shift();
  }
  redoStack.length = 0;
}

/** Undo the last command. */
export function undo(): void {
  const cmd = undoStack.pop();
  if (!cmd) return;
  cmd.undo();
  redoStack.push(cmd);
}

/** Redo the last undone command. */
export function redo(): void {
  const cmd = redoStack.pop();
  if (!cmd) return;
  cmd.execute();
  undoStack.push(cmd);
}

/** Clear all undo/redo history. Called on scene import to prevent stale references. */
export function clearHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

/** Initialize undo/redo keyboard shortcuts. */
export function initUndoManager(): void {
  document.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      redo();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "y") {
      e.preventDefault();
      redo();
    }
  });
}
