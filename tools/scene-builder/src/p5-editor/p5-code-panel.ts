/**
 * p5.js code editor panel.
 *
 * CodeMirror 6 instance with JavaScript syntax, sketch selector,
 * live re-run (debounced 500ms), and error status bar.
 */

import { EditorView, type ViewUpdate, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, indentOnInput, foldGutter } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";

import { runSketch, stopSketch, isRunning, onRunResult, initP5Canvas } from "./p5-canvas.js";
import type { RunResult } from "./p5-canvas.js";
import {
  getP5State,
  addSketch,
  removeSketch,
  updateSketch,
  updateP5State,
  selectSketch,
  subscribeP5,
} from "./p5-state.js";
import type { P5SketchDef } from "./p5-types.js";
import { P5_PRESETS } from "./p5-presets.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let editorView: EditorView | null = null;
let containerEl: HTMLElement | null = null;
let compileTimer: ReturnType<typeof setTimeout> | null = null;
let statusEl: HTMLElement | null = null;
let canvasInitialized = false;
let sketchSelectorEl: HTMLSelectElement | null = null;
let nameInputEl: HTMLInputElement | null = null;

const RUN_DEBOUNCE_MS = 500;

// ---------------------------------------------------------------------------
// Default sketch source
// ---------------------------------------------------------------------------

const DEFAULT_SOURCE = `// @param: speed, slider, min: 0.1, max: 5.0

p.setup = function() {
  p.createCanvas(p.sajou._width, p.sajou._height);
  p.background(7, 7, 12);
};

p.draw = function() {
  const speed = p.sajou.speed ?? 1.0;
  p.background(7, 7, 12, 20);
  p.noStroke();
  p.fill(232, 168, 81);
  const x = p.width / 2 + p.sin(p.frameCount * 0.02 * speed) * 100;
  p.circle(x, p.height / 2, 40);
};
`;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/** Initialize the p5 code panel inside the given container. */
export function initP5CodePanel(codeEl: HTMLElement): void {
  containerEl = codeEl;

  // Build header
  const header = document.createElement("div");
  header.className = "p5-code-header";

  // Sketch name input
  nameInputEl = document.createElement("input");
  nameInputEl.type = "text";
  nameInputEl.id = "p5-name-input";
  nameInputEl.name = "p5-name";
  nameInputEl.setAttribute("aria-label", "Sketch name");
  nameInputEl.placeholder = "Sketch name";
  nameInputEl.style.width = "120px";
  nameInputEl.addEventListener("change", () => {
    const selected = getSelectedSketch();
    if (selected && nameInputEl) {
      updateSketch(selected.id, { name: nameInputEl.value });
    }
  });

  // Sketch selector dropdown
  sketchSelectorEl = document.createElement("select");
  sketchSelectorEl.id = "p5-selector";
  sketchSelectorEl.name = "p5-selector";
  sketchSelectorEl.setAttribute("aria-label", "Select sketch");
  sketchSelectorEl.title = "Select sketch";
  sketchSelectorEl.addEventListener("change", () => {
    if (sketchSelectorEl) {
      selectSketch(sketchSelectorEl.value || null);
    }
  });

  // Run/Stop toggle
  const runBtn = document.createElement("button");
  runBtn.className = "p5-code-btn p5-run-btn";
  runBtn.title = "Run sketch (Ctrl+Enter)";
  runBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  runBtn.addEventListener("click", () => {
    const { playing } = getP5State();
    updateP5State({ playing: !playing });
    // If starting, trigger an immediate run with current editor content
    if (!playing) {
      doRun();
    }
  });

  // New sketch button
  const btnNew = document.createElement("button");
  btnNew.className = "p5-code-btn";
  btnNew.title = "New sketch";
  btnNew.textContent = "+";
  btnNew.addEventListener("click", createNewSketch);

  // Delete sketch button
  const btnDelete = document.createElement("button");
  btnDelete.className = "p5-code-btn";
  btnDelete.title = "Delete sketch";
  btnDelete.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
  btnDelete.addEventListener("click", deleteSelectedSketch);

  // Spacer
  const spacer = document.createElement("span");
  spacer.style.flex = "1";

  // Preset dropdown
  const presetContainer = document.createElement("span");
  presetContainer.id = "p5-preset-container";
  presetContainer.style.position = "relative";

  const presetBtn = document.createElement("button");
  presetBtn.className = "p5-code-btn";
  presetBtn.title = "Load preset";
  presetBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`;

  const presetMenu = document.createElement("div");
  presetMenu.className = "p5-preset-menu";
  presetMenu.style.display = "none";

  for (const preset of P5_PRESETS) {
    const item = document.createElement("button");
    item.className = "p5-preset-item";
    item.innerHTML = `${preset.name}<span class="p5-preset-item-desc">${preset.description}</span>`;
    item.addEventListener("click", () => {
      const newSketch = preset.create();
      addSketch(newSketch);
      presetMenu.style.display = "none";
    });
    presetMenu.appendChild(item);
  }

  presetBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = presetMenu.style.display !== "none";
    if (isOpen) {
      presetMenu.style.display = "none";
    } else {
      const rect = presetBtn.getBoundingClientRect();
      presetMenu.style.left = `${rect.left}px`;
      presetMenu.style.top = `${rect.bottom + 4}px`;
      presetMenu.style.display = "block";
    }
  });

  document.addEventListener("click", () => {
    presetMenu.style.display = "none";
  });

  presetContainer.appendChild(presetBtn);
  document.body.appendChild(presetMenu);

  header.append(nameInputEl, sketchSelectorEl, runBtn, spacer, presetContainer, btnNew, btnDelete);
  codeEl.appendChild(header);

  // CodeMirror editor
  const cmContainer = document.createElement("div");
  cmContainer.style.flex = "1";
  cmContainer.style.minHeight = "0";
  cmContainer.style.overflow = "hidden";
  codeEl.appendChild(cmContainer);

  editorView = new EditorView({
    state: EditorState.create({
      doc: DEFAULT_SOURCE,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        foldGutter(),
        history(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...closeBracketsKeymap,
          {
            key: "Ctrl-Enter",
            mac: "Cmd-Enter",
            run: () => { doRun(); return true; },
          },
        ]),
        oneDark,
        javascript(),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            scheduleRun();
          }
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "12px" },
          ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono)" },
        }),
      ],
    }),
    parent: cmContainer,
  });

  // Status bar
  statusEl = document.createElement("div");
  statusEl.className = "p5-compile-status p5-compile-status--ok";
  statusEl.textContent = "Ready";
  codeEl.appendChild(statusEl);

  // Listen to run results
  onRunResult(onRun);

  // Subscribe to p5 state changes
  subscribeP5(syncFromState);

  // Ensure we have at least one sketch
  ensureDefaultSketch();

  // Init canvas (lazy — only once)
  initCanvasLazy();

  // Initial run
  scheduleRun();
}

// ---------------------------------------------------------------------------
// Sketch creation & selection
// ---------------------------------------------------------------------------

function createNewSketch(): void {
  const id = crypto.randomUUID();
  const count = getP5State().sketches.length + 1;
  const sketch: P5SketchDef = {
    id,
    name: `Sketch ${count}`,
    source: DEFAULT_SOURCE,
    params: [],
    width: 0,
    height: 0,
  };
  addSketch(sketch);
}

function deleteSelectedSketch(): void {
  const { sketches, selectedSketchId } = getP5State();
  if (!selectedSketchId || sketches.length <= 1) return;
  removeSketch(selectedSketchId);
  const remaining = getP5State().sketches;
  if (remaining.length > 0 && !getP5State().selectedSketchId) {
    selectSketch(remaining[0].id);
  }
}

function ensureDefaultSketch(): void {
  const { sketches } = getP5State();
  if (sketches.length === 0) {
    createNewSketch();
  } else if (!getP5State().selectedSketchId) {
    selectSketch(sketches[0].id);
  }
}

function getSelectedSketch(): P5SketchDef | undefined {
  const { sketches, selectedSketchId } = getP5State();
  return sketches.find((s) => s.id === selectedSketchId);
}

// ---------------------------------------------------------------------------
// State sync
// ---------------------------------------------------------------------------

/** Sync code panel UI from p5 state (selection change, external updates). */
function syncFromState(): void {
  const { sketches, selectedSketchId } = getP5State();

  // Update selector dropdown
  if (sketchSelectorEl) {
    const opts = sketches.map((s) => `<option value="${s.id}"${s.id === selectedSketchId ? " selected" : ""}>${s.name}</option>`);
    sketchSelectorEl.innerHTML = opts.join("");
  }

  // Update name input
  const selected = sketches.find((s) => s.id === selectedSketchId);
  if (nameInputEl && selected) {
    if (document.activeElement !== nameInputEl) {
      nameInputEl.value = selected.name;
    }
  }

  // Load selected sketch content into editor
  if (selected && editorView) {
    const code = selected.source;
    const current = editorView.state.doc.toString();
    if (code !== current) {
      editorView.dispatch({
        changes: { from: 0, to: current.length, insert: code },
      });
    }
  }

  // Update play/stop button icon
  syncRunButton();
}

// ---------------------------------------------------------------------------
// Run / Stop
// ---------------------------------------------------------------------------

function scheduleRun(): void {
  // Only auto-run on code changes when playing
  if (!getP5State().playing) return;
  if (compileTimer) clearTimeout(compileTimer);
  compileTimer = setTimeout(doRun, RUN_DEBOUNCE_MS);
}

function doRun(): void {
  const sketch = getSelectedSketch();
  if (!sketch || !editorView) return;

  // Save current editor content
  const code = editorView.state.doc.toString();
  updateSketch(sketch.id, { source: code });

  // Build params from state
  const params: Record<string, unknown> = {};
  for (const param of sketch.params) {
    params[param.name] = param.value;
  }

  runSketch(code, params);
}

function onRun(result: RunResult): void {
  if (!statusEl) return;

  if (result.success) {
    statusEl.className = "p5-compile-status p5-compile-status--ok";
    statusEl.textContent = getP5State().playing ? "Running" : "Stopped";
  } else {
    statusEl.className = "p5-compile-status p5-compile-status--error";
    statusEl.textContent = `Error: ${result.error}`;
  }
}

/** Update run button icon based on playing state. */
function syncRunButton(): void {
  const btn = containerEl?.querySelector(".p5-run-btn");
  if (!btn) return;
  const { playing } = getP5State();
  if (playing) {
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    btn.setAttribute("title", "Pause sketch");
  } else {
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    btn.setAttribute("title", "Run sketch (Ctrl+Enter)");
  }
  if (statusEl) {
    const hasError = statusEl.classList.contains("p5-compile-status--error");
    if (!hasError) {
      statusEl.textContent = playing ? "Running" : "Stopped";
    }
  }
}

// ---------------------------------------------------------------------------
// Canvas lazy init
// ---------------------------------------------------------------------------

function initCanvasLazy(): void {
  if (canvasInitialized) return;
  const previewEl = document.getElementById("p5-preview-panel");
  if (!previewEl) return;

  initP5Canvas(previewEl);
  canvasInitialized = true;
}
