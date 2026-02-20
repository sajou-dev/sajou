/**
 * Full-window utility.
 *
 * Covers the entire sajou UI with a single visualizer node content element.
 * Uses `position: fixed` + a CSS class — no browser Fullscreen API,
 * so it works identically in browsers and Tauri.
 */

let activeElement: HTMLElement | null = null;
const listeners: Array<(active: boolean) => void> = [];

function notify(): void {
  const active = activeElement !== null;
  for (const fn of listeners) fn(active);
}

/** Enter full-window mode for the given element. */
export function enterFullWindow(el: HTMLElement): void {
  if (activeElement === el) return;
  if (activeElement) exitFullWindow();
  activeElement = el;
  el.classList.add("fullwindow");
  document.documentElement.classList.add("has-fullwindow");
  notify();
}

/** Exit full-window mode. */
export function exitFullWindow(): void {
  if (!activeElement) return;
  activeElement.classList.remove("fullwindow");
  activeElement = null;
  document.documentElement.classList.remove("has-fullwindow");
  notify();
}

/** Toggle full-window mode on the given element. */
export function toggleFullWindow(el: HTMLElement): void {
  if (activeElement === el) exitFullWindow();
  else enterFullWindow(el);
}

/** Whether any element is currently in full-window mode. */
export function isFullWindow(): boolean {
  return activeElement !== null;
}

/** Get the current full-window element, or null. */
export function getFullWindowElement(): HTMLElement | null {
  return activeElement;
}

/** Subscribe to full-window state changes. Returns an unsubscribe function. */
export function onFullWindowChange(fn: (active: boolean) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
