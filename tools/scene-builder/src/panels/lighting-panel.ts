/**
 * Lighting panel.
 *
 * Three sections:
 * 1. Ambient — color + intensity
 * 2. Directional — enable, color, intensity, angle dial, elevation dial
 * 3. Selected Light — color, intensity, radius, flicker (visible when 1 light selected)
 *
 * Angle and elevation use interactive Canvas2D dials instead of number inputs.
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
// Angle dial (compass, 0–360°)
// ---------------------------------------------------------------------------

/** Canvas2D compass dial for the directional light angle. */
function createAngleDial(
  initial: number,
  onChange: (degrees: number) => void,
): { element: HTMLElement; setValue: (v: number) => void } {
  const SIZE = 72;
  const R = SIZE / 2 - 2; // outer radius
  const CX = SIZE / 2;
  const CY = SIZE / 2;

  const wrapper = document.createElement("div");
  wrapper.className = "sp-dial-wrapper";

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.className = "sp-dial";
  wrapper.appendChild(canvas);

  const numInput = document.createElement("input");
  numInput.type = "number";
  numInput.className = "sp-input sp-dial-input";
  numInput.min = "0";
  numInput.max = "359";
  numInput.step = "1";
  numInput.value = String(Math.round(initial));
  wrapper.appendChild(numInput);

  const ctx = canvas.getContext("2d")!;
  let angleDeg = initial;

  const LABELS: Array<{ label: string; angle: number }> = [
    { label: "N", angle: 0 },
    { label: "E", angle: 90 },
    { label: "S", angle: 180 },
    { label: "W", angle: 270 },
  ];

  function draw(): void {
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Outer ring
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Tick marks (every 45°)
    for (let i = 0; i < 8; i++) {
      const a = (i * 45 - 90) * (Math.PI / 180);
      const inner = i % 2 === 0 ? R - 8 : R - 5;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(a) * inner, CY + Math.sin(a) * inner);
      ctx.lineTo(CX + Math.cos(a) * R, CY + Math.sin(a) * R);
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Cardinal labels
    ctx.font = "bold 8px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (const { label, angle } of LABELS) {
      const a = (angle - 90) * (Math.PI / 180);
      const lr = R - 14;
      ctx.fillText(label, CX + Math.cos(a) * lr, CY + Math.sin(a) * lr);
    }

    // Needle
    const needleAngle = (angleDeg - 90) * (Math.PI / 180);
    const needleLen = R - 6;

    // Needle line
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(CX + Math.cos(needleAngle) * needleLen, CY + Math.sin(needleAngle) * needleLen);
    ctx.strokeStyle = "#E8A851";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Needle tip dot
    ctx.beginPath();
    ctx.arc(
      CX + Math.cos(needleAngle) * needleLen,
      CY + Math.sin(needleAngle) * needleLen,
      3, 0, Math.PI * 2,
    );
    ctx.fillStyle = "#E8A851";
    ctx.fill();

    // Center dot
    ctx.beginPath();
    ctx.arc(CX, CY, 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fill();
  }

  function setAngle(deg: number): void {
    angleDeg = deg;
    if (document.activeElement !== numInput) {
      numInput.value = String(Math.round(deg));
    }
    draw();
  }

  function angleFromMouse(e: MouseEvent): number {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left - CX;
    const my = e.clientY - rect.top - CY;
    let deg = Math.atan2(my, mx) * (180 / Math.PI) + 90;
    if (deg < 0) deg += 360;
    return Math.round(deg) % 360;
  }

  let dragging = false;

  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    const v = angleFromMouse(e);
    setAngle(v);
    onChange(v);
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const v = angleFromMouse(e);
    setAngle(v);
    onChange(v);
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });

  numInput.addEventListener("change", () => {
    let v = Math.round(parseFloat(numInput.value) || 0);
    v = ((v % 360) + 360) % 360;
    numInput.value = String(v);
    setAngle(v);
    onChange(v);
  });

  function setValue(v: number): void {
    if (dragging) return;
    setAngle(v);
  }

  draw();
  return { element: wrapper, setValue };
}

// ---------------------------------------------------------------------------
// Elevation dial (arc, 0–90°)
// ---------------------------------------------------------------------------

/** Canvas2D arc dial for the directional light elevation. */
function createElevationDial(
  initial: number,
  onChange: (degrees: number) => void,
): { element: HTMLElement; setValue: (v: number) => void } {
  const W = 80;
  const H = 50;
  const CX = W / 2;
  const CY = H - 4;
  const R = H - 10;

  const wrapper = document.createElement("div");
  wrapper.className = "sp-dial-wrapper";

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.className = "sp-dial";
  wrapper.appendChild(canvas);

  const numInput = document.createElement("input");
  numInput.type = "number";
  numInput.className = "sp-input sp-dial-input";
  numInput.min = "0";
  numInput.max = "90";
  numInput.step = "1";
  numInput.value = String(Math.round(initial));
  wrapper.appendChild(numInput);

  const ctx = canvas.getContext("2d")!;
  let elevDeg = initial;

  function draw(): void {
    ctx.clearRect(0, 0, W, H);

    // Arc (semicircle from 0° to 180°)
    ctx.beginPath();
    ctx.arc(CX, CY, R, Math.PI, 0);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Horizon line
    ctx.beginPath();
    ctx.moveTo(CX - R - 4, CY);
    ctx.lineTo(CX + R + 4, CY);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Tick marks at 0°, 30°, 45°, 60°, 90°
    const ticks = [0, 30, 45, 60, 90];
    for (const t of ticks) {
      // Elevation angle: 0° = horizon (right side), 90° = zenith (top)
      const a = Math.PI + (t / 180) * Math.PI; // map [0,90] to [PI, PI/2]
      // Correction: 0° → right horizon (angle=0 from +X), 90° → top (angle=-PI/2)
      // In canvas: 0° elevation = horizontal right = angle 0; 90° = straight up = -PI/2
      const canvasAngle = -(t * Math.PI) / 180; // 0° → 0, 90° → -PI/2
      const inner = R - 5;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(canvasAngle) * inner, CY + Math.sin(canvasAngle) * inner);
      ctx.lineTo(CX + Math.cos(canvasAngle) * R, CY + Math.sin(canvasAngle) * R);
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Labels
    ctx.font = "7px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("0°", CX + R + 2, CY - 8);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("90°", CX, CY - R - 2);

    // Needle
    const needleAngle = -(elevDeg * Math.PI) / 180;
    const needleLen = R - 3;

    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(CX + Math.cos(needleAngle) * needleLen, CY + Math.sin(needleAngle) * needleLen);
    ctx.strokeStyle = "#E8A851";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Needle tip
    ctx.beginPath();
    ctx.arc(
      CX + Math.cos(needleAngle) * needleLen,
      CY + Math.sin(needleAngle) * needleLen,
      3, 0, Math.PI * 2,
    );
    ctx.fillStyle = "#E8A851";
    ctx.fill();

    // Center dot
    ctx.beginPath();
    ctx.arc(CX, CY, 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fill();
  }

  function setElev(deg: number): void {
    elevDeg = deg;
    if (document.activeElement !== numInput) {
      numInput.value = String(Math.round(deg));
    }
    draw();
  }

  function elevFromMouse(e: MouseEvent): number {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left - CX;
    const my = e.clientY - rect.top - CY;
    let deg = -Math.atan2(my, mx) * (180 / Math.PI);
    deg = Math.max(0, Math.min(90, Math.round(deg)));
    return deg;
  }

  let dragging = false;

  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    const v = elevFromMouse(e);
    setElev(v);
    onChange(v);
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const v = elevFromMouse(e);
    setElev(v);
    onChange(v);
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });

  numInput.addEventListener("change", () => {
    let v = Math.round(parseFloat(numInput.value) || 0);
    v = Math.max(0, Math.min(90, v));
    numInput.value = String(v);
    setElev(v);
    onChange(v);
  });

  function setValue(v: number): void {
    if (dragging) return;
    setElev(v);
  }

  draw();
  return { element: wrapper, setValue };
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
  let angleDial: { element: HTMLElement; setValue: (v: number) => void };
  let elevDial: { element: HTMLElement; setValue: (v: number) => void };

  {
    const { directional } = getSceneState().lighting;

    dirEnableCheckbox = createCheckbox(directional.enabled, (v) => updateDirectionalLighting({ enabled: v }));
    dirSection.body.appendChild(createRow("Enabled", dirEnableCheckbox));

    dirColorInput = createColorInput(directional.color, (v) => updateDirectionalLighting({ color: v }));
    dirSection.body.appendChild(createRow("Color", dirColorInput));

    dirIntSlider = createSlider(directional.intensity, 0, 3, 0.05, (v) => updateDirectionalLighting({ intensity: v }));
    dirSection.body.appendChild(createRow("Intensity", dirIntSlider));

    angleDial = createAngleDial(directional.angle, (v) => updateDirectionalLighting({ angle: v }));
    dirSection.body.appendChild(createRow("Angle", angleDial.element));

    elevDial = createElevationDial(directional.elevation, (v) => updateDirectionalLighting({ elevation: v }));
    dirSection.body.appendChild(createRow("Elevation", elevDial.element));
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

    // Dials
    angleDial.setValue(lighting.directional.angle);
    elevDial.setValue(lighting.directional.elevation);

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
