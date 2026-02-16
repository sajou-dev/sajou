/**
 * Lighting panel.
 *
 * Three sections:
 * 1. Ambient — color + intensity
 * 2. Directional — enable, color, intensity, angle, elevation
 * 3. Selected Light — color, intensity, radius, flicker (visible when 1 light selected)
 *
 * Reuses the `sp-` CSS classes from settings-panel.
 */

import { getEditorState, subscribeEditor } from "../state/editor-state.js";
import {
  getSceneState,
  subscribeScene,
  updateAmbientLighting,
  updateDirectionalLighting,
  updateLightSource,
} from "../state/scene-state.js";

// ---------------------------------------------------------------------------
// DOM helpers (match settings-panel pattern)
// ---------------------------------------------------------------------------

function createSection(title: string): { section: HTMLElement; body: HTMLElement } {
  const section = document.createElement("div");
  section.className = "sp-section";

  const heading = document.createElement("div");
  heading.className = "sp-section-title";
  heading.textContent = title;
  section.appendChild(heading);

  const body = document.createElement("div");
  body.className = "sp-section-body";
  section.appendChild(body);

  return { section, body };
}

function createRow(label: string, control: HTMLElement): HTMLElement {
  const row = document.createElement("div");
  row.className = "sp-row";

  const lbl = document.createElement("span");
  lbl.className = "sp-label";
  lbl.textContent = label;

  row.appendChild(lbl);
  row.appendChild(control);
  return row;
}

function createColorInput(value: string, onChange: (v: string) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "color";
  input.className = "sp-input";
  input.value = value;
  input.style.width = "40px";
  input.style.height = "24px";
  input.style.padding = "0";
  input.style.border = "none";
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

function createSlider(
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (v: number) => void,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "6px";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "sp-slider";
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);
  slider.style.flex = "1";

  const label = document.createElement("span");
  label.className = "sp-value";
  label.textContent = value.toFixed(2);
  label.style.minWidth = "36px";
  label.style.textAlign = "right";

  slider.addEventListener("input", () => {
    const v = parseFloat(slider.value);
    label.textContent = v.toFixed(2);
    onChange(v);
  });

  wrapper.appendChild(slider);
  wrapper.appendChild(label);
  return wrapper;
}

function createNumberInput(
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (v: number) => void,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.className = "sp-input";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("change", () => {
    const v = Math.max(min, Math.min(max, parseFloat(input.value) || 0));
    input.value = String(v);
    onChange(v);
  });
  return input;
}

function createCheckbox(
  checked: boolean,
  onChange: (v: boolean) => void,
): HTMLInputElement {
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "sp-checkbox";
  cb.checked = checked;
  cb.addEventListener("change", () => onChange(cb.checked));
  return cb;
}

// ---------------------------------------------------------------------------
// Panel init
// ---------------------------------------------------------------------------

/** Initialize the lighting panel inside a container element. */
export function initLightingPanel(container: HTMLElement): void {
  container.innerHTML = "";

  // === Ambient section ===
  const ambientSection = createSection("Ambient");
  let ambientColorInput: HTMLInputElement;
  let ambientIntSlider: HTMLElement;

  {
    const { ambient } = getSceneState().lighting;

    ambientColorInput = createColorInput(ambient.color, (v) => updateAmbientLighting({ color: v }));
    ambientSection.body.appendChild(createRow("Color", ambientColorInput));

    ambientIntSlider = createSlider(ambient.intensity, 0, 2, 0.05, (v) => updateAmbientLighting({ intensity: v }));
    ambientSection.body.appendChild(createRow("Intensity", ambientIntSlider));
  }

  // === Directional section ===
  const dirSection = createSection("Directional");
  let dirEnableCheckbox: HTMLInputElement;
  let dirColorInput: HTMLInputElement;
  let dirIntSlider: HTMLElement;
  let dirAngleInput: HTMLInputElement;
  let dirElevInput: HTMLInputElement;

  {
    const { directional } = getSceneState().lighting;

    dirEnableCheckbox = createCheckbox(directional.enabled, (v) => updateDirectionalLighting({ enabled: v }));
    dirSection.body.appendChild(createRow("Enabled", dirEnableCheckbox));

    dirColorInput = createColorInput(directional.color, (v) => updateDirectionalLighting({ color: v }));
    dirSection.body.appendChild(createRow("Color", dirColorInput));

    dirIntSlider = createSlider(directional.intensity, 0, 3, 0.05, (v) => updateDirectionalLighting({ intensity: v }));
    dirSection.body.appendChild(createRow("Intensity", dirIntSlider));

    dirAngleInput = createNumberInput(directional.angle, 0, 360, 1, (v) => updateDirectionalLighting({ angle: v }));
    dirSection.body.appendChild(createRow("Angle", dirAngleInput));

    dirElevInput = createNumberInput(directional.elevation, 0, 90, 1, (v) => updateDirectionalLighting({ elevation: v }));
    dirSection.body.appendChild(createRow("Elevation", dirElevInput));
  }

  // === Selected Light section ===
  const selSection = createSection("Selected Light");
  const selBody = selSection.body;
  const selWrapper = selSection.section;

  container.appendChild(ambientSection.section);
  container.appendChild(dirSection.section);
  container.appendChild(selWrapper);

  // --- Sync state → UI ---
  function syncUI(): void {
    const { lighting } = getSceneState();
    const { selectedLightIds } = getEditorState();

    // Ambient
    if (document.activeElement !== ambientColorInput) {
      ambientColorInput.value = lighting.ambient.color;
    }
    const ambSlider = ambientIntSlider.querySelector("input[type=range]") as HTMLInputElement | null;
    const ambLabel = ambientIntSlider.querySelector(".sp-value") as HTMLElement | null;
    if (ambSlider && document.activeElement !== ambSlider) {
      ambSlider.value = String(lighting.ambient.intensity);
    }
    if (ambLabel) ambLabel.textContent = lighting.ambient.intensity.toFixed(2);

    // Directional
    if (document.activeElement !== dirEnableCheckbox) {
      dirEnableCheckbox.checked = lighting.directional.enabled;
    }
    if (document.activeElement !== dirColorInput) {
      dirColorInput.value = lighting.directional.color;
    }
    const dirSlider = dirIntSlider.querySelector("input[type=range]") as HTMLInputElement | null;
    const dirLabel = dirIntSlider.querySelector(".sp-value") as HTMLElement | null;
    if (dirSlider && document.activeElement !== dirSlider) {
      dirSlider.value = String(lighting.directional.intensity);
    }
    if (dirLabel) dirLabel.textContent = lighting.directional.intensity.toFixed(2);
    if (document.activeElement !== dirAngleInput) {
      dirAngleInput.value = String(lighting.directional.angle);
    }
    if (document.activeElement !== dirElevInput) {
      dirElevInput.value = String(lighting.directional.elevation);
    }

    // Selected light
    if (selectedLightIds.length === 1) {
      const source = lighting.sources.find((s) => s.id === selectedLightIds[0]);
      if (source) {
        selWrapper.style.display = "";
        rebuildSelectedLightUI(selBody, source);
        return;
      }
    }
    selWrapper.style.display = "none";
  }

  /** Track the light ID we built the UI for, to avoid unnecessary rebuilds. */
  let builtForId: string | null = null;

  function rebuildSelectedLightUI(body: HTMLElement, source: { id: string; color: string; intensity: number; radius: number; flicker?: { speed: number; amount: number } }): void {
    if (builtForId === source.id) {
      // Just update values without rebuilding
      const inputs = body.querySelectorAll<HTMLInputElement>("input");
      for (const input of inputs) {
        if (document.activeElement === input) continue;
        const field = input.dataset.field;
        if (field === "color") input.value = source.color;
        else if (field === "intensity") input.value = String(source.intensity);
        else if (field === "radius") input.value = String(source.radius);
        else if (field === "flickerSpeed") input.value = String(source.flicker?.speed ?? 0);
        else if (field === "flickerAmount") input.value = String(source.flicker?.amount ?? 0);
      }
      // Update slider labels
      const labels = body.querySelectorAll<HTMLElement>(".sp-value");
      for (const lbl of labels) {
        const field = lbl.dataset.field;
        if (field === "intensity") lbl.textContent = source.intensity.toFixed(2);
        else if (field === "flickerAmount") lbl.textContent = (source.flicker?.amount ?? 0).toFixed(2);
      }
      return;
    }

    body.innerHTML = "";
    builtForId = source.id;
    const sid = source.id;

    const colorIn = createColorInput(source.color, (v) => updateLightSource(sid, { color: v }));
    colorIn.dataset.field = "color";
    body.appendChild(createRow("Color", colorIn));

    const intSlider = createSlider(source.intensity, 0, 3, 0.05, (v) => updateLightSource(sid, { intensity: v }));
    const intLabel = intSlider.querySelector(".sp-value") as HTMLElement | null;
    if (intLabel) intLabel.dataset.field = "intensity";
    const intInput = intSlider.querySelector("input") as HTMLInputElement | null;
    if (intInput) intInput.dataset.field = "intensity";
    body.appendChild(createRow("Intensity", intSlider));

    const radiusIn = createNumberInput(source.radius, 1, 1000, 1, (v) => updateLightSource(sid, { radius: v }));
    radiusIn.dataset.field = "radius";
    body.appendChild(createRow("Radius", radiusIn));

    const flickerSpeed = createNumberInput(source.flicker?.speed ?? 0, 0, 10, 0.1, (v) => {
      const { lighting } = getSceneState();
      const s = lighting.sources.find((l) => l.id === sid);
      if (!s) return;
      updateLightSource(sid, { flicker: { speed: v, amount: s.flicker?.amount ?? 0 } });
    });
    flickerSpeed.dataset.field = "flickerSpeed";
    body.appendChild(createRow("Flicker Speed", flickerSpeed));

    const flickerAmt = createSlider(source.flicker?.amount ?? 0, 0, 1, 0.01, (v) => {
      const { lighting } = getSceneState();
      const s = lighting.sources.find((l) => l.id === sid);
      if (!s) return;
      updateLightSource(sid, { flicker: { speed: s.flicker?.speed ?? 0, amount: v } });
    });
    const amtLabel = flickerAmt.querySelector(".sp-value") as HTMLElement | null;
    if (amtLabel) amtLabel.dataset.field = "flickerAmount";
    const amtInput = flickerAmt.querySelector("input") as HTMLInputElement | null;
    if (amtInput) amtInput.dataset.field = "flickerAmount";
    body.appendChild(createRow("Flicker Amount", flickerAmt));
  }

  subscribeScene(syncUI);
  subscribeEditor(syncUI);
  syncUI();
}
