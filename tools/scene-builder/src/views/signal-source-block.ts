/**
 * Signal source block — renders a single source card in the signal zone.
 *
 * Pure render function: creates a DOM element from a SignalSource snapshot.
 * Does NOT subscribe to global state — the parent (signal-view) handles
 * re-rendering when state changes. This avoids infinite recursion loops
 * (block → updateSource → notify → renderBlocks → createBlock → repeat).
 *
 * Each source block manages its own independent connection via
 * connectSource/disconnectSource (per-source architecture).
 */

import type { SignalSource } from "../types.js";
import {
  updateSource,
  removeSource,
  detectProtocol,
} from "../state/signal-source-state.js";
import {
  connectSource,
  disconnectSource,
  sendPromptToSource,
  stopSourcePrompt,
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

/** Create a source block DOM element from a source snapshot. */
export function createSourceBlock(source: SignalSource): HTMLElement {
  const block = document.createElement("div");
  block.className = "source-block";
  block.dataset.sourceId = source.id;
  block.style.borderLeftColor = source.color;
  block.style.borderLeftWidth = "3px";

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
    disconnectSource(source.id);
    removeSource(source.id);
  });
  header.appendChild(removeBtn);

  block.appendChild(header);

  // -- Status row: dot + protocol badge + rate --
  const statusRow = document.createElement("div");
  statusRow.className = "source-block-status";

  const dot = document.createElement("span");
  dot.className = "source-block-dot";
  dot.style.background = STATUS_COLORS[source.status] ?? STATUS_COLORS.disconnected;
  statusRow.appendChild(dot);

  const protoLabels: Record<string, string> = {
    websocket: "WS",
    sse: "SSE",
    openai: "OPENAI",
  };
  const protoBadge = document.createElement("span");
  protoBadge.className = `source-block-proto source-block-proto--${source.protocol}`;
  protoBadge.textContent = protoLabels[source.protocol] ?? source.protocol;
  statusRow.appendChild(protoBadge);

  const rateEl = document.createElement("span");
  rateEl.className = "source-block-rate";
  rateEl.textContent = source.eventsPerSecond > 0 ? `${source.eventsPerSecond} evt/s` : "";
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
  urlInput.addEventListener("change", () => {
    const url = urlInput.value;
    const proto = detectProtocol(url);
    updateSource(source.id, { url, protocol: proto });
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
  keyInput.addEventListener("change", () => {
    updateSource(source.id, { apiKey: keyInput.value });
  });
  keyRow.appendChild(keyInput);

  block.appendChild(keyRow);

  // -- Connect/Disconnect button --
  const isActive = source.status === "connected" || source.status === "connecting";
  const actionBtn = document.createElement("button");
  actionBtn.className = `source-block-action source-block-action--${isActive ? "disconnect" : "connect"}`;
  actionBtn.textContent = isActive ? "Disconnect" : "Connect";
  if (isActive) {
    urlInput.disabled = true;
    keyInput.disabled = true;
  }
  actionBtn.addEventListener("click", () => {
    if (source.status === "connected" || source.status === "connecting") {
      disconnectSource(source.id);
    } else {
      connectSource(source.id, urlInput.value, keyInput.value);
    }
  });
  block.appendChild(actionBtn);

  // -- OpenAI prompt row (only when connected in OpenAI mode) --
  if (source.protocol === "openai" && source.status === "connected") {
    const promptRow = document.createElement("div");
    promptRow.className = "source-block-prompt";

    // Model display
    if (source.selectedModel) {
      const modelBadge = document.createElement("span");
      modelBadge.className = "source-block-model";
      modelBadge.textContent = source.selectedModel;
      promptRow.appendChild(modelBadge);
    }

    const promptInput = document.createElement("input");
    promptInput.className = "source-block-url";
    promptInput.type = "text";
    promptInput.placeholder = "Test prompt…";

    if (source.streaming) {
      promptInput.disabled = true;
      const stopBtn = document.createElement("button");
      stopBtn.className = "source-block-action source-block-action--disconnect";
      stopBtn.textContent = "Stop";
      stopBtn.addEventListener("click", () => stopSourcePrompt(source.id));
      promptRow.appendChild(promptInput);
      promptRow.appendChild(stopBtn);
    } else {
      const sendBtn = document.createElement("button");
      sendBtn.className = "source-block-action source-block-action--connect";
      sendBtn.textContent = "Send";
      sendBtn.addEventListener("click", () => {
        const text = promptInput.value.trim();
        if (!text) return;
        sendPromptToSource(
          source.id,
          source.url,
          source.apiKey,
          source.selectedModel,
          text,
        );
      });
      // Enter to send
      promptInput.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const text = promptInput.value.trim();
          if (!text) return;
          sendPromptToSource(
            source.id,
            source.url,
            source.apiKey,
            source.selectedModel,
            text,
          );
        }
      });
      promptRow.appendChild(promptInput);
      promptRow.appendChild(sendBtn);
    }

    block.appendChild(promptRow);
  }

  // -- Error display --
  if (source.error) {
    const errorEl = document.createElement("div");
    errorEl.className = "source-block-error";
    errorEl.textContent = source.error;
    block.appendChild(errorEl);
  }

  return block;
}
