/**
 * Undo/redo manager.
 *
 * Command pattern with symmetric stacks.
 * Global Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts.
 */

import type { UndoableCommand } from "../types.js";
import { shouldSuppressShortcut } from "../shortcuts/shortcut-registry.js";

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------

const MAX_STACK = 50;
const undoStack: UndoableCommand[] = [];
const redoStack: UndoableCommand[] = [];

// ---------------------------------------------------------------------------
// Subscribers — notified after any stack mutation
// ---------------------------------------------------------------------------

type UndoListener = () => void;
const listeners: UndoListener[] = [];

/** Notify all subscribers of a stack change. */
function notify(): void {
  for (const fn of listeners) fn();
}

/** Subscribe to undo/redo stack changes. Returns an unsubscribe function. */
export function subscribeUndo(fn: UndoListener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/** Whether the undo stack has entries. */
export function canUndo(): boolean {
  return undoStack.length > 0;
}

/** Whether the redo stack has entries. */
export function canRedo(): boolean {
  return redoStack.length > 0;
}

/**
 * Execute a command and push it onto the undo stack.
 * Pass `skipExecute = true` when the changes are already applied
 * and you only need to record the undo entry (e.g., after a paint stroke).
 */
export function executeCommand(cmd: UndoableCommand, skipExecute?: boolean): void {
  if (!skipExecute) cmd.execute();
  undoStack.push(cmd);
  if (undoStack.length > MAX_STACK) {
    undoStack.shift();
  }
  redoStack.length = 0;
  notify();
}

/** Undo the last command. */
export function undo(): void {
  const cmd = undoStack.pop();
  if (!cmd) return;
  cmd.undo();
  redoStack.push(cmd);
  notify();
}

/** Redo the last undone command. */
export function redo(): void {
  const cmd = redoStack.pop();
  if (!cmd) return;
  cmd.execute();
  undoStack.push(cmd);
  notify();
}

/** Clear all undo/redo history. Called on scene import to prevent stale references. */
export function clearHistory(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  notify();
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

/** Initialize undo/redo keyboard shortcuts. */
export function initUndoManager(): void {
  document.addEventListener("keydown", (e) => {
    if (shouldSuppressShortcut(e)) return;

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
