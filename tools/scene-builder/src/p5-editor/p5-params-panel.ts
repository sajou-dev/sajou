/**
 * p5.js params panel.
 *
 * Auto-generates UI controls (sliders, color pickers, toggles) from
 * param annotations parsed from the JS source code.
 * Reconstructs controls when the param list changes.
 */

import { getP5State, updateSketch, subscribeP5 } from "./p5-state.js";
import { parseP5Source } from "./p5-param-parser.js";
import { setParam } from "./p5-canvas.js";
import type { P5ParamDef } from "./p5-types.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let containerEl: HTMLElement | null = null;
/** Cached param names to detect when controls need rebuilding. */
let cachedParamKeys = "";
/** Cached param values to detect external changes (MCP commands). */
let cachedParamValues = "";

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/** Initialize the params panel in the given container element. */
export function initP5ParamsPanel(el: HTMLElement): void {
  containerEl = el;

  subscribeP5(syncPanel);
  syncPanel();
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/** Rebuild or update the controls panel. */
function syncPanel(): void {
  if (!containerEl) return;

  const { sketches, selectedSketchId } = getP5State();
  const sketch = sketches.find((s) => s.id === selectedSketchId);
  if (!sketch) {
    containerEl.innerHTML = "";
    cachedParamKeys = "";
    return;
  }

  // Parse current params from the source
  const { params: parsed } = parseP5Source(sketch.source);

  // Merge parsed params with stored values (preserve user-set values)
  const merged = mergeParams(sketch.params, parsed);

  // Check if we need to rebuild controls (param names changed)
  const newKeys = merged.map((p) => `${p.name}:${p.type}`).join(",");
  if (newKeys !== cachedParamKeys) {
    cachedParamKeys = newKeys;
    buildControls(merged, sketch.id);

    // Update sketch state with merged params
    updateSketch(sketch.id, { params: merged });
  }

  // Sync param values to the p5 instance when changed externally
  const newValues = sketch.params.map((p) => `${p.name}=${JSON.stringify(p.value)}`).join(",");
  if (newValues !== cachedParamValues) {
    cachedParamValues = newValues;
    for (const param of sketch.params) {
      setParam(param.name, param.value);
      syncControlValue(param);
    }
  }
}

/**
 * Merge stored param values with newly parsed param definitions.
 * Preserves user-set values for params that still exist.
 */
function mergeParams(stored: P5ParamDef[], parsed: P5ParamDef[]): P5ParamDef[] {
  return parsed.map((p) => {
    const existing = stored.find((s) => s.name === p.name && s.type === p.type);
    if (existing) {
      return { ...p, value: existing.value };
    }
    return p;
  });
}

// ---------------------------------------------------------------------------
// DOM construction
// ---------------------------------------------------------------------------

function buildControls(params: P5ParamDef[], sketchId: string): void {
  if (!containerEl) return;
  containerEl.innerHTML = "";

  if (params.length === 0) return;

  const title = document.createElement("div");
  title.style.cssText = "font-size: 11px; color: var(--color-text-muted); margin-bottom: 8px; font-weight: 500;";
  title.textContent = "Parameters";
  containerEl.appendChild(title);

  for (const param of params) {
    buildControl(param, sketchId, containerEl);
  }
}

/** Dispatch a single param control to the appropriate builder. */
function buildControl(param: P5ParamDef, sketchId: string, parent: HTMLElement): void {
  switch (param.control) {
    case "slider":
      buildSliderControl(param, sketchId, parent);
      break;
    case "color":
      buildColorControl(param, sketchId, parent);
      break;
    case "toggle":
      buildToggleControl(param, sketchId, parent);
      break;
    case "xy":
      buildXYControl(param, sketchId, parent);
      break;
  }
}

// ---------------------------------------------------------------------------
// Slider control (float / int)
// ---------------------------------------------------------------------------

function buildSliderControl(param: P5ParamDef, sketchId: string, parent: HTMLElement): void {
  const label = document.createElement("label");
  label.className = "p5-param-label";
  label.textContent = param.name;
  if (param.bind) appendBindBadge(label, param.bind.semantic);

  const row = document.createElement("div");
  row.className = "p5-param-row";

  const inputId = `p5-param-${param.name}`;
  label.htmlFor = inputId;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.id = inputId;
  slider.name = param.name;
  slider.min = String(param.min);
  slider.max = String(param.max);
  slider.step = String(param.step);
  slider.value = String(typeof param.value === "number" ? param.value : 0);

  const valueDisplay = document.createElement("span");
  valueDisplay.className = "p5-param-value";
  valueDisplay.textContent = formatValue(param.value);

  slider.addEventListener("input", () => {
    const val = param.type === "int" ? parseInt(slider.value, 10) : parseFloat(slider.value);
    valueDisplay.textContent = formatValue(val);

    // Update sketch state
    const sketch = getP5State().sketches.find((s) => s.id === sketchId);
    if (sketch) {
      const newParams = sketch.params.map((sp) =>
        sp.name === param.name ? { ...sp, value: val } : sp,
      );
      updateSketch(sketchId, { params: newParams });
    }

    // Update p5 instance param
    setParam(param.name, val);
  });

  row.appendChild(slider);
  row.appendChild(valueDisplay);

  parent.appendChild(label);
  parent.appendChild(row);
}

// ---------------------------------------------------------------------------
// Color control
// ---------------------------------------------------------------------------

function buildColorControl(param: P5ParamDef, sketchId: string, parent: HTMLElement): void {
  const label = document.createElement("label");
  label.className = "p5-param-label";
  label.textContent = param.name;
  if (param.bind) appendBindBadge(label, param.bind.semantic);

  const row = document.createElement("div");
  row.className = "p5-param-row";

  const colorId = `p5-param-${param.name}`;
  label.htmlFor = colorId;

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.id = colorId;
  colorInput.name = param.name;
  const rgb = Array.isArray(param.value) ? param.value as number[] : [1, 1, 1];
  colorInput.value = rgbToHex(rgb[0], rgb[1], rgb[2]);

  const valueDisplay = document.createElement("span");
  valueDisplay.className = "p5-param-value";
  valueDisplay.textContent = colorInput.value;

  colorInput.addEventListener("input", () => {
    const hex = colorInput.value;
    valueDisplay.textContent = hex;
    const [r, g, b] = hexToRgb(hex);

    const sketch = getP5State().sketches.find((s) => s.id === sketchId);
    if (sketch) {
      const newParams = sketch.params.map((sp) =>
        sp.name === param.name ? { ...sp, value: [r, g, b] } : sp,
      );
      updateSketch(sketchId, { params: newParams });
    }

    setParam(param.name, [r, g, b]);
  });

  row.appendChild(colorInput);
  row.appendChild(valueDisplay);

  parent.appendChild(label);
  parent.appendChild(row);
}

// ---------------------------------------------------------------------------
// Toggle control (bool)
// ---------------------------------------------------------------------------

function buildToggleControl(param: P5ParamDef, sketchId: string, parent: HTMLElement): void {
  const row = document.createElement("div");
  row.className = "p5-param-row";

  const checkId = `p5-param-${param.name}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = checkId;
  checkbox.name = param.name;
  checkbox.checked = param.value === true;
  checkbox.style.accentColor = "var(--color-accent)";

  const label = document.createElement("label");
  label.className = "p5-param-label";
  label.style.marginBottom = "0";
  label.htmlFor = checkId;
  label.textContent = param.name;
  if (param.bind) appendBindBadge(label, param.bind.semantic);

  checkbox.addEventListener("change", () => {
    const val = checkbox.checked;

    const sketch = getP5State().sketches.find((s) => s.id === sketchId);
    if (sketch) {
      const newParams = sketch.params.map((sp) =>
        sp.name === param.name ? { ...sp, value: val } : sp,
      );
      updateSketch(sketchId, { params: newParams });
    }

    setParam(param.name, val);
  });

  row.appendChild(checkbox);
  row.appendChild(label);

  parent.appendChild(row);
}

// ---------------------------------------------------------------------------
// XY control (vec2) — two sliders
// ---------------------------------------------------------------------------

function buildXYControl(param: P5ParamDef, sketchId: string, parent: HTMLElement): void {
  const label = document.createElement("label");
  label.className = "p5-param-label";
  label.textContent = param.name;
  if (param.bind) appendBindBadge(label, param.bind.semantic);
  parent.appendChild(label);

  const vals = Array.isArray(param.value) ? param.value as number[] : [0.5, 0.5];

  for (let axis = 0; axis < 2; axis++) {
    const axisLabel = axis === 0 ? "x" : "y";

    const row = document.createElement("div");
    row.className = "p5-param-row";

    const axisSpan = document.createElement("span");
    axisSpan.className = "p5-param-value";
    axisSpan.style.minWidth = "12px";
    axisSpan.textContent = axisLabel;

    const sliderId = `p5-param-${param.name}-${axisLabel}`;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = sliderId;
    slider.name = `${param.name}-${axisLabel}`;
    slider.setAttribute("aria-label", `${param.name} ${axisLabel}`);
    slider.min = String(param.min);
    slider.max = String(param.max);
    slider.step = String(param.step);
    slider.value = String(vals[axis] ?? 0.5);

    const valueDisplay = document.createElement("span");
    valueDisplay.className = "p5-param-value";
    valueDisplay.textContent = formatValue(vals[axis] ?? 0.5);

    const capturedAxis = axis;
    slider.addEventListener("input", () => {
      const val = parseFloat(slider.value);
      valueDisplay.textContent = formatValue(val);

      const sketch = getP5State().sketches.find((s) => s.id === sketchId);
      if (sketch) {
        const newParams = sketch.params.map((sp) => {
          if (sp.name === param.name) {
            const arr = Array.isArray(sp.value) ? [...(sp.value as number[])] : [0.5, 0.5];
            arr[capturedAxis] = val;
            return { ...sp, value: arr };
          }
          return sp;
        });
        updateSketch(sketchId, { params: newParams });
      }

      const current = Array.isArray(param.value) ? [...(param.value as number[])] : [0.5, 0.5];
      current[capturedAxis] = val;
      setParam(param.name, current);
    });

    row.appendChild(axisSpan);
    row.appendChild(slider);
    row.appendChild(valueDisplay);
    parent.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Bind badge
// ---------------------------------------------------------------------------

function appendBindBadge(label: HTMLElement, semantic: string): void {
  const badge = document.createElement("span");
  badge.className = "p5-bind-badge";
  badge.textContent = semantic;
  label.appendChild(badge);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Update a DOM control to reflect a new param value (external sync). */
function syncControlValue(param: P5ParamDef): void {
  if (!containerEl) return;

  if (param.control === "slider") {
    const slider = containerEl.querySelector<HTMLInputElement>(`#p5-param-${param.name}`);
    if (slider) {
      slider.value = String(typeof param.value === "number" ? param.value : 0);
      const valueDisplay = slider.parentElement?.querySelector<HTMLSpanElement>(".p5-param-value");
      if (valueDisplay) valueDisplay.textContent = formatValue(param.value);
    }
  } else if (param.control === "toggle") {
    const checkbox = containerEl.querySelector<HTMLInputElement>(`#p5-param-${param.name}`);
    if (checkbox) checkbox.checked = param.value === true;
  } else if (param.control === "color") {
    const colorInput = containerEl.querySelector<HTMLInputElement>(`#p5-param-${param.name}`);
    if (colorInput && Array.isArray(param.value)) {
      const rgb = param.value as number[];
      colorInput.value = rgbToHex(rgb[0], rgb[1], rgb[2]);
    }
  } else if (param.control === "xy") {
    const vals = Array.isArray(param.value) ? param.value as number[] : [0.5, 0.5];
    for (let axis = 0; axis < 2; axis++) {
      const axisLabel = axis === 0 ? "x" : "y";
      const slider = containerEl.querySelector<HTMLInputElement>(`#p5-param-${param.name}-${axisLabel}`);
      if (slider) {
        slider.value = String(vals[axis] ?? 0.5);
        const valueDisplay = slider.parentElement?.querySelector<HTMLSpanElement>(".p5-param-value:last-child");
        if (valueDisplay) valueDisplay.textContent = formatValue(vals[axis] ?? 0.5);
      }
    }
  }
}

function formatValue(v: number | boolean | number[]): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return v.toFixed(2);
  if (Array.isArray(v)) return v.map((n) => (n as number).toFixed(2)).join(", ");
  return String(v);
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number): string => {
    const h = Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16);
    return h.length === 1 ? "0" + h : h;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}
