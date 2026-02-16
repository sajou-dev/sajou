/**
 * Signal source popover — floating config editor for a single source.
 *
 * Opens below (or above) a clicked chip in the source chip bar.
 * Reuses the nc-popover CSS classes from the step-popover pattern.
 *
 * All source mutation callbacks (updateSource, connectSource, etc.)
 * are called directly — no intermediate state.
 */

import type { SignalSource, TransportProtocol } from "../types.js";
import {
  getSignalSourcesState,
  updateSource,
  removeSource,
  detectProtocol,
  subscribeSignalSources,
} from "../state/signal-source-state.js";
import {
  connectSource,
  disconnectSource,
  sendPromptToSource,
  stopSourcePrompt,
  connectLocalSSE,
  disconnectLocalSSE,
} from "./signal-connection.js";

// ---------------------------------------------------------------------------
// Status dot colors (same as old source-block)
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  disconnected: "#6E6E8A",
  connecting: "#E8A851",
  connected: "#4A9E6E",
  error: "#C44040",
  unavailable: "#4A4A5A",
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let popoverEl: HTMLElement | null = null;
let cleanupFn: (() => void) | null = null;
let currentSourceId: string | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return the currently open source ID (if any). */
export function getOpenSourceId(): string | null {
  return currentSourceId;
}

/** Open a config popover anchored to a chip element. */
export function openSourcePopover(sourceId: string, anchorEl: HTMLElement): void {
  // Toggle off if same source
  if (currentSourceId === sourceId && popoverEl) {
    closeSourcePopover();
    return;
  }

  closeSourcePopover();
  currentSourceId = sourceId;

  const source = findSource(sourceId);
  if (!source) return;

  // Create popover element
  const el = document.createElement("div");
  el.className = "nc-popover";

  // Arrow
  const arrow = document.createElement("div");
  arrow.className = "nc-popover-arrow";
  el.appendChild(arrow);

  // Content
  const content = document.createElement("div");
  content.className = "nc-popover-content";

  buildPopoverContent(content, source);

  el.appendChild(content);
  document.body.appendChild(el);
  popoverEl = el;

  // Position below the chip
  positionPopover(el, arrow, anchorEl);

  // Track current anchor — may be replaced by re-renders
  let currentAnchor = anchorEl;

  // Close on click outside or Escape
  const onDocClick = (e: MouseEvent) => {
    if (el.contains(e.target as Node)) return;
    if (currentAnchor.contains(e.target as Node)) return;
    closeSourcePopover();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeSourcePopover();
  };

  // Delay listener to avoid the opening click from closing immediately
  requestAnimationFrame(() => {
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
  });

  // Re-render popover content when source state changes.
  // If the chip anchor was re-rendered, find the new one by data-source-id.
  const unsub = subscribeSignalSources(() => {
    if (!popoverEl) return;

    // Re-anchor if chip was replaced
    if (!currentAnchor.isConnected) {
      const replacement = document.querySelector<HTMLElement>(
        `.sv-source-chip[data-source-id="${sourceId}"]`,
      );
      if (replacement) {
        currentAnchor = replacement;
      } else {
        // Source was deleted
        closeSourcePopover();
        return;
      }
    }

    // Re-render content
    const freshSource = findSource(sourceId);
    if (!freshSource) {
      closeSourcePopover();
      return;
    }
    const contentEl = popoverEl.querySelector(".nc-popover-content");
    if (contentEl) {
      contentEl.innerHTML = "";
      buildPopoverContent(contentEl as HTMLElement, freshSource);
    }

    positionPopover(popoverEl, arrow, currentAnchor);
  });

  cleanupFn = () => {
    document.removeEventListener("mousedown", onDocClick);
    document.removeEventListener("keydown", onKeyDown);
    unsub();
  };
}

/** Close and remove the source popover. */
export function closeSourcePopover(): void {
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }
  if (popoverEl) {
    popoverEl.remove();
    popoverEl = null;
  }
  currentSourceId = null;
}

// ---------------------------------------------------------------------------
// Popover content builder
// ---------------------------------------------------------------------------

function buildPopoverContent(content: HTMLElement, source: SignalSource): void {
  const isActive = source.status === "connected" || source.status === "connecting";
  const isLocal = source.category === "local";
  const isUnavailable = source.status === "unavailable";

  // -- Status row: dot + protocol badge --
  const statusRow = document.createElement("div");
  statusRow.className = "nc-popover-row";
  statusRow.style.gap = "6px";

  const dot = document.createElement("span");
  dot.className = "sv-chip-dot";
  dot.style.background = STATUS_COLORS[source.status] ?? STATUS_COLORS.disconnected;
  statusRow.appendChild(dot);

  const statusLabel = document.createElement("span");
  statusLabel.className = "nc-popover-label";
  statusLabel.style.minWidth = "0";
  statusLabel.style.flex = "1";
  statusLabel.textContent = isUnavailable ? "not detected" : source.status;
  statusRow.appendChild(statusLabel);

  const protoBadge = document.createElement("span");
  protoBadge.className = `sv-chip-proto source-block-proto--${source.protocol}`;
  protoBadge.textContent = { websocket: "WS", sse: "SSE", openai: "AI", openclaw: "CLAW", anthropic: "ANTH" }[source.protocol] ?? source.protocol;
  statusRow.appendChild(protoBadge);

  if (source.eventsPerSecond > 0) {
    const rateEl = document.createElement("span");
    rateEl.className = "nc-popover-label";
    rateEl.style.minWidth = "0";
    rateEl.textContent = `${source.eventsPerSecond} evt/s`;
    statusRow.appendChild(rateEl);
  }

  content.appendChild(statusRow);

  // -- Name input --
  const nameRow = document.createElement("div");
  nameRow.className = "nc-popover-row";

  const nameLabel = document.createElement("span");
  nameLabel.className = "nc-popover-label";
  nameLabel.textContent = "name";
  nameRow.appendChild(nameLabel);

  const nameInput = document.createElement("input");
  nameInput.className = "nc-popover-select";
  nameInput.type = "text";
  nameInput.value = source.name;
  nameInput.disabled = isLocal;
  nameInput.addEventListener("change", () => {
    updateSource(source.id, { name: nameInput.value.trim() || source.name });
  });
  nameRow.appendChild(nameInput);
  content.appendChild(nameRow);

  // -- Protocol selector for local HTTP-based sources (LM Studio, Ollama) --
  if (isLocal && source.protocol !== "sse" && source.protocol !== "openclaw") {
    const protoRow = document.createElement("div");
    protoRow.className = "nc-popover-row";

    const protoLabel = document.createElement("span");
    protoLabel.className = "nc-popover-label";
    protoLabel.textContent = "protocol";
    protoRow.appendChild(protoLabel);

    const protoSelect = document.createElement("select");
    protoSelect.className = "nc-popover-select";
    protoSelect.disabled = isActive;
    for (const [value, label] of [["openai", "OpenAI"], ["sse", "SSE"], ["anthropic", "Anthropic"]] as const) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      if (source.protocol === value) opt.selected = true;
      protoSelect.appendChild(opt);
    }
    protoSelect.addEventListener("change", () => {
      updateSource(source.id, { protocol: protoSelect.value as TransportProtocol });
    });
    protoRow.appendChild(protoSelect);
    content.appendChild(protoRow);
  }

  // -- URL + API key inputs --
  // Local sources: show URL read-only (pre-filled), hide for SSE locals (Claude Code)
  // Remote sources: fully editable
  if (!isLocal || source.protocol !== "sse") {
    const urlRow = document.createElement("div");
    urlRow.className = "nc-popover-row";

    const urlLabel = document.createElement("span");
    urlLabel.className = "nc-popover-label";
    urlLabel.textContent = "url";
    urlRow.appendChild(urlLabel);

    const urlInput = document.createElement("input");
    urlInput.className = "nc-popover-select";
    urlInput.type = "text";
    urlInput.placeholder = "wss://test.sajou.dev/signals";
    urlInput.value = source.url;
    urlInput.disabled = isActive || isLocal;
    if (!isLocal) {
      urlInput.addEventListener("change", () => {
        const url = urlInput.value;
        const proto = detectProtocol(url);
        updateSource(source.id, { url, protocol: proto });
      });
    }
    urlRow.appendChild(urlInput);
    content.appendChild(urlRow);
  }

  // API key — show for remote sources and local sources with non-SSE protocols
  if (!isLocal || (isLocal && source.protocol !== "sse")) {
    const keyRow = document.createElement("div");
    keyRow.className = "nc-popover-row";

    const keyLabel = document.createElement("span");
    keyLabel.className = "nc-popover-label";
    keyLabel.textContent = "key";
    keyRow.appendChild(keyLabel);

    const keyWrap = document.createElement("div");
    keyWrap.style.display = "flex";
    keyWrap.style.gap = "4px";
    keyWrap.style.flex = "1";
    keyWrap.style.minWidth = "0";

    const keyInput = document.createElement("input");
    keyInput.className = "nc-popover-select";
    keyInput.style.flex = "1";
    keyInput.style.minWidth = "0";
    keyInput.type = "password";
    keyInput.placeholder = source.id === "local:openclaw"
      ? "Auto-filled from ~/.openclaw"
      : "API key (optional)";
    keyInput.value = source.apiKey;
    keyInput.disabled = isActive;
    keyInput.addEventListener("change", () => {
      updateSource(source.id, { apiKey: keyInput.value });
    });
    keyWrap.appendChild(keyInput);

    // "Paste from config" button for OpenClaw local source
    if (source.id === "local:openclaw" && !isActive) {
      const pasteBtn = document.createElement("button");
      pasteBtn.className = "sv-paste-token-btn";
      pasteBtn.title = "Read token from ~/.openclaw/openclaw.json";
      pasteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`;
      pasteBtn.addEventListener("click", async () => {
        const { fetchOpenClawToken } = await import("../state/local-discovery.js");
        const token = await fetchOpenClawToken();
        if (token) {
          keyInput.value = token;
          updateSource(source.id, { apiKey: token });
        }
      });
      keyWrap.appendChild(pasteBtn);
    }

    keyRow.appendChild(keyWrap);
    content.appendChild(keyRow);
  }

  // -- Connect / Disconnect button --
  if (isUnavailable) {
    const unavailMsg = document.createElement("div");
    unavailMsg.className = "nc-popover-label";
    unavailMsg.style.opacity = "0.5";
    unavailMsg.style.fontStyle = "italic";
    unavailMsg.style.padding = "4px 0";
    unavailMsg.textContent = "Service not detected — click Rescan to retry";
    content.appendChild(unavailMsg);
  } else {
    const actionBtn = document.createElement("button");
    actionBtn.className = `source-block-action source-block-action--${isActive ? "disconnect" : "connect"}`;
    actionBtn.textContent = isActive ? "Disconnect" : "Connect";
    actionBtn.addEventListener("click", () => {
      if (source.id === "local:claude-code") {
        if (isActive) {
          disconnectLocalSSE();
        } else {
          connectLocalSSE(source.id);
        }
      } else if (isActive) {
        disconnectSource(source.id);
      } else {
        connectSource(source.id, source.url, source.apiKey);
      }
    });
    content.appendChild(actionBtn);
  }

  // -- OpenAI prompt section (only when connected in OpenAI mode) --
  if (source.protocol === "openai" && source.status === "connected") {
    const sep = document.createElement("div");
    sep.className = "nc-popover-subtitle";
    sep.textContent = "prompt";
    content.appendChild(sep);

    // Model badge
    if (source.selectedModel) {
      const modelBadge = document.createElement("span");
      modelBadge.className = "source-block-model";
      modelBadge.textContent = source.selectedModel;
      content.appendChild(modelBadge);
    }

    const promptInput = document.createElement("input");
    promptInput.className = "nc-popover-select";
    promptInput.type = "text";
    promptInput.placeholder = "Test prompt\u2026";

    if (source.streaming) {
      promptInput.disabled = true;
      const stopBtn = document.createElement("button");
      stopBtn.className = "source-block-action source-block-action--disconnect";
      stopBtn.textContent = "Stop";
      stopBtn.addEventListener("click", () => stopSourcePrompt(source.id));
      content.appendChild(promptInput);
      content.appendChild(stopBtn);
    } else {
      const sendPrompt = () => {
        const text = promptInput.value.trim();
        if (!text) return;
        sendPromptToSource(
          source.id,
          source.url,
          source.apiKey,
          source.selectedModel,
          text,
        );
      };
      promptInput.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); sendPrompt(); }
      });
      const sendBtn = document.createElement("button");
      sendBtn.className = "source-block-action source-block-action--connect";
      sendBtn.textContent = "Send";
      sendBtn.addEventListener("click", sendPrompt);
      content.appendChild(promptInput);
      content.appendChild(sendBtn);
    }
  }

  // -- Error display --
  if (source.error) {
    const errorEl = document.createElement("div");
    errorEl.className = "source-block-error";
    errorEl.textContent = source.error;
    content.appendChild(errorEl);
  }

  // -- Delete button (only for remote sources) --
  if (!isLocal) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "nc-popover-delete";
    deleteBtn.textContent = "\u2716 Remove source";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      disconnectSource(source.id);
      removeSource(source.id);
      closeSourcePopover();
    });
    content.appendChild(deleteBtn);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findSource(id: string): SignalSource | undefined {
  const { sources } = getSignalSourcesState();
  return sources.find((s) => s.id === id);
}

/** Position the popover below (or above) the anchor element. */
function positionPopover(el: HTMLElement, arrow: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const popoverWidth = 260;
  const margin = 8;

  // Default: below the chip
  let top = rect.bottom + margin;
  let left = rect.left + rect.width / 2 - popoverWidth / 2;

  // Clamp horizontal
  left = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, left));

  // If below would overflow viewport, place above
  const estimatedHeight = 280;
  if (top + estimatedHeight > window.innerHeight - 8) {
    top = rect.top - estimatedHeight - margin;
    el.classList.add("nc-popover--above");
    arrow.style.top = "auto";
    arrow.style.bottom = "-6px";
  } else {
    el.classList.remove("nc-popover--above");
    arrow.style.top = "-6px";
    arrow.style.bottom = "auto";
  }

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.width = `${popoverWidth}px`;

  // Arrow horizontal position
  const arrowLeft = rect.left + rect.width / 2 - left - 6;
  arrow.style.left = `${Math.max(8, Math.min(popoverWidth - 20, arrowLeft))}px`;
}
