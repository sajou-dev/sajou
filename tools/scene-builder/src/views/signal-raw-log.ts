/**
 * Signal raw log — state store + DOM renderer.
 *
 * Maintains a circular buffer of incoming signal entries (max 500).
 * Renders color-coded entries with badge, timestamp, and summary.
 * Supports text search, type filters, clear, and auto-scroll.
 */

import type { ReceivedSignal } from "./signal-connection.js";
import type { SignalType } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 500;

/** Signal type badge colors — matches signal-timeline-panel.ts palette. */
const SIGNAL_TYPE_COLORS: Record<SignalType, string> = {
  task_dispatch: "#E8A851",
  tool_call: "#5B8DEF",
  tool_result: "#4EC9B0",
  token_usage: "#C586C0",
  agent_state_change: "#6A9955",
  error: "#F44747",
  completion: "#4EC9B0",
};

const ALL_SIGNAL_TYPES: SignalType[] = [
  "task_dispatch",
  "tool_call",
  "tool_result",
  "token_usage",
  "agent_state_change",
  "error",
  "completion",
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** A single entry in the raw log. */
export interface RawLogEntry {
  id: string;
  receivedAt: number;
  signal: ReceivedSignal;
  /** True if this is a debug/lifecycle message, not a real signal. */
  isDebug?: boolean;
  /** Debug level (only set when isDebug is true). */
  debugLevel?: "info" | "warn" | "error";
}

let entries: RawLogEntry[] = [];
let searchText = "";
let activeFilters: Set<SignalType> = new Set(ALL_SIGNAL_TYPES);

// ---------------------------------------------------------------------------
// Public API — state
// ---------------------------------------------------------------------------

/** Add a signal to the raw log. */
export function addLogEntry(signal: ReceivedSignal): void {
  const entry: RawLogEntry = {
    id: signal.id,
    receivedAt: Date.now(),
    signal,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }
  renderPending = true;
  scheduleRender();
}

/** Add a debug/lifecycle entry to the raw log (not a signal — system message). */
export function addDebugEntry(message: string, level: "info" | "warn" | "error"): void {
  const now = Date.now();
  const entry: RawLogEntry = {
    id: crypto.randomUUID(),
    receivedAt: now,
    signal: {
      id: crypto.randomUUID(),
      type: "error", // closest match — we override the rendering via isDebug
      timestamp: now,
      source: "system",
      payload: { message, level },
      raw: message,
    },
    isDebug: true,
    debugLevel: level,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }
  renderPending = true;
  scheduleRender();
}

/** Clear all log entries. */
export function clearLog(): void {
  entries = [];
  renderPending = true;
  scheduleRender();
}

/** Get current entry count. */
export function getLogCount(): number {
  return entries.length;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

let container: HTMLElement | null = null;
let logEl: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let renderPending = false;
let userScrolledUp = false;

/** Schedule a render via microtask (batched). */
function scheduleRender(): void {
  if (!renderPending) return;
  queueMicrotask(() => {
    if (renderPending) {
      renderPending = false;
      render();
    }
  });
}

/** Format timestamp as HH:MM:SS.mmm */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

/** Summarize a signal payload for the log line. */
function summarize(signal: ReceivedSignal): string {
  const p = signal.payload;
  switch (signal.type) {
    case "task_dispatch": {
      // Standard: from → to: description | OpenAI: model + description
      const from = p["from"];
      const to = p["to"];
      const desc = p["description"] ?? p["taskId"] ?? "";
      if (from && to) return `${from} → ${to}: ${desc}`;
      const model = p["model"] ?? "";
      return model ? `[${model}] ${desc}` : String(desc);
    }
    case "tool_call":
      return `${p["agentId"]}.${p["toolName"]}()`;
    case "tool_result":
      return `${p["toolName"]} → ${p["success"] ? "ok" : "fail"}`;
    case "token_usage": {
      // Standard: promptTokens + completionTokens | OpenAI streaming: content chunk
      const content = p["content"];
      if (content !== undefined) {
        // OpenAI streaming token — show the text content
        return String(content);
      }
      return `${p["promptTokens"]}+${p["completionTokens"]} tokens (${p["model"] ?? "?"})`;
    }
    case "agent_state_change":
      return `${p["agentId"]}: ${p["from"]} → ${p["to"]}`;
    case "error":
      return `[${p["severity"]}] ${p["message"] ?? ""}`;
    case "completion": {
      // Standard: taskId ✓/✗ result | OpenAI: totalTokens + finishReason
      const icon = p["success"] ? "✓" : "✗";
      const tokens = p["totalTokens"];
      const reason = p["finishReason"];
      if (tokens !== undefined) return `${icon} ${tokens} tokens (${reason ?? "done"})`;
      return `${p["taskId"] ?? ""} ${icon} ${p["result"] ?? ""}`;
    }
    default:
      return JSON.stringify(p).slice(0, 80);
  }
}

/** Get filtered entries based on active filters and search text. */
function getFilteredEntries(): RawLogEntry[] {
  let result = entries;

  // Type filter (debug entries always pass through)
  if (activeFilters.size < ALL_SIGNAL_TYPES.length) {
    result = result.filter((e) => e.isDebug || activeFilters.has(e.signal.type));
  }

  // Text search
  if (searchText) {
    const lower = searchText.toLowerCase();
    result = result.filter(
      (e) =>
        e.signal.raw.toLowerCase().includes(lower) ||
        e.signal.type.toLowerCase().includes(lower),
    );
  }

  return result;
}

/** Render the full log area. */
function render(): void {
  if (!logEl) return;

  const filtered = getFilteredEntries();

  if (filtered.length === 0) {
    logEl.innerHTML = `<div class="sv-log-empty">${
      entries.length === 0
        ? "No signals received yet. Connect to a signal source to start."
        : "No entries match the current filters."
    }</div>`;
    return;
  }

  // Build DOM in a fragment for performance
  const frag = document.createDocumentFragment();

  for (const entry of filtered) {
    const row = document.createElement("div");

    if (entry.isDebug) {
      // Debug/lifecycle entry — different styling
      row.className = `sv-log-entry sv-log-entry--debug sv-log-entry--${entry.debugLevel ?? "info"}`;

      const ts = document.createElement("span");
      ts.className = "sv-log-ts";
      ts.textContent = formatTime(entry.receivedAt);
      row.appendChild(ts);

      const badge = document.createElement("span");
      badge.className = `sv-log-debug-badge sv-log-debug-badge--${entry.debugLevel ?? "info"}`;
      badge.textContent = entry.debugLevel ?? "info";
      row.appendChild(badge);

      const msg = document.createElement("span");
      msg.className = "sv-log-summary";
      msg.textContent = String(entry.signal.payload["message"] ?? "");
      row.appendChild(msg);
    } else {
      // Normal signal entry
      row.className = "sv-log-entry";

      const color = SIGNAL_TYPE_COLORS[entry.signal.type] ?? "#6E6E8A";

      const ts = document.createElement("span");
      ts.className = "sv-log-ts";
      ts.textContent = formatTime(entry.signal.timestamp);
      row.appendChild(ts);

      const badge = document.createElement("span");
      badge.className = "sv-log-badge";
      badge.textContent = entry.signal.type.replace(/_/g, " ");
      badge.style.background = `${color}22`;
      badge.style.color = color;
      row.appendChild(badge);

      const summary = document.createElement("span");
      summary.className = "sv-log-summary";
      summary.textContent = summarize(entry.signal);
      row.appendChild(summary);
    }

    frag.appendChild(row);
  }

  logEl.innerHTML = "";
  logEl.appendChild(frag);

  // Auto-scroll to bottom unless user scrolled up
  if (!userScrolledUp) {
    logEl.scrollTop = logEl.scrollHeight;
  }
}

/** Build the toolbar (search + filters + clear). */
function buildToolbar(parent: HTMLElement): void {
  const toolbar = document.createElement("div");
  toolbar.className = "sv-log-toolbar";

  // Search
  searchInput = document.createElement("input");
  searchInput.className = "sv-log-search";
  searchInput.type = "text";
  searchInput.placeholder = "Search signals...";
  searchInput.addEventListener("input", () => {
    searchText = searchInput?.value ?? "";
    renderPending = true;
    scheduleRender();
  });
  toolbar.appendChild(searchInput);

  // Filters
  const filters = document.createElement("div");
  filters.className = "sv-log-filters";

  for (const type of ALL_SIGNAL_TYPES) {
    const btn = document.createElement("button");
    btn.className = "sv-log-filter sv-log-filter--active";
    const color = SIGNAL_TYPE_COLORS[type];
    btn.innerHTML = `<span class="sv-log-filter-dot" style="background:${color}"></span>${type.replace(/_/g, " ")}`;

    btn.addEventListener("click", () => {
      if (activeFilters.has(type)) {
        activeFilters.delete(type);
        btn.classList.remove("sv-log-filter--active");
      } else {
        activeFilters.add(type);
        btn.classList.add("sv-log-filter--active");
      }
      renderPending = true;
      scheduleRender();
    });

    filters.appendChild(btn);
  }

  toolbar.appendChild(filters);

  // Clear button
  const clearBtn = document.createElement("button");
  clearBtn.className = "sv-log-clear";
  clearBtn.textContent = "Clear";
  clearBtn.addEventListener("click", clearLog);
  toolbar.appendChild(clearBtn);

  parent.appendChild(toolbar);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the raw log renderer into the given container element. */
export function initRawLog(parent: HTMLElement): void {
  container = parent;

  // Toolbar
  buildToolbar(container);

  // Log area
  logEl = document.createElement("div");
  logEl.className = "sv-log";
  container.appendChild(logEl);

  // Track user scroll position for auto-scroll behavior
  logEl.addEventListener("scroll", () => {
    if (!logEl) return;
    const distFromBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight;
    userScrolledUp = distFromBottom > 40;
  });

  // Initial render (empty state)
  renderPending = true;
  scheduleRender();
}
