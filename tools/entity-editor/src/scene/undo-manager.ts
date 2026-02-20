/**
 * Undo manager module.
 *
 * Command pattern with execute/undo/redo stacks.
 * Global Ctrl+Z / Ctrl+Shift+Z shortcuts when scene tab is active.
 */

import { getState } from "../app-state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A command that can be executed and undone. */
export interface UndoableCommand {
  execute(): void;
  undo(): void;
  description: string;
}

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
  // Clear redo stack on new action
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

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the undo manager with global keyboard shortcuts. */
export function initUndoManager(): void {
  document.addEventListener("keydown", (e) => {
    if (getState().activeTab !== "scene") return;
    if ((e.target as HTMLElement).tagName === "INPUT") return;

    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      redo();
    }

    // Also support Ctrl+Y for redo
    if ((e.ctrlKey || e.metaKey) && e.key === "y") {
      e.preventDefault();
      redo();
    }
  });
}
