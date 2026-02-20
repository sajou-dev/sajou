/**
 * Help bar module.
 *
 * Thin contextual hint bar at the bottom of the workspace.
 * Shows keyboard shortcuts and interaction hints for the active tool.
 * Subscribes to editor state and updates automatically on tool change.
 *
 * Also hosts the server connection status indicator (right corner).
 */

import type { ToolId } from "../types.js";
import { getEditorState, subscribeEditor } from "../state/editor-state.js";
import {
  subscribeConnection,
  getConnectionStatus,
  getLastContactAt,
  getConnectionLog,
  getReconnectAttempts,
  getServerBaseUrl,
  switchServer,
} from "../state/server-connection.js";
import type { ServerConnectionStatus } from "../state/server-connection.js";

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
  const hints = buildHint ? buildHint() : "";

  const status = getConnectionStatus();
  const statusClass = `hb-status--${status}`;
  const statusTitle = STATUS_TITLES[status];

  const html =
    hints +
    `<span class="hb-version">v${__APP_VERSION__}</span>` +
    `<button id="server-status-btn" class="hb-status ${statusClass}" title="${statusTitle}" aria-label="${statusTitle}">` +
    `<span class="hb-status-dot"></span>` +
    (status === "local" ? '<span class="hb-status-label">local</span>' : "") +
    `</button>`;

  // Skip DOM write if unchanged
  if (html === lastHtml) return;
  lastHtml = html;
  el.innerHTML = html;

  // Re-attach click handler after innerHTML replace
  const btn = document.getElementById("server-status-btn");
  if (btn) btn.addEventListener("click", togglePopover);
}

const STATUS_TITLES: Record<ServerConnectionStatus, string> = {
  connected: "Connected to sajou server",
  local: "Working offline (local mode)",
  reconnecting: "Reconnecting to server…",
};

// ---------------------------------------------------------------------------
// Connection status popover
// ---------------------------------------------------------------------------

let popoverEl: HTMLElement | null = null;
let popoverUnsub: (() => void) | null = null;

function togglePopover(): void {
  if (popoverEl) {
    destroyPopover();
  } else {
    createPopover();
  }
}

function createPopover(): void {
  if (popoverEl) return;

  const anchor = document.getElementById("server-status-btn");
  if (!anchor) return;

  const div = document.createElement("div");
  div.className = "server-popover";
  div.innerHTML = buildPopoverContent();

  document.body.appendChild(div);
  popoverEl = div;

  attachPopoverHandlers();

  // Position above the button, anchored to bottom-right
  positionPopover(anchor);

  // Live updates
  popoverUnsub = subscribeConnection(updatePopoverContent);

  // Close on click outside or Escape
  requestAnimationFrame(() => {
    document.addEventListener("pointerdown", onOutsideClick);
    document.addEventListener("keydown", onEscapeKey);
  });
}

function destroyPopover(): void {
  if (popoverEl) {
    popoverEl.remove();
    popoverEl = null;
  }
  if (popoverUnsub) {
    popoverUnsub();
    popoverUnsub = null;
  }
  document.removeEventListener("pointerdown", onOutsideClick);
  document.removeEventListener("keydown", onEscapeKey);
}

function positionPopover(anchor: HTMLElement): void {
  if (!popoverEl) return;
  const rect = anchor.getBoundingClientRect();
  popoverEl.style.bottom = `${window.innerHeight - rect.top + 4}px`;
  popoverEl.style.right = `${window.innerWidth - rect.right}px`;
}

function onOutsideClick(e: PointerEvent): void {
  if (!popoverEl) return;
  const target = e.target as Node;
  if (popoverEl.contains(target)) return;
  const btn = document.getElementById("server-status-btn");
  if (btn && btn.contains(target)) return;
  destroyPopover();
}

function onEscapeKey(e: KeyboardEvent): void {
  if (e.key === "Escape") destroyPopover();
}

function updatePopoverContent(): void {
  if (!popoverEl) return;
  // Preserve the input value if user is typing
  const input = popoverEl.querySelector("#sp-server-input") as HTMLInputElement | null;
  const cursorValue = input?.value;
  const hasFocus = input === document.activeElement;

  popoverEl.innerHTML = buildPopoverContent();
  attachPopoverHandlers();

  // Restore input state if user was editing
  if (hasFocus && cursorValue !== undefined) {
    const newInput = popoverEl.querySelector("#sp-server-input") as HTMLInputElement | null;
    if (newInput) {
      newInput.value = cursorValue;
      newInput.focus();
    }
  }
}

/** Attach click/keydown handlers to popover interactive elements. */
function attachPopoverHandlers(): void {
  if (!popoverEl) return;
  const btn = popoverEl.querySelector("#sp-server-connect");
  const input = popoverEl.querySelector("#sp-server-input") as HTMLInputElement | null;

  const doConnect = (): void => {
    if (!input) return;
    const newUrl = input.value.trim();
    switchServer(newUrl);
  };

  btn?.addEventListener("click", doConnect);
  input?.addEventListener("keydown", (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key === "Enter") {
      ke.preventDefault();
      doConnect();
    }
    // Don't let Escape close popover when input is focused — just blur
    if (ke.key === "Escape") {
      ke.stopPropagation();
      input?.blur();
    }
  });
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function buildPopoverContent(): string {
  const status = getConnectionStatus();
  const lastContact = getLastContactAt();
  const entries = getConnectionLog();
  const attempts = getReconnectAttempts();
  const baseUrl = getServerBaseUrl();

  const statusLine = STATUS_TITLES[status];
  const statusDotClass = `sp-dot sp-dot--${status}`;

  let lastContactLine: string;
  if (lastContact !== null) {
    lastContactLine = formatTime(lastContact);
  } else {
    lastContactLine = "never";
  }

  // Resolved display URL: override or build-time default
  const displayUrl = baseUrl || __SERVER_URL__;

  let html =
    `<div class="sp-header">` +
    `<span class="${statusDotClass}"></span>` +
    `<span class="sp-status-text">${statusLine}</span>` +
    `</div>`;

  // Editable server URL
  html +=
    `<div class="sp-server-row">` +
    `<label class="sp-label" for="sp-server-input">Server</label>` +
    `<div class="sp-server-input-row">` +
    `<input id="sp-server-input" class="sp-input" type="text" ` +
    `value="${escapeAttr(baseUrl)}" placeholder="${escapeAttr(displayUrl)}" spellcheck="false" />` +
    `<button id="sp-server-connect" class="sp-connect-btn" title="Connect">Go</button>` +
    `</div>` +
    `<div class="sp-server-hint">Empty = Vite proxy (${escapeHtml(__SERVER_URL__)})</div>` +
    `</div>`;

  html += `<div class="sp-detail">Last contact: <span class="sp-mono">${lastContactLine}</span></div>`;

  if (status === "reconnecting" && attempts > 0) {
    html += `<div class="sp-detail">Attempts: <span class="sp-mono">${attempts}</span></div>`;
  }

  if (entries.length > 0) {
    html += `<div class="sp-log-title">Recent events</div>`;
    html += `<div class="sp-log">`;
    // Show most recent 10
    const visible = entries.slice(-10);
    for (const entry of visible) {
      html += `<div class="sp-log-entry"><span class="sp-log-time">${formatTime(entry.time)}</span> ${entry.message}</div>`;
    }
    html += `</div>`;
  }

  return html;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Server status init
// ---------------------------------------------------------------------------

function initServerStatus(): void {
  // Re-render help bar when connection status changes (updates dot color)
  subscribeConnection(() => {
    lastHtml = ""; // Force re-render
    render();
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the help bar. Call once after DOM is ready. */
export function initHelpBar(): void {
  applyVisibility();
  render();
  subscribeEditor(render);
  initServerStatus();
}
