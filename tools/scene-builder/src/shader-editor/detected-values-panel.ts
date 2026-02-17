/**
 * Detected values panel for the shader editor.
 *
 * Analyzes the current shader's fragment source to detect extractable
 * numeric literals, and displays them grouped by context with "Expose"
 * toggle buttons that rewrite the source to add/remove a uniform.
 *
 * Exposed values stay pinned in the list so the user can quickly
 * evaluate which extractions are useful and revert the bad ones.
 *
 * Debounced at 500ms to avoid thrashing on every keystroke.
 */

import { getShaderState, updateShader, subscribeShaders } from "./shader-state.js";
import { analyzeShader } from "./shader-analyzer.js";
import { extractToUniform, revertUniform } from "./extract-to-uniform.js";
import type { DetectedValue } from "./shader-analyzer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A value that has been exposed as a uniform (pinned in the list). */
interface ExposedEntry {
  /** The original detected value info (for display and revert). */
  detected: DetectedValue;
  /** The uniform name that was generated. */
  uniformName: string;
}

/** A display entry — either a freshly detected value or a pinned exposed one. */
interface DisplayEntry {
  detected: DetectedValue;
  exposed: boolean;
  uniformName?: string;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let containerEl: HTMLElement | null = null;
let cachedSource = "";
let currentValues: DetectedValue[] = [];
let exposedEntries: ExposedEntry[] = [];
let showLowConfidence = false;
let debounceTimer = 0;

/** Confidence threshold below which values are hidden by default. */
const LOW_CONFIDENCE_THRESHOLD = 0.4;

/** Debounce delay in milliseconds. */
const DEBOUNCE_MS = 500;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/** Initialize the detected values panel in the given container element. */
export function initDetectedValuesPanel(el: HTMLElement): void {
  containerEl = el;
  subscribeShaders(onShaderChange);
  onShaderChange();
}

// ---------------------------------------------------------------------------
// Reactive sync
// ---------------------------------------------------------------------------

/** Called on every shader state change. Debounces the analysis. */
function onShaderChange(): void {
  const { shaders, selectedShaderId } = getShaderState();
  const shader = shaders.find((s) => s.id === selectedShaderId);

  if (!shader) {
    cachedSource = "";
    currentValues = [];
    exposedEntries = [];
    buildPanel();
    return;
  }

  // Only re-analyze if the source actually changed
  if (shader.fragmentSource === cachedSource) return;

  clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    cachedSource = shader.fragmentSource;
    currentValues = analyzeShader(shader.fragmentSource);
    pruneExposedEntries(shader.fragmentSource);
    buildPanel();
  }, DEBOUNCE_MS);
}

/**
 * Remove exposed entries whose uniform no longer exists in the source.
 * This handles external edits, preset switches, and manual deletions.
 */
function pruneExposedEntries(source: string): void {
  exposedEntries = exposedEntries.filter((e) => {
    const pattern = new RegExp(`\\buniform\\s+\\w+\\s+${e.uniformName}\\b`);
    return pattern.test(source);
  });
}

// ---------------------------------------------------------------------------
// Display entry merging
// ---------------------------------------------------------------------------

/** Merge detected values and exposed entries into a unified display list. */
function buildDisplayEntries(): DisplayEntry[] {
  const entries: DisplayEntry[] = [];

  // Add exposed entries first (they are pinned)
  for (const e of exposedEntries) {
    entries.push({
      detected: e.detected,
      exposed: true,
      uniformName: e.uniformName,
    });
  }

  // Add detected values that are NOT already represented by an exposed entry.
  // An exposed value's literal is gone from the source, so there's no overlap
  // by location — but we still guard against duplicates by raw+context.
  const exposedKeys = new Set(
    exposedEntries.map((e) => `${e.detected.raw}|${e.detected.context}`),
  );
  for (const v of currentValues) {
    const key = `${v.raw}|${v.context}`;
    if (!exposedKeys.has(key)) {
      entries.push({ detected: v, exposed: false });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// DOM construction
// ---------------------------------------------------------------------------

/** Rebuild the entire panel content. */
function buildPanel(): void {
  if (!containerEl) return;
  containerEl.innerHTML = "";

  const allEntries = buildDisplayEntries();
  const visible = showLowConfidence
    ? allEntries
    : allEntries.filter((e) => e.exposed || e.detected.confidence >= LOW_CONFIDENCE_THRESHOLD);

  if (visible.length === 0) return;

  // Header
  const header = document.createElement("div");
  header.className = "shader-detected-header";

  const title = document.createElement("span");
  title.textContent = "Detected Values";
  title.style.cssText = "font-size: 11px; color: var(--color-text-muted); font-weight: 500;";

  const badge = document.createElement("span");
  badge.className = "shader-detected-badge";
  badge.textContent = String(visible.length);

  const loBtn = document.createElement("button");
  loBtn.className = "shader-detected-lo-btn";
  loBtn.textContent = "Lo";
  loBtn.title = showLowConfidence ? "Hide low-confidence values" : "Show low-confidence values";
  loBtn.classList.toggle("shader-detected-lo-btn--active", showLowConfidence);
  loBtn.addEventListener("click", () => {
    showLowConfidence = !showLowConfidence;
    buildPanel();
  });

  header.appendChild(title);
  header.appendChild(badge);
  header.appendChild(loBtn);
  containerEl.appendChild(header);

  // Group by context
  const groups = new Map<string, DisplayEntry[]>();
  for (const e of visible) {
    const ctx = e.detected.context;
    let list = groups.get(ctx);
    if (!list) {
      list = [];
      groups.set(ctx, list);
    }
    list.push(e);
  }

  // Render groups
  for (const [context, entries] of groups) {
    const details = document.createElement("details");
    details.className = "shader-detected-group";
    details.open = true;

    const summary = document.createElement("summary");
    summary.className = "shader-detected-group-header";
    summary.textContent = context;
    details.appendChild(summary);

    for (const e of entries) {
      details.appendChild(buildEntry(e));
    }

    containerEl.appendChild(details);
  }
}

/** Build a single detected value entry row. */
function buildEntry(entry: DisplayEntry): HTMLElement {
  const { detected: v, exposed } = entry;

  const row = document.createElement("div");
  row.className = "shader-detected-entry";
  if (exposed) row.classList.add("shader-detected-entry--exposed");

  // Raw text
  const raw = document.createElement("span");
  raw.className = "shader-detected-raw";
  raw.textContent = v.raw;
  raw.title = v.raw;

  // Line number
  const line = document.createElement("span");
  line.className = "shader-detected-line";
  line.textContent = exposed ? entry.uniformName! : `L${v.location.line}`;

  // Confidence dots (3 dots, filled proportionally)
  const conf = document.createElement("span");
  conf.className = "shader-detected-confidence";
  const filled = v.confidence >= 0.85 ? 3 : v.confidence >= 0.5 ? 2 : 1;
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "shader-detected-confidence-dot";
    if (i < filled) dot.classList.add("shader-detected-confidence-dot--filled");
    conf.appendChild(dot);
  }

  // Toggle button
  const btn = document.createElement("button");
  btn.className = "shader-detected-expose-btn";
  if (exposed) {
    btn.classList.add("shader-detected-expose-btn--active");
    btn.textContent = "Unexpose";
    btn.addEventListener("click", () => handleUnexpose(entry));
  } else {
    btn.textContent = "Expose";
    btn.addEventListener("click", () => handleExpose(v));
  }

  row.appendChild(raw);
  row.appendChild(line);
  row.appendChild(conf);
  row.appendChild(btn);

  return row;
}

// ---------------------------------------------------------------------------
// Expose / Unexpose actions
// ---------------------------------------------------------------------------

/** Handle "Expose" button click: extract literal to uniform. */
function handleExpose(detected: DetectedValue): void {
  const { shaders, selectedShaderId } = getShaderState();
  const shader = shaders.find((s) => s.id === selectedShaderId);
  if (!shader) return;

  const result = extractToUniform(shader.fragmentSource, detected);
  if (!result) {
    console.warn("[detected-values] Could not extract value — source may have changed");
    return;
  }

  // Pin this value as exposed
  exposedEntries.push({ detected, uniformName: result.uniformName });

  // Update the shader source — triggers recompile + panel rebuilds
  updateShader(shader.id, { fragmentSource: result.newSource });
}

/** Handle "Unexpose" button click: revert uniform back to literal. */
function handleUnexpose(entry: DisplayEntry): void {
  if (!entry.uniformName) return;

  const { shaders, selectedShaderId } = getShaderState();
  const shader = shaders.find((s) => s.id === selectedShaderId);
  if (!shader) return;

  const reverted = revertUniform(shader.fragmentSource, entry.uniformName, entry.detected.raw);
  if (!reverted) {
    console.warn("[detected-values] Could not revert uniform — it may have been removed manually");
    // Clean up the stale entry anyway
    exposedEntries = exposedEntries.filter((e) => e.uniformName !== entry.uniformName);
    buildPanel();
    return;
  }

  // Remove from exposed list
  exposedEntries = exposedEntries.filter((e) => e.uniformName !== entry.uniformName);

  // Update the shader source — the literal reappears, re-analysis will pick it up
  updateShader(shader.id, { fragmentSource: reverted });
}
