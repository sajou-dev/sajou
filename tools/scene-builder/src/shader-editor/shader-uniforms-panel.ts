/**
 * Shader uniforms panel.
 *
 * Auto-generates UI controls (sliders, color pickers, toggles) from
 * uniform annotations parsed from the GLSL source code.
 * Reconstructs controls when the uniform list changes.
 */

import { getShaderState, updateShader, subscribeShaders } from "./shader-state.js";
import { parseUniforms } from "./shader-uniform-parser.js";
import { setUniform } from "./shader-canvas.js";
import type { ShaderUniformDef } from "./shader-types.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let containerEl: HTMLElement | null = null;
/** Cached uniform names to detect when controls need rebuilding. */
let cachedUniformKeys = "";

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/** Initialize the uniforms panel in the given container element. */
export function initShaderUniformsPanel(el: HTMLElement): void {
  containerEl = el;

  subscribeShaders(syncPanel);
  syncPanel();
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/** Rebuild or update the controls panel. */
function syncPanel(): void {
  if (!containerEl) return;

  const { shaders, selectedShaderId } = getShaderState();
  const shader = shaders.find((s) => s.id === selectedShaderId);
  if (!shader) {
    containerEl.innerHTML = "";
    cachedUniformKeys = "";
    return;
  }

  // Parse current uniforms from the fragment source
  const parsed = parseUniforms(shader.fragmentSource);

  // Merge parsed uniforms with stored values (preserve user-set values)
  const merged = mergeUniforms(shader.uniforms, parsed);

  // Check if we need to rebuild controls (uniform names changed)
  const newKeys = merged.map((u) => `${u.name}:${u.type}`).join(",");
  if (newKeys !== cachedUniformKeys) {
    cachedUniformKeys = newKeys;
    buildControls(merged, shader.id);

    // Update shader state with merged uniforms
    updateShader(shader.id, { uniforms: merged });
  }
}

/**
 * Merge stored uniform values with newly parsed uniform definitions.
 * Preserves user-set values for uniforms that still exist.
 */
function mergeUniforms(stored: ShaderUniformDef[], parsed: ShaderUniformDef[]): ShaderUniformDef[] {
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

function buildControls(uniforms: ShaderUniformDef[], shaderId: string): void {
  if (!containerEl) return;
  containerEl.innerHTML = "";

  if (uniforms.length === 0) return;

  const title = document.createElement("div");
  title.style.cssText = "font-size: 11px; color: var(--color-text-muted); margin-bottom: 8px; font-weight: 500;";
  title.textContent = "Uniforms";
  containerEl.appendChild(title);

  for (const u of uniforms) {
    switch (u.control) {
      case "slider":
        buildSliderControl(u, shaderId);
        break;
      case "color":
        buildColorControl(u, shaderId);
        break;
      case "toggle":
        buildToggleControl(u, shaderId);
        break;
      case "xy":
        buildXYControl(u, shaderId);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Slider control (float / int)
// ---------------------------------------------------------------------------

function buildSliderControl(u: ShaderUniformDef, shaderId: string): void {
  if (!containerEl) return;

  const label = document.createElement("label");
  label.className = "shader-uniform-label";
  label.textContent = u.name;

  const row = document.createElement("div");
  row.className = "shader-uniform-row";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(u.min);
  slider.max = String(u.max);
  slider.step = String(u.step);
  slider.value = String(typeof u.value === "number" ? u.value : 0);

  const valueDisplay = document.createElement("span");
  valueDisplay.className = "shader-uniform-value";
  valueDisplay.textContent = formatValue(u.value);

  slider.addEventListener("input", () => {
    const val = u.type === "int" ? parseInt(slider.value, 10) : parseFloat(slider.value);
    valueDisplay.textContent = formatValue(val);

    // Update shader state
    const shader = getShaderState().shaders.find((s) => s.id === shaderId);
    if (shader) {
      const newUniforms = shader.uniforms.map((su) =>
        su.name === u.name ? { ...su, value: val } : su,
      );
      updateShader(shaderId, { uniforms: newUniforms });
    }

    // Update canvas uniform
    setUniform(u.name, val);
  });

  row.appendChild(slider);
  row.appendChild(valueDisplay);

  containerEl.appendChild(label);
  containerEl.appendChild(row);
}

// ---------------------------------------------------------------------------
// Color control (vec3)
// ---------------------------------------------------------------------------

function buildColorControl(u: ShaderUniformDef, shaderId: string): void {
  if (!containerEl) return;

  const label = document.createElement("label");
  label.className = "shader-uniform-label";
  label.textContent = u.name;

  const row = document.createElement("div");
  row.className = "shader-uniform-row";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  const rgb = Array.isArray(u.value) ? u.value as number[] : [1, 1, 1];
  colorInput.value = rgbToHex(rgb[0], rgb[1], rgb[2]);

  const valueDisplay = document.createElement("span");
  valueDisplay.className = "shader-uniform-value";
  valueDisplay.textContent = colorInput.value;

  colorInput.addEventListener("input", () => {
    const hex = colorInput.value;
    valueDisplay.textContent = hex;
    const [r, g, b] = hexToRgb(hex);

    // Update shader state
    const shader = getShaderState().shaders.find((s) => s.id === shaderId);
    if (shader) {
      const newUniforms = shader.uniforms.map((su) =>
        su.name === u.name ? { ...su, value: [r, g, b] } : su,
      );
      updateShader(shaderId, { uniforms: newUniforms });
    }

    // Update canvas uniform (vec3 as array)
    setUniform(u.name, [r, g, b]);
  });

  row.appendChild(colorInput);
  row.appendChild(valueDisplay);

  containerEl.appendChild(label);
  containerEl.appendChild(row);
}

// ---------------------------------------------------------------------------
// Toggle control (bool)
// ---------------------------------------------------------------------------

function buildToggleControl(u: ShaderUniformDef, shaderId: string): void {
  if (!containerEl) return;

  const row = document.createElement("div");
  row.className = "shader-uniform-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = u.value === true;
  checkbox.style.accentColor = "var(--color-accent)";

  const label = document.createElement("label");
  label.className = "shader-uniform-label";
  label.style.marginBottom = "0";
  label.textContent = u.name;

  checkbox.addEventListener("change", () => {
    const val = checkbox.checked;

    // Update shader state
    const shader = getShaderState().shaders.find((s) => s.id === shaderId);
    if (shader) {
      const newUniforms = shader.uniforms.map((su) =>
        su.name === u.name ? { ...su, value: val } : su,
      );
      updateShader(shaderId, { uniforms: newUniforms });
    }

    // Update canvas uniform (bool as 0/1)
    setUniform(u.name, val ? 1 : 0);
  });

  row.appendChild(checkbox);
  row.appendChild(label);

  containerEl.appendChild(row);
}

// ---------------------------------------------------------------------------
// XY control (vec2) — two sliders
// ---------------------------------------------------------------------------

function buildXYControl(u: ShaderUniformDef, shaderId: string): void {
  if (!containerEl) return;

  const label = document.createElement("label");
  label.className = "shader-uniform-label";
  label.textContent = u.name;
  containerEl.appendChild(label);

  const vals = Array.isArray(u.value) ? u.value as number[] : [0.5, 0.5];

  for (let axis = 0; axis < 2; axis++) {
    const axisLabel = axis === 0 ? "x" : "y";

    const row = document.createElement("div");
    row.className = "shader-uniform-row";

    const axisSpan = document.createElement("span");
    axisSpan.className = "shader-uniform-value";
    axisSpan.style.minWidth = "12px";
    axisSpan.textContent = axisLabel;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(u.min);
    slider.max = String(u.max);
    slider.step = String(u.step);
    slider.value = String(vals[axis] ?? 0.5);

    const valueDisplay = document.createElement("span");
    valueDisplay.className = "shader-uniform-value";
    valueDisplay.textContent = formatValue(vals[axis] ?? 0.5);

    const capturedAxis = axis;
    slider.addEventListener("input", () => {
      const val = parseFloat(slider.value);
      valueDisplay.textContent = formatValue(val);

      // Update shader state
      const shader = getShaderState().shaders.find((s) => s.id === shaderId);
      if (shader) {
        const newUniforms = shader.uniforms.map((su) => {
          if (su.name === u.name) {
            const arr = Array.isArray(su.value) ? [...(su.value as number[])] : [0.5, 0.5];
            arr[capturedAxis] = val;
            return { ...su, value: arr };
          }
          return su;
        });
        updateShader(shaderId, { uniforms: newUniforms });
      }

      // Update canvas uniform
      const current = Array.isArray(u.value) ? [...(u.value as number[])] : [0.5, 0.5];
      current[capturedAxis] = val;
      setUniform(u.name, current);
    });

    row.appendChild(axisSpan);
    row.appendChild(slider);
    row.appendChild(valueDisplay);
    containerEl.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
