/**
 * Signal view — full workspace for the Signal layer.
 *
 * Layout:
 *   .sv-sidebar (left, 280px)
 *     ├── Connection section (URL, API key, protocol badge, connect/disconnect, status)
 *     ├── Prompt section (OpenAI mode only — model select, textarea, send/stop)
 *     ├── Timeline section (embedded signal-timeline-panel)
 *     └── Capture section (capture live signals → timeline)
 *   .sv-main (right, flex:1)
 *     ├── Log toolbar (search, type filters, clear)
 *     └── Raw log (scrollable, auto-scroll, color-coded entries)
 */

import {
  getConnectionState,
  connect,
  disconnect,
  setConnectionUrl,
  setApiKey,
  setSelectedModel,
  subscribeConnection,
  onSignal,
  onDebug,
  sendPrompt,
  stopPrompt,
} from "./signal-connection.js";
import type { ReceivedSignal } from "./signal-connection.js";
import { addLogEntry, initRawLog, addDebugEntry } from "./signal-raw-log.js";
import { initSignalTimelinePanel } from "../panels/signal-timeline-panel.js";
import {
  getSignalTimelineState,
  updateSignalTimelineState,
} from "../state/signal-timeline-state.js";
import type { SignalTimelineStep, SignalType } from "../types.js";

// ---------------------------------------------------------------------------
// Capture state
// ---------------------------------------------------------------------------

let capturing = false;
let captureStartTime: number | null = null;
let lastSignalTime: number | null = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let initialized = false;

/** Initialize the Signal view. Idempotent — only runs once. */
export function initSignalView(): void {
  if (initialized) return;
  initialized = true;

  const viewEl = document.getElementById("view-signal");
  if (!viewEl) return;

  // ── Build sidebar ──
  const sidebar = document.createElement("div");
  sidebar.className = "sv-sidebar";

  // Connection section
  const connSection = buildConnectionSection();
  sidebar.appendChild(connSection);

  // Prompt section (OpenAI mode — hidden by default)
  const promptSection = buildPromptSection();
  sidebar.appendChild(promptSection);

  // Timeline section
  const timelineSection = document.createElement("div");
  timelineSection.className = "sv-section";
  const timelineTitle = document.createElement("div");
  timelineTitle.className = "sv-section-title";
  timelineTitle.textContent = "Timeline";
  timelineSection.appendChild(timelineTitle);

  const timelineContainer = document.createElement("div");
  timelineContainer.className = "sv-timeline-container";
  initSignalTimelinePanel(timelineContainer);
  timelineSection.appendChild(timelineContainer);
  sidebar.appendChild(timelineSection);

  // Capture section
  const captureSection = buildCaptureSection();
  sidebar.appendChild(captureSection);

  viewEl.appendChild(sidebar);

  // ── Build main area (raw log) ──
  const main = document.createElement("div");
  main.className = "sv-main";
  initRawLog(main);
  viewEl.appendChild(main);

  // ── Wire incoming signals to raw log ──
  onSignal((signal: ReceivedSignal) => {
    addLogEntry(signal);

    // If capturing, also add to timeline
    if (capturing) {
      captureSignal(signal);
    }
  });

  // ── Wire debug messages to raw log ──
  onDebug((message: string, level: "info" | "warn" | "error") => {
    addDebugEntry(message, level);
  });
}

// ---------------------------------------------------------------------------
// Connection section
// ---------------------------------------------------------------------------

function buildConnectionSection(): HTMLElement {
  const section = document.createElement("div");
  section.className = "sv-section";

  const title = document.createElement("div");
  title.className = "sv-section-title";
  title.textContent = "Connection";
  section.appendChild(title);

  // URL input + button row
  const row = document.createElement("div");
  row.className = "sv-conn-row";

  const urlInput = document.createElement("input");
  urlInput.className = "sv-conn-url";
  urlInput.type = "text";
  urlInput.placeholder = "ws://localhost:9100";
  urlInput.value = getConnectionState().url;
  urlInput.addEventListener("input", () => {
    setConnectionUrl(urlInput.value);
  });
  row.appendChild(urlInput);

  const actionBtn = document.createElement("button");
  actionBtn.className = "sv-conn-btn sv-conn-btn--connect";
  actionBtn.textContent = "Connect";
  actionBtn.addEventListener("click", () => {
    const st = getConnectionState();
    if (st.status === "connected" || st.status === "connecting") {
      disconnect();
    } else {
      connect(urlInput.value);
    }
  });
  row.appendChild(actionBtn);

  section.appendChild(row);

  // Protocol badge + API key row
  const keyRow = document.createElement("div");
  keyRow.className = "sv-conn-row";

  const protoBadge = document.createElement("span");
  protoBadge.className = "sv-conn-proto";
  protoBadge.textContent = "WS";
  keyRow.appendChild(protoBadge);

  const keyInput = document.createElement("input");
  keyInput.className = "sv-conn-url";
  keyInput.type = "password";
  keyInput.placeholder = "API key (optional)";
  keyInput.value = getConnectionState().apiKey;
  keyInput.addEventListener("input", () => {
    setApiKey(keyInput.value);
  });
  keyRow.appendChild(keyInput);

  section.appendChild(keyRow);

  // Status indicator
  const statusRow = document.createElement("div");
  statusRow.className = "sv-conn-status";

  const dot = document.createElement("span");
  dot.className = "sv-conn-dot sv-conn-dot--disconnected";
  statusRow.appendChild(dot);

  const statusText = document.createElement("span");
  statusText.textContent = "Disconnected";
  statusRow.appendChild(statusText);

  section.appendChild(statusRow);

  // Error line
  const errorEl = document.createElement("div");
  errorEl.className = "sv-conn-error";
  errorEl.hidden = true;
  section.appendChild(errorEl);

  // Sync state
  function sync(): void {
    const st = getConnectionState();

    // URL input
    if (document.activeElement !== urlInput) {
      urlInput.value = st.url;
    }
    urlInput.disabled = st.status === "connected" || st.status === "connecting";

    // API key
    if (document.activeElement !== keyInput) {
      keyInput.value = st.apiKey;
    }
    keyInput.disabled = st.status === "connected" || st.status === "connecting";

    // Protocol badge
    const protoLabels: Record<string, string> = {
      websocket: "WS",
      sse: "SSE",
      openai: "OPENAI",
    };
    protoBadge.textContent = protoLabels[st.protocol] ?? st.protocol;
    protoBadge.className = `sv-conn-proto sv-conn-proto--${st.protocol}`;

    // Button
    if (st.status === "connected" || st.status === "connecting") {
      actionBtn.className = "sv-conn-btn sv-conn-btn--disconnect";
      actionBtn.textContent = "Disconnect";
    } else {
      actionBtn.className = "sv-conn-btn sv-conn-btn--connect";
      actionBtn.textContent = "Connect";
    }

    // Dot
    dot.className = `sv-conn-dot sv-conn-dot--${st.status}`;

    // Status text
    const labels: Record<string, string> = {
      disconnected: "Disconnected",
      connecting: "Connecting…",
      connected: "Connected",
      error: "Error",
    };
    let statusLabel = labels[st.status] ?? st.status;
    if (st.status === "connected" && st.protocol === "openai") {
      statusLabel = `Connected — ${st.selectedModel || "no model"}`;
    }
    statusText.textContent = statusLabel;

    // Error
    if (st.error) {
      errorEl.textContent = st.error;
      errorEl.hidden = false;
    } else {
      errorEl.hidden = true;
    }
  }

  subscribeConnection(sync);
  sync();

  return section;
}

// ---------------------------------------------------------------------------
// Prompt section (OpenAI mode only)
// ---------------------------------------------------------------------------

function buildPromptSection(): HTMLElement {
  const section = document.createElement("div");
  section.className = "sv-section sv-prompt-section";
  section.hidden = true; // Hidden by default — shown when OpenAI connected

  const title = document.createElement("div");
  title.className = "sv-section-title";
  title.textContent = "Prompt";
  section.appendChild(title);

  // Model selector
  const modelRow = document.createElement("div");
  modelRow.className = "sv-conn-row";

  const modelLabel = document.createElement("span");
  modelLabel.className = "sv-prompt-label";
  modelLabel.textContent = "Model";
  modelRow.appendChild(modelLabel);

  const modelSelect = document.createElement("select");
  modelSelect.className = "sv-prompt-model";
  modelSelect.addEventListener("change", () => {
    setSelectedModel(modelSelect.value);
  });
  modelRow.appendChild(modelSelect);

  section.appendChild(modelRow);

  // Prompt textarea
  const textarea = document.createElement("textarea");
  textarea.className = "sv-prompt-textarea";
  textarea.placeholder = "Enter a prompt to test the model…";
  textarea.rows = 3;
  // Ctrl/Cmd+Enter to send
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const st = getConnectionState();
      if (!st.streaming && textarea.value.trim()) {
        sendPrompt(textarea.value.trim());
      }
    }
  });
  section.appendChild(textarea);

  // Send / Stop button
  const sendBtn = document.createElement("button");
  sendBtn.className = "sv-prompt-send";
  sendBtn.textContent = "Send";
  sendBtn.addEventListener("click", () => {
    const st = getConnectionState();
    if (st.streaming) {
      stopPrompt();
    } else if (textarea.value.trim()) {
      sendPrompt(textarea.value.trim());
    }
  });
  section.appendChild(sendBtn);

  // Hint text
  const hint = document.createElement("div");
  hint.className = "sv-prompt-info";
  hint.textContent = "Ctrl+Enter to send. Tokens stream as signals in the log.";
  section.appendChild(hint);

  // Sync visibility and state
  function sync(): void {
    const st = getConnectionState();
    const showPrompt = st.protocol === "openai" && st.status === "connected";
    section.hidden = !showPrompt;

    if (!showPrompt) return;

    // Update model dropdown
    const currentOptions = Array.from(modelSelect.options).map((o) => o.value);
    const modelsChanged =
      st.availableModels.length !== currentOptions.length ||
      st.availableModels.some((m, i) => m !== currentOptions[i]);

    if (modelsChanged) {
      modelSelect.innerHTML = "";
      for (const model of st.availableModels) {
        const opt = document.createElement("option");
        opt.value = model;
        opt.textContent = model;
        modelSelect.appendChild(opt);
      }
    }

    if (document.activeElement !== modelSelect) {
      modelSelect.value = st.selectedModel;
    }

    // Send/Stop button
    if (st.streaming) {
      sendBtn.className = "sv-prompt-send sv-prompt-send--streaming";
      sendBtn.textContent = "Stop";
    } else {
      sendBtn.className = "sv-prompt-send";
      sendBtn.textContent = "Send";
    }

    // Disable textarea during streaming
    textarea.disabled = st.streaming;
    modelSelect.disabled = st.streaming;
  }

  subscribeConnection(sync);
  sync();

  return section;
}

// ---------------------------------------------------------------------------
// Capture section
// ---------------------------------------------------------------------------

function buildCaptureSection(): HTMLElement {
  const section = document.createElement("div");
  section.className = "sv-section";

  const title = document.createElement("div");
  title.className = "sv-section-title";
  title.textContent = "Capture";
  section.appendChild(title);

  const btn = document.createElement("button");
  btn.className = "sv-capture-btn";
  btn.textContent = "Start Capture";
  section.appendChild(btn);

  const info = document.createElement("div");
  info.className = "sv-capture-info";
  info.textContent = "Capture incoming signals as timeline steps with computed delays.";
  section.appendChild(info);

  btn.addEventListener("click", () => {
    if (capturing) {
      stopCapture();
      btn.className = "sv-capture-btn";
      btn.textContent = "Start Capture";
      info.textContent = `Capture stopped. ${getSignalTimelineState().steps.length} steps in timeline.`;
    } else {
      startCapture();
      btn.className = "sv-capture-btn sv-capture-btn--active";
      btn.textContent = "Stop Capture";
      info.textContent = "Recording… Incoming signals are being added to the timeline.";
    }
  });

  return section;
}

// ---------------------------------------------------------------------------
// Capture logic
// ---------------------------------------------------------------------------

function startCapture(): void {
  capturing = true;
  captureStartTime = Date.now();
  lastSignalTime = null;
}

function stopCapture(): void {
  capturing = false;
  captureStartTime = null;
  lastSignalTime = null;
}

/** Convert a received signal into a timeline step and add it. */
function captureSignal(signal: ReceivedSignal): void {
  const now = signal.timestamp;
  let delayMs = 0;

  if (lastSignalTime !== null) {
    delayMs = Math.max(0, now - lastSignalTime);
  } else if (captureStartTime !== null) {
    delayMs = Math.max(0, now - captureStartTime);
  }

  lastSignalTime = now;

  const step: SignalTimelineStep = {
    id: crypto.randomUUID(),
    delayMs,
    type: signal.type as SignalType,
    payload: signal.payload as SignalTimelineStep["payload"],
    correlationId: signal.correlationId,
  };

  const st = getSignalTimelineState();
  updateSignalTimelineState({
    steps: [...st.steps, step],
  });
}
