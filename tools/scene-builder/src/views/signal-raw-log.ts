/**
 * Signal raw log — state store + DOM renderer.
 *
 * Maintains a circular buffer of incoming signal entries (max 500).
 * Renders color-coded entries with badge, timestamp, and summary.
 * Supports text search, type filters, source/connection filters,
 * clear, and auto-scroll.
 */

import type { ReceivedSignal } from "./signal-connection.js";
import type { SignalType } from "../types.js";
import {
  getSignalSourcesState,
  subscribeSignalSources,
} from "../state/signal-source-state.js";
import {
  SIGNAL_TYPES as ALL_SIGNAL_TYPES,
  SIGNAL_TYPE_COLORS,
} from "./step-commands.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 500;

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
  /** The connection source ID that generated this entry. */
  sourceId?: string;
}

let entries: RawLogEntry[] = [];
let searchText = "";
let activeFilters: Set<SignalType> = new Set(ALL_SIGNAL_TYPES);

/**
 * Source filter state.
 * null = "all sources" (no filtering).
 * Set<string> = only show entries from these sourceIds.
 */
let activeSourceFilter: Set<string> | null = null;

/** Track which sourceIds we've seen in the log (for dynamic filter buttons). */
const knownSourceIds = new Set<string>();

// ---------------------------------------------------------------------------
// Public API — state
// ---------------------------------------------------------------------------

/** Add a signal to the raw log. */
export function addLogEntry(signal: ReceivedSignal, sourceId?: string): void {
  const entry: RawLogEntry = {
    id: signal.id,
    receivedAt: Date.now(),
    signal,
    sourceId,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }
  if (sourceId) trackSource(sourceId);
  renderPending = true;
  scheduleRender();
}

/** Add a debug/lifecycle entry to the raw log (not a signal — system message). */
export function addDebugEntry(
  message: string,
  level: "info" | "warn" | "error",
  sourceId?: string,
): void {
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
    sourceId,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }
  if (sourceId) trackSource(sourceId);
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
// Source tracking
// ---------------------------------------------------------------------------

/** Track a new sourceId and rebuild source filter buttons if needed. */
function trackSource(sourceId: string): void {
  if (knownSourceIds.has(sourceId)) return;
  knownSourceIds.add(sourceId);
  rebuildSourceFilters();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

let container: HTMLElement | null = null;
let logEl: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let sourceFiltersEl: HTMLElement | null = null;
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
    case "event": {
      // OpenClaw: {"type":"event","event":"agent","payload":{"runId":...,"stream":"assistant","data":{...}}}
      const evtName = p["event"] ?? "";
      const inner = p["payload"] as Record<string, unknown> | undefined;
      if (inner) {
        const stream = inner["stream"] ?? "";
        const data = inner["data"] as Record<string, unknown> | undefined;
        const text = data?.["text"] ?? data?.["content"] ?? "";
        if (stream === "assistant" && text) {
          return `${String(text).slice(0, 150)}`;
        }
        if (stream === "tool") {
          const toolName = data?.["name"] ?? data?.["toolName"] ?? "tool";
          return `tool: ${toolName}`;
        }
        if (stream === "lifecycle") {
          const phase = data?.["phase"] ?? "";
          return `${evtName} ${phase}`;
        }
        if (stream === "thinking") {
          const thought = data?.["text"] ?? "";
          return `thinking: ${String(thought).slice(0, 100)}`;
        }
        return `${evtName}/${stream} ${JSON.stringify(data ?? {}).slice(0, 120)}`;
      }
      // Fallback: generic JSON event
      return `${evtName} ${JSON.stringify(p).slice(0, 150)}`;
    }
    default: {
      // Generic unknown type — best-effort summary
      const eventField = p["event"] ?? p["stream"] ?? p["action"] ?? "";
      const dataField = p["data"] ?? p["message"] ?? p["result"] ?? "";
      if (eventField) {
        const dataSummary = typeof dataField === "object"
          ? JSON.stringify(dataField).slice(0, 120)
          : String(dataField).slice(0, 120);
        return `${eventField} ${dataSummary}`;
      }
      return JSON.stringify(p).slice(0, 200);
    }
  }
}

/** Get filtered entries based on active filters, source filter, and search text. */
function getFilteredEntries(): RawLogEntry[] {
  let result = entries;

  // Source filter (connection-based)
  if (activeSourceFilter !== null) {
    result = result.filter(
      (e) => e.sourceId !== undefined && activeSourceFilter!.has(e.sourceId),
    );
  }

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

/** Resolve a sourceId to its identity color (unique per source). */
function getSourceIdentityColor(sourceId: string): string {
  const { sources } = getSignalSourcesState();
  const source = sources.find((s) => s.id === sourceId);
  return source?.color ?? "#6E6E8A";
}

/** Resolve a sourceId to its connection status color. */
function getSourceStatusColor(sourceId: string): string {
  const { sources } = getSignalSourcesState();
  const source = sources.find((s) => s.id === sourceId);
  if (source?.status === "connected") return "#4A9E6E";
  if (source?.status === "connecting") return "#E8A851";
  if (source?.status === "error") return "#C44040";
  return "#6E6E8A";
}

/** Resolve a sourceId to a human-readable name via the signal-source-state store. */
function getSourceName(sourceId: string): string {
  const { sources } = getSignalSourcesState();
  const source = sources.find((s) => s.id === sourceId);
  return source?.name ?? sourceId.slice(0, 8);
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

      // Source tag for debug entries — identity color + status dot
      if (entry.sourceId) {
        const idColor = getSourceIdentityColor(entry.sourceId);
        const src = document.createElement("span");
        src.className = "sv-log-source-tag";
        src.style.background = `${idColor}18`;
        src.style.color = idColor;

        const srcDot = document.createElement("span");
        srcDot.className = "sv-log-source-tag-dot";
        srcDot.style.background = getSourceStatusColor(entry.sourceId);
        src.appendChild(srcDot);

        const srcLabel = document.createElement("span");
        srcLabel.textContent = getSourceName(entry.sourceId);
        src.appendChild(srcLabel);

        row.appendChild(src);
      }

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

      // Source tag (connection name) — identity color tint + status dot
      if (entry.sourceId) {
        const idColor = getSourceIdentityColor(entry.sourceId);
        const src = document.createElement("span");
        src.className = "sv-log-source-tag";
        src.style.background = `${idColor}18`;
        src.style.color = idColor;

        const srcDot = document.createElement("span");
        srcDot.className = "sv-log-source-tag-dot";
        srcDot.style.background = getSourceStatusColor(entry.sourceId);
        src.appendChild(srcDot);

        const srcLabel = document.createElement("span");
        srcLabel.textContent = getSourceName(entry.sourceId);
        src.appendChild(srcLabel);

        row.appendChild(src);
      } else if (entry.signal.source && entry.signal.source !== "system") {
        const src = document.createElement("span");
        src.className = "sv-log-source";
        src.textContent = entry.signal.source;
        row.appendChild(src);
      }

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

    // Click-to-expand: toggle raw JSON display
    row.addEventListener("click", () => {
      const existing = row.querySelector(".sv-log-raw-expand");
      if (existing) {
        existing.remove();
        return;
      }
      const rawEl = document.createElement("pre");
      rawEl.className = "sv-log-raw-expand";
      try {
        rawEl.textContent = JSON.stringify(JSON.parse(entry.signal.raw), null, 2);
      } catch {
        rawEl.textContent = entry.signal.raw;
      }
      row.appendChild(rawEl);
    });

    frag.appendChild(row);
  }

  logEl.innerHTML = "";
  logEl.appendChild(frag);

  // Auto-scroll to bottom unless user scrolled up
  if (!userScrolledUp) {
    logEl.scrollTop = logEl.scrollHeight;
  }
}

/** Build the toolbar (search + source filters + type filters + clear). */
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

  // Source filters container (dynamic — rebuilt when new sources appear)
  sourceFiltersEl = document.createElement("div");
  sourceFiltersEl.className = "sv-log-source-filters";
  toolbar.appendChild(sourceFiltersEl);

  // Type filters
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

  // Initial source filters render
  rebuildSourceFilters();
}

/** Rebuild the source filter buttons (called when new sources appear). */
function rebuildSourceFilters(): void {
  if (!sourceFiltersEl) return;
  sourceFiltersEl.innerHTML = "";

  // Merge known sourceIds from log entries with current sources from state
  const { sources } = getSignalSourcesState();
  const allIds = new Set(knownSourceIds);
  for (const s of sources) allIds.add(s.id);

  // Don't show source filters if there's only 0 or 1 source
  if (allIds.size <= 1) return;

  // "All" button
  const allBtn = document.createElement("button");
  allBtn.className = "sv-log-source-filter";
  if (activeSourceFilter === null) {
    allBtn.classList.add("sv-log-source-filter--active");
  }
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    activeSourceFilter = null;
    rebuildSourceFilters();
    renderPending = true;
    scheduleRender();
  });
  sourceFiltersEl.appendChild(allBtn);

  // Per-source buttons
  for (const srcId of allIds) {
    const name = getSourceName(srcId);
    const source = sources.find((s) => s.id === srcId);
    const idColor = source?.color ?? "#6E6E8A";

    const btn = document.createElement("button");
    btn.className = "sv-log-source-filter";
    btn.style.color = idColor;

    if (activeSourceFilter !== null && activeSourceFilter.has(srcId)) {
      btn.classList.add("sv-log-source-filter--active");
    }

    // Status dot (status color, not identity)
    const dot = document.createElement("span");
    dot.className = "sv-log-source-filter-dot";
    const statusColor = source?.status === "connected" ? "#4A9E6E"
      : source?.status === "connecting" ? "#E8A851"
      : source?.status === "error" ? "#C44040"
      : "#6E6E8A";
    dot.style.background = statusColor;
    btn.appendChild(dot);

    const label = document.createElement("span");
    label.textContent = name;
    btn.appendChild(label);

    btn.addEventListener("click", () => {
      if (activeSourceFilter !== null && activeSourceFilter.has(srcId)) {
        // Toggle off this source
        activeSourceFilter.delete(srcId);
        if (activeSourceFilter.size === 0) {
          activeSourceFilter = null; // back to "all"
        }
      } else {
        // Toggle on — if coming from "all", start fresh set with just this source
        if (activeSourceFilter === null) {
          activeSourceFilter = new Set([srcId]);
        } else {
          activeSourceFilter.add(srcId);
        }
      }
      rebuildSourceFilters();
      renderPending = true;
      scheduleRender();
    });

    sourceFiltersEl.appendChild(btn);
  }
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

  // Rebuild source filters when sources change (new source added, name changed, etc.)
  subscribeSignalSources(() => {
    rebuildSourceFilters();
  });

  // Initial render (empty state)
  renderPending = true;
  scheduleRender();
}
