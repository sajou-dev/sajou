/**
 * Signal view — V2 spatial zone for the Signal layer.
 *
 * Dual-mode layout:
 *   Expanded (default for State 0–1):
 *     .sv-sources-area (top, source blocks + add button)
 *     .sv-sidebar (left, 280px — prompt, timeline, capture)
 *     .sv-main (right — raw log)
 *
 *   Compact (State 2–3):
 *     Connector bar only (~40px) — badges for each source
 *
 * Toggling between modes is handled by signal-source-state.expanded.
 */

import {
  getConnectionState,
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
import {
  getSignalSourcesState,
  subscribeSignalSources,
  addSource,
  setSignalZoneExpanded,
} from "../state/signal-source-state.js";
import { createSourceBlock } from "./signal-source-block.js";
import { initSignalConnectorBar } from "./signal-connector-bar.js";
import type { SignalTimelineStep, SignalType } from "../types.js";

// ---------------------------------------------------------------------------
// Capture state
// ---------------------------------------------------------------------------

let capturing = false;
let captureStartTime: number | null = null;
let lastSignalTime: number | null = null;
/** Buffer for captured steps — flushed to timeline state in one batch on stop. */
let captureBuffer: SignalTimelineStep[] = [];
/** Reference to the capture info element for cheap counter updates. */
let captureInfoEl: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

let zoneEl: HTMLElement | null = null;
let expandedContent: HTMLElement | null = null;
let compactBar: HTMLElement | null = null;
let sourcesContainer: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let initialized = false;

/** Initialize the Signal view. Idempotent — only runs once. */
export function initSignalView(): void {
  if (initialized) return;
  initialized = true;

  zoneEl = document.getElementById("zone-signal");
  if (!zoneEl) return;

  // ── Compact bar (connector badges) ──
  compactBar = document.createElement("div");
  compactBar.className = "sv-compact-bar";
  initSignalConnectorBar(compactBar);

  // Toggle button to expand
  const expandBtn = document.createElement("button");
  expandBtn.className = "sv-expand-btn";
  expandBtn.textContent = "▼";
  expandBtn.title = "Expand signal zone";
  expandBtn.addEventListener("click", () => setSignalZoneExpanded(true));
  compactBar.appendChild(expandBtn);

  zoneEl.appendChild(compactBar);

  // ── Expanded content ──
  expandedContent = document.createElement("div");
  expandedContent.className = "sv-expanded";

  // -- Sources area (horizontal blocks) --
  const sourcesArea = document.createElement("div");
  sourcesArea.className = "sv-sources-area";

  sourcesContainer = document.createElement("div");
  sourcesContainer.className = "sv-sources-container";
  sourcesArea.appendChild(sourcesContainer);

  // Add source button
  const addBtn = document.createElement("button");
  addBtn.className = "sv-add-source-btn";
  addBtn.textContent = "+ Add Source";
  addBtn.addEventListener("click", () => addSource());
  sourcesArea.appendChild(addBtn);

  // Collapse button
  const collapseBtn = document.createElement("button");
  collapseBtn.className = "sv-collapse-btn";
  collapseBtn.textContent = "▲ Compact";
  collapseBtn.title = "Collapse to connector bar";
  collapseBtn.addEventListener("click", () => setSignalZoneExpanded(false));
  sourcesArea.appendChild(collapseBtn);

  expandedContent.appendChild(sourcesArea);

  // -- Lower area: sidebar + raw log --
  const lowerArea = document.createElement("div");
  lowerArea.className = "sv-lower-area";

  // Sidebar
  const sidebar = document.createElement("div");
  sidebar.className = "sv-sidebar";

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

  lowerArea.appendChild(sidebar);

  // Raw log
  const main = document.createElement("div");
  main.className = "sv-main";
  initRawLog(main);
  lowerArea.appendChild(main);

  expandedContent.appendChild(lowerArea);
  zoneEl.appendChild(expandedContent);

  // ── Render source blocks ──
  renderSourceBlocks();
  subscribeSignalSources(renderSourceBlocks);

  // ── Sync expanded/compact mode ──
  syncMode();
  subscribeSignalSources(syncMode);

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
// Source blocks rendering
// ---------------------------------------------------------------------------

function renderSourceBlocks(): void {
  if (!sourcesContainer) return;
  sourcesContainer.innerHTML = "";

  const { sources } = getSignalSourcesState();
  for (const source of sources) {
    const block = createSourceBlock(source);
    sourcesContainer.appendChild(block);
  }
}

// ---------------------------------------------------------------------------
// Mode sync (expanded / compact)
// ---------------------------------------------------------------------------

function syncMode(): void {
  if (!zoneEl || !expandedContent || !compactBar) return;
  const { expanded } = getSignalSourcesState();

  if (expanded) {
    expandedContent.style.display = "flex";
    compactBar.style.display = "none";
    zoneEl.style.height = "280px";
    zoneEl.style.minHeight = "120px";
  } else {
    expandedContent.style.display = "none";
    compactBar.style.display = "flex";
    zoneEl.style.height = "40px";
    zoneEl.style.minHeight = "40px";
  }
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
  textarea.placeholder = "Enter a prompt to test the model\u2026";
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

  // Store reference for cheap counter updates during capture
  captureInfoEl = info;

  btn.addEventListener("click", () => {
    if (capturing) {
      const count = captureBuffer.length;
      stopCapture();
      btn.className = "sv-capture-btn";
      btn.textContent = "Start Capture";
      info.textContent = `Capture stopped. ${count} signals added to timeline.`;
    } else {
      startCapture();
      btn.className = "sv-capture-btn sv-capture-btn--active";
      btn.textContent = "Stop Capture";
      info.textContent = "Recording\u2026 0 signals captured";
    }
  });

  return section;
}

// ---------------------------------------------------------------------------
// Capture logic
// ---------------------------------------------------------------------------

function startCapture(): void {
  capturing = true;
  captureBuffer = [];
  captureStartTime = Date.now();
  lastSignalTime = null;
}

function stopCapture(): void {
  capturing = false;
  captureStartTime = null;
  lastSignalTime = null;

  // Flush buffer to timeline state in one batch (single re-render)
  if (captureBuffer.length > 0) {
    const st = getSignalTimelineState();
    updateSignalTimelineState({
      steps: [...st.steps, ...captureBuffer],
    });
  }
  captureBuffer = [];
}

/** Convert a received signal into a timeline step and buffer it locally. */
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
    payload: normalizePayload(signal.type as SignalType, signal.payload),
    correlationId: signal.correlationId,
  };

  // Buffer locally — no state update, no re-render
  captureBuffer.push(step);

  // Cheap counter update (textContent only, no DOM rebuild)
  if (captureInfoEl) {
    captureInfoEl.textContent = `Recording\u2026 ${captureBuffer.length} signals captured`;
  }
}

/**
 * Normalize a raw signal payload (which may come from OpenAI streaming
 * with non-standard fields) into the expected SignalPayloadMap format.
 */
function normalizePayload(
  type: SignalType,
  raw: Record<string, unknown>,
): SignalTimelineStep["payload"] {
  switch (type) {
    case "task_dispatch": {
      // OpenAI format: { description, model } — standard: { taskId, from, to, description }
      if (!raw["from"] && !raw["to"]) {
        return {
          taskId: String(raw["taskId"] ?? ""),
          from: "user",
          to: String(raw["model"] ?? "unknown"),
          description: raw["description"] ? String(raw["description"]) : undefined,
        };
      }
      return raw as SignalTimelineStep["payload"];
    }
    case "token_usage": {
      // OpenAI format: { content, tokenIndex, model } — standard: { agentId, promptTokens, completionTokens, model }
      if (raw["content"] !== undefined) {
        return {
          agentId: String(raw["model"] ?? "openai"),
          promptTokens: 0,
          completionTokens: 1,
          model: raw["model"] ? String(raw["model"]) : undefined,
        };
      }
      return raw as SignalTimelineStep["payload"];
    }
    case "completion": {
      // OpenAI format: { success, totalTokens, finishReason } — standard: { taskId, success, result }
      if (raw["totalTokens"] !== undefined || raw["finishReason"] !== undefined) {
        return {
          taskId: "",
          success: Boolean(raw["success"]),
          result: raw["finishReason"]
            ? `${raw["finishReason"]} (${raw["totalTokens"] ?? 0} tokens)`
            : undefined,
        };
      }
      return raw as SignalTimelineStep["payload"];
    }
    default:
      return raw as SignalTimelineStep["payload"];
  }
}
