/**
 * Shader code editor panel.
 *
 * CodeMirror 6 instance with vertex/fragment tabs, shader selector,
 * live compilation (debounced 300ms), and inline error decorations.
 */

import { EditorView, type ViewUpdate, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { bracketMatching, indentOnInput, foldGutter } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";
import { StateEffect, StateField, type Transaction, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet } from "@codemirror/view";

import { glslLanguage } from "./glsl-language.js";
import { DEFAULT_VERTEX_SOURCE, DEFAULT_FRAGMENT_SOURCE } from "./shader-defaults.js";
import { compile, onCompileResult, initShaderCanvas, setPassCount } from "./shader-canvas.js";
import type { CompileResult } from "./shader-canvas.js";
import {
  getShaderState,
  addShader,
  updateShader,
  selectShader,
  subscribeShaders,
} from "./shader-state.js";
import type { ShaderDef } from "./shader-types.js";
import { SHADER_PRESETS } from "./shader-presets.js";

import * as THREE from "three";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type ActiveTab = "vertex" | "fragment";

let activeTab: ActiveTab = "fragment";
let editorView: EditorView | null = null;
let containerEl: HTMLElement | null = null;
let compileTimer: ReturnType<typeof setTimeout> | null = null;
let statusEl: HTMLElement | null = null;
let canvasInitialized = false;
let shaderSelectorEl: HTMLSelectElement | null = null;
let nameInputEl: HTMLInputElement | null = null;

const COMPILE_DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Error line decorations
// ---------------------------------------------------------------------------

const addErrorLines = StateEffect.define<number[]>();
const clearErrorLines = StateEffect.define<null>();

const errorLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco: DecorationSet, tr: Transaction) {
    for (const effect of tr.effects) {
      if (effect.is(clearErrorLines)) {
        return Decoration.none;
      }
      if (effect.is(addErrorLines)) {
        const ranges: Range<Decoration>[] = [];
        for (const line of effect.value) {
          if (line >= 1 && line <= tr.state.doc.lines) {
            const lineObj = tr.state.doc.line(line);
            ranges.push(Decoration.line({ class: "cm-error-line" }).range(lineObj.from));
          }
        }
        return Decoration.set(ranges, true);
      }
    }
    return deco;
  },
  provide: (f: StateField<DecorationSet>) => EditorView.decorations.from(f),
});

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/** Initialize the shader code panel inside the given container. */
export function initShaderCodePanel(codeEl: HTMLElement): void {
  containerEl = codeEl;

  // Build header
  const header = document.createElement("div");
  header.className = "shader-code-header";

  // Shader name input
  nameInputEl = document.createElement("input");
  nameInputEl.type = "text";
  nameInputEl.placeholder = "Shader name";
  nameInputEl.style.width = "120px";
  nameInputEl.addEventListener("change", () => {
    const selected = getSelectedShader();
    if (selected && nameInputEl) {
      updateShader(selected.id, { name: nameInputEl.value });
    }
  });

  // Shader selector dropdown
  shaderSelectorEl = document.createElement("select");
  shaderSelectorEl.title = "Select shader";
  shaderSelectorEl.addEventListener("change", () => {
    if (shaderSelectorEl) {
      selectShader(shaderSelectorEl.value || null);
    }
  });

  // Tab buttons
  const tabVertex = createTabBtn("Vert", "vertex");
  const tabFragment = createTabBtn("Frag", "fragment");
  tabFragment.classList.add("shader-tab-btn--active");

  // New shader button
  const btnNew = document.createElement("button");
  btnNew.className = "shader-code-btn";
  btnNew.title = "New shader";
  btnNew.textContent = "+";
  btnNew.addEventListener("click", createNewShader);

  // Spacer
  const spacer = document.createElement("span");
  spacer.style.flex = "1";

  // Passes selector (multi-pass ping-pong)
  const passesLabel = document.createElement("span");
  passesLabel.style.cssText = "font-size: 10px; color: var(--color-text-muted);";
  passesLabel.textContent = "Passes:";
  const passesSelect = document.createElement("select");
  passesSelect.title = "Render passes (multi-pass ping-pong)";
  passesSelect.innerHTML = '<option value="1">1</option><option value="2">2</option>';
  passesSelect.addEventListener("change", () => {
    const shader = getSelectedShader();
    if (shader) {
      const passes = parseInt(passesSelect.value, 10);
      updateShader(shader.id, { passes });
      setPassCount(passes, shader.bufferResolution || undefined);
      scheduleCompile();
    }
  });

  // Preset dropdown
  const presetContainer = document.createElement("span");
  presetContainer.id = "shader-preset-container";
  presetContainer.style.position = "relative";

  const presetBtn = document.createElement("button");
  presetBtn.className = "shader-code-btn";
  presetBtn.title = "Load preset";
  presetBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`;

  const presetMenu = document.createElement("div");
  presetMenu.className = "shader-preset-menu";
  presetMenu.style.display = "none";

  for (const preset of SHADER_PRESETS) {
    const item = document.createElement("button");
    item.className = "shader-preset-item";
    item.innerHTML = `${preset.name}<span class="shader-preset-item-desc">${preset.description}</span>`;
    item.addEventListener("click", () => {
      const newShader = preset.create();
      addShader(newShader);
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
      // Position fixed menu below the button
      const rect = presetBtn.getBoundingClientRect();
      presetMenu.style.left = `${rect.left}px`;
      presetMenu.style.top = `${rect.bottom + 4}px`;
      presetMenu.style.display = "block";
    }
  });

  // Close preset menu on outside click
  document.addEventListener("click", () => {
    presetMenu.style.display = "none";
  });

  presetContainer.appendChild(presetBtn);
  // Append menu to body so it escapes overflow: hidden
  document.body.appendChild(presetMenu);

  header.append(nameInputEl, shaderSelectorEl, tabVertex, tabFragment, spacer, passesLabel, passesSelect, presetContainer, btnNew);
  codeEl.appendChild(header);

  // CodeMirror editor
  const cmContainer = document.createElement("div");
  cmContainer.style.flex = "1";
  cmContainer.style.minHeight = "0";
  cmContainer.style.overflow = "hidden";
  codeEl.appendChild(cmContainer);

  editorView = new EditorView({
    state: EditorState.create({
      doc: DEFAULT_FRAGMENT_SOURCE,
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
        ]),
        oneDark,
        glslLanguage(),
        errorLineField,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            scheduleCompile();
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

  // Compile status bar
  statusEl = document.createElement("div");
  statusEl.className = "shader-compile-status shader-compile-status--ok";
  statusEl.textContent = "Ready";
  codeEl.appendChild(statusEl);

  // Listen to compile results
  onCompileResult(onCompile);

  // Subscribe to shader state changes
  subscribeShaders(syncFromState);

  // Ensure we have at least one shader
  ensureDefaultShader();

  // Init canvas (lazy — only once)
  initCanvasLazy();

  // Initial compile
  scheduleCompile();
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

function createTabBtn(label: string, tab: ActiveTab): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "shader-tab-btn";
  btn.textContent = label;
  btn.addEventListener("click", () => switchTab(tab));
  btn.dataset["tab"] = tab;
  return btn;
}

function switchTab(tab: ActiveTab): void {
  if (tab === activeTab) return;

  // Save current tab content to shader state
  saveCurrentTabToState();

  activeTab = tab;

  // Update tab button styles
  const header = containerEl?.querySelector(".shader-code-header");
  if (header) {
    for (const btn of header.querySelectorAll<HTMLButtonElement>(".shader-tab-btn")) {
      btn.classList.toggle("shader-tab-btn--active", btn.dataset["tab"] === tab);
    }
  }

  // Load new tab content
  loadTabContent();
}

function saveCurrentTabToState(): void {
  const shader = getSelectedShader();
  if (!shader || !editorView) return;

  const code = editorView.state.doc.toString();
  if (activeTab === "vertex") {
    updateShader(shader.id, { vertexSource: code });
  } else {
    updateShader(shader.id, { fragmentSource: code });
  }
}

function loadTabContent(): void {
  const shader = getSelectedShader();
  if (!shader || !editorView) return;

  const code = activeTab === "vertex" ? shader.vertexSource : shader.fragmentSource;
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: code,
    },
  });
}

// ---------------------------------------------------------------------------
// Shader creation & selection
// ---------------------------------------------------------------------------

function createNewShader(): void {
  const id = crypto.randomUUID();
  const count = getShaderState().shaders.length + 1;
  const shader: ShaderDef = {
    id,
    name: `Shader ${count}`,
    mode: "glsl",
    vertexSource: DEFAULT_VERTEX_SOURCE,
    fragmentSource: DEFAULT_FRAGMENT_SOURCE,
    uniforms: [],
    passes: 1,
    bufferResolution: 0,
  };
  addShader(shader);
}

function ensureDefaultShader(): void {
  const { shaders } = getShaderState();
  if (shaders.length === 0) {
    createNewShader();
  } else if (!getShaderState().selectedShaderId) {
    selectShader(shaders[0].id);
  }
}

function getSelectedShader(): ShaderDef | undefined {
  const { shaders, selectedShaderId } = getShaderState();
  return shaders.find((s) => s.id === selectedShaderId);
}

// ---------------------------------------------------------------------------
// State sync
// ---------------------------------------------------------------------------

/** Sync code panel UI from shader state (selection change, external updates). */
function syncFromState(): void {
  const { shaders, selectedShaderId } = getShaderState();

  // Update selector dropdown
  if (shaderSelectorEl) {
    const opts = shaders.map((s) => `<option value="${s.id}"${s.id === selectedShaderId ? " selected" : ""}>${s.name}</option>`);
    shaderSelectorEl.innerHTML = opts.join("");
  }

  // Update name input
  const selected = shaders.find((s) => s.id === selectedShaderId);
  if (nameInputEl && selected) {
    if (document.activeElement !== nameInputEl) {
      nameInputEl.value = selected.name;
    }
  }

  // Load selected shader content into editor
  if (selected && editorView) {
    const code = activeTab === "vertex" ? selected.vertexSource : selected.fragmentSource;
    const current = editorView.state.doc.toString();
    if (code !== current) {
      editorView.dispatch({
        changes: { from: 0, to: current.length, insert: code },
      });
    }

    // Sync multi-pass
    setPassCount(selected.passes, selected.bufferResolution || undefined);
  }
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

function scheduleCompile(): void {
  if (compileTimer) clearTimeout(compileTimer);
  compileTimer = setTimeout(doCompile, COMPILE_DEBOUNCE_MS);
}

function doCompile(): void {
  const shader = getSelectedShader();
  if (!shader || !editorView) return;

  // Save current editor content
  const code = editorView.state.doc.toString();
  if (activeTab === "vertex") {
    updateShader(shader.id, { vertexSource: code });
  } else {
    updateShader(shader.id, { fragmentSource: code });
  }

  // Get both sources
  const vertSrc = activeTab === "vertex" ? code : shader.vertexSource;
  const fragSrc = activeTab === "fragment" ? code : shader.fragmentSource;

  // Build user uniforms from state
  const userUniforms: Record<string, THREE.IUniform> = {};
  for (const u of shader.uniforms) {
    userUniforms[u.name] = { value: u.value };
  }

  compile(vertSrc, fragSrc, userUniforms);
}

function onCompile(result: CompileResult): void {
  if (!statusEl || !editorView) return;

  // Clear previous error decorations
  editorView.dispatch({ effects: clearErrorLines.of(null) });

  if (result.success) {
    statusEl.className = "shader-compile-status shader-compile-status--ok";
    statusEl.textContent = "Compiled OK";
  } else {
    statusEl.className = "shader-compile-status shader-compile-status--error";
    const firstError = result.errors[0];
    statusEl.textContent = firstError
      ? `Error line ${firstError.line}: ${firstError.message}`
      : "Compilation failed";

    // Add error line decorations
    const lines = result.errors.map((e) => e.line).filter((l) => l > 0);
    if (lines.length > 0) {
      editorView.dispatch({ effects: addErrorLines.of(lines) });
    }
  }
}

// ---------------------------------------------------------------------------
// Canvas lazy init
// ---------------------------------------------------------------------------

function initCanvasLazy(): void {
  if (canvasInitialized) return;
  const previewEl = document.getElementById("shader-preview-panel");
  if (!previewEl) return;

  initShaderCanvas(previewEl);
  canvasInitialized = true;
}
