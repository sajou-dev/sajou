/**
 * Signal source block — renders a single source card in the expanded signal zone.
 *
 * Shows: name, URL input, protocol badge, status dot, event rate, connect/disconnect.
 * Used by signal-view.ts in expanded mode.
 */

import type { SignalSource } from "../types.js";
import {
  updateSource,
  removeSource,
  detectProtocol,
  subscribeSignalSources,
  getSignalSourcesState,
} from "../state/signal-source-state.js";
import {
  getConnectionState,
  connect,
  disconnect,
  setConnectionUrl,
  setApiKey,
  subscribeConnection,
} from "./signal-connection.js";

// ---------------------------------------------------------------------------
// Status colors
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  disconnected: "#6E6E8A",
  connecting: "#E8A851",
  connected: "#4A9E6E",
  error: "#C44040",
};

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Create a source block DOM element for a given source. */
export function createSourceBlock(source: SignalSource): HTMLElement {
  const block = document.createElement("div");
  block.className = "source-block";
  block.dataset.sourceId = source.id;

  // -- Header row: name + remove button --
  const header = document.createElement("div");
  header.className = "source-block-header";

  const nameInput = document.createElement("input");
  nameInput.className = "source-block-name";
  nameInput.type = "text";
  nameInput.value = source.name;
  nameInput.addEventListener("change", () => {
    updateSource(source.id, { name: nameInput.value.trim() || source.name });
  });
  header.appendChild(nameInput);

  const removeBtn = document.createElement("button");
  removeBtn.className = "source-block-remove";
  removeBtn.textContent = "\u00D7";
  removeBtn.title = "Remove source";
  removeBtn.addEventListener("click", () => {
    disconnect();
    removeSource(source.id);
  });
  header.appendChild(removeBtn);

  block.appendChild(header);

  // -- Status row: dot + protocol badge + rate --
  const statusRow = document.createElement("div");
  statusRow.className = "source-block-status";

  const dot = document.createElement("span");
  dot.className = "source-block-dot";
  statusRow.appendChild(dot);

  const protoBadge = document.createElement("span");
  protoBadge.className = "source-block-proto";
  statusRow.appendChild(protoBadge);

  const rateEl = document.createElement("span");
  rateEl.className = "source-block-rate";
  statusRow.appendChild(rateEl);

  block.appendChild(statusRow);

  // -- URL row --
  const urlRow = document.createElement("div");
  urlRow.className = "source-block-row";

  const urlInput = document.createElement("input");
  urlInput.className = "source-block-url";
  urlInput.type = "text";
  urlInput.placeholder = "ws://localhost:9100";
  urlInput.value = source.url;
  urlInput.addEventListener("input", () => {
    const url = urlInput.value;
    const proto = detectProtocol(url);
    updateSource(source.id, { url, protocol: proto });
    setConnectionUrl(url);
  });
  urlRow.appendChild(urlInput);

  block.appendChild(urlRow);

  // -- API key row --
  const keyRow = document.createElement("div");
  keyRow.className = "source-block-row";

  const keyInput = document.createElement("input");
  keyInput.className = "source-block-url";
  keyInput.type = "password";
  keyInput.placeholder = "API key (optional)";
  keyInput.value = source.apiKey;
  keyInput.addEventListener("input", () => {
    updateSource(source.id, { apiKey: keyInput.value });
    setApiKey(keyInput.value);
  });
  keyRow.appendChild(keyInput);

  block.appendChild(keyRow);

  // -- Connect/Disconnect button --
  const actionBtn = document.createElement("button");
  actionBtn.className = "source-block-action";
  actionBtn.addEventListener("click", () => {
    const connState = getConnectionState();
    if (connState.status === "connected" || connState.status === "connecting") {
      disconnect();
    } else {
      connect(urlInput.value);
    }
  });
  block.appendChild(actionBtn);

  // -- Error display --
  const errorEl = document.createElement("div");
  errorEl.className = "source-block-error";
  errorEl.hidden = true;
  block.appendChild(errorEl);

  // -- Sync from connection state --
  function syncFromConnection(): void {
    const st = getConnectionState();

    // Map connection state to source state
    updateSource(source.id, {
      status: st.status,
      error: st.error,
      protocol: st.protocol,
    });

    // Dot color
    dot.style.background = STATUS_COLORS[st.status] ?? STATUS_COLORS.disconnected;

    // Protocol badge
    const protoLabels: Record<string, string> = {
      websocket: "WS",
      sse: "SSE",
      openai: "OPENAI",
    };
    protoBadge.textContent = protoLabels[st.protocol] ?? st.protocol;
    protoBadge.className = `source-block-proto source-block-proto--${st.protocol}`;

    // Action button
    if (st.status === "connected" || st.status === "connecting") {
      actionBtn.textContent = "Disconnect";
      actionBtn.className = "source-block-action source-block-action--disconnect";
      urlInput.disabled = true;
      keyInput.disabled = true;
    } else {
      actionBtn.textContent = "Connect";
      actionBtn.className = "source-block-action source-block-action--connect";
      urlInput.disabled = false;
      keyInput.disabled = false;
    }

    // Error
    if (st.error) {
      errorEl.textContent = st.error;
      errorEl.hidden = false;
    } else {
      errorEl.hidden = true;
    }
  }

  subscribeConnection(syncFromConnection);
  syncFromConnection();

  // -- Sync event rate from source state --
  subscribeSignalSources(() => {
    const s = getSignalSourcesState().sources.find((x) => x.id === source.id);
    if (s) {
      rateEl.textContent = s.eventsPerSecond > 0 ? `${s.eventsPerSecond} evt/s` : "";
    }
  });

  return block;
}
