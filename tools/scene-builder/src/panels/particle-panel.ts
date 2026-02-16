/**
 * Particle panel.
 *
 * Displays configuration controls when a single particle emitter is selected.
 * Controls: type, count, lifetime, velocity/direction, color stops, size, glow.
 * Reuses the `sp-` CSS classes from settings-panel.
 */

import { getEditorState, subscribeEditor } from "../state/editor-state.js";
import {
  getSceneState,
  subscribeScene,
  updateParticleEmitter,
} from "../state/scene-state.js";
import type { ParticleEmitterState } from "../types.js";

// ---------------------------------------------------------------------------
// DOM helpers (match settings-panel / lighting-panel pattern)
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
  label.textContent = value.toFixed(1);
  label.style.minWidth = "36px";
  label.style.textAlign = "right";

  slider.addEventListener("input", () => {
    const v = parseFloat(slider.value);
    label.textContent = v.toFixed(1);
    onChange(v);
  });

  wrapper.appendChild(slider);
  wrapper.appendChild(label);
  return wrapper;
}

function createColorInput(value: string, onChange: (v: string) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "color";
  input.className = "sp-input";
  input.value = value;
  input.style.width = "32px";
  input.style.height = "24px";
  input.style.padding = "0";
  input.style.border = "none";
  input.addEventListener("input", () => onChange(input.value));
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
// Direction dial (compass, converts angle ↔ direction vector)
// ---------------------------------------------------------------------------

/**
 * Convert a direction vector {x, y} to a compass angle in degrees.
 * 0° = up (y=-1), 90° = right (x=1), 180° = down (y=1), 270° = left (x=-1).
 */
function directionToAngle(dx: number, dy: number): number {
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  let deg = Math.atan2(dx, -dy) * (180 / Math.PI);
  if (deg < 0) deg += 360;
  return Math.round(deg) % 360;
}

/** Convert a compass angle (degrees) to a normalized direction vector. */
function angleToDirection(deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return {
    x: parseFloat(Math.sin(rad).toFixed(4)),
    y: parseFloat((-Math.cos(rad)).toFixed(4)),
  };
}

/** Canvas2D compass dial for particle emission direction. */
function createDirectionDial(
  initialDir: { x: number; y: number },
  onChange: (dir: { x: number; y: number }) => void,
): { element: HTMLElement; setValue: (dir: { x: number; y: number }) => void } {
  const SIZE = 72;
  const R = SIZE / 2 - 2;
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
  numInput.value = String(directionToAngle(initialDir.x, initialDir.y));
  wrapper.appendChild(numInput);

  const ctx = canvas.getContext("2d")!;
  let angleDeg = directionToAngle(initialDir.x, initialDir.y);

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

    // Spread cone (±17° visual hint)
    const spreadRad = (17 * Math.PI) / 180;
    const needleAngle = (angleDeg - 90) * (Math.PI / 180);
    const coneLen = R - 6;

    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(
      CX + Math.cos(needleAngle - spreadRad) * coneLen,
      CY + Math.sin(needleAngle - spreadRad) * coneLen,
    );
    ctx.arc(CX, CY, coneLen, needleAngle - spreadRad, needleAngle + spreadRad);
    ctx.closePath();
    ctx.fillStyle = "rgba(232, 168, 81, 0.08)";
    ctx.fill();

    // Needle line
    const needleLen = R - 6;
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
    onChange(angleToDirection(v));
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const v = angleFromMouse(e);
    setAngle(v);
    onChange(angleToDirection(v));
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
  });

  numInput.addEventListener("change", () => {
    let v = Math.round(parseFloat(numInput.value) || 0);
    v = ((v % 360) + 360) % 360;
    numInput.value = String(v);
    setAngle(v);
    onChange(angleToDirection(v));
  });

  function setValue(dir: { x: number; y: number }): void {
    if (dragging) return;
    setAngle(directionToAngle(dir.x, dir.y));
  }

  draw();
  return { element: wrapper, setValue };
}

// ---------------------------------------------------------------------------
// Panel init
// ---------------------------------------------------------------------------

/** Initialize the particle panel inside a container element. */
export function initParticlePanel(container: HTMLElement): void {
  container.innerHTML = "";

  const placeholder = document.createElement("div");
  placeholder.className = "sp-section-body";
  placeholder.style.padding = "12px";
  placeholder.style.color = "var(--color-text-muted)";
  placeholder.textContent = "Select a particle emitter to configure.";
  container.appendChild(placeholder);

  let builtForId: string | null = null;
  let contentEl: HTMLElement | null = null;
  /** Reference to the direction dial's setValue for live sync. */
  let directionDialRef: { setValue: (dir: { x: number; y: number }) => void } | null = null;

  function syncUI(): void {
    const { selectedParticleIds } = getEditorState();
    const { particles } = getSceneState();

    if (selectedParticleIds.length !== 1) {
      placeholder.style.display = "";
      if (contentEl) contentEl.style.display = "none";
      builtForId = null;
      return;
    }

    const emitter = particles.find((p) => p.id === selectedParticleIds[0]);
    if (!emitter) {
      placeholder.style.display = "";
      if (contentEl) contentEl.style.display = "none";
      builtForId = null;
      return;
    }

    placeholder.style.display = "none";

    if (builtForId !== emitter.id) {
      buildUI(emitter);
    } else {
      updateValues(emitter);
    }
  }

  function buildUI(emitter: ParticleEmitterState): void {
    if (contentEl) contentEl.remove();
    contentEl = document.createElement("div");
    container.appendChild(contentEl);
    builtForId = emitter.id;
    const sid = emitter.id;

    // --- Type section ---
    const typeSection = createSection("Emission");
    {
      const radioWrapper = document.createElement("div");
      radioWrapper.style.display = "flex";
      radioWrapper.style.gap = "12px";

      for (const val of ["radial", "directional"] as const) {
        const label = document.createElement("label");
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.gap = "4px";
        label.style.cursor = "pointer";
        label.style.fontSize = "12px";

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `particle-type-${sid}`;
        radio.value = val;
        radio.checked = emitter.type === val;
        radio.dataset.field = "type";
        radio.addEventListener("change", () => {
          if (radio.checked) updateParticleEmitter(sid, { type: val });
        });

        label.appendChild(radio);
        label.appendChild(document.createTextNode(val));
        radioWrapper.appendChild(label);
      }

      typeSection.body.appendChild(createRow("Type", radioWrapper));

      const countInput = createNumberInput(emitter.count, 1, 500, 1, (v) =>
        updateParticleEmitter(sid, { count: v }),
      );
      countInput.dataset.field = "count";
      typeSection.body.appendChild(createRow("Count", countInput));
    }
    contentEl.appendChild(typeSection.section);

    // --- Lifetime section ---
    const lifeSection = createSection("Lifetime");
    {
      const minInput = createNumberInput(emitter.lifetime[0], 0.1, 10, 0.1, (v) =>
        updateParticleEmitter(sid, { lifetime: [v, emitter.lifetime[1]] }),
      );
      minInput.dataset.field = "lifetimeMin";
      lifeSection.body.appendChild(createRow("Min (s)", minInput));

      const maxInput = createNumberInput(emitter.lifetime[1], 0.1, 10, 0.1, (v) =>
        updateParticleEmitter(sid, { lifetime: [emitter.lifetime[0], v] }),
      );
      maxInput.dataset.field = "lifetimeMax";
      lifeSection.body.appendChild(createRow("Max (s)", maxInput));
    }
    contentEl.appendChild(lifeSection.section);

    // --- Velocity section (radial) ---
    const velSection = createSection("Velocity (Radial)");
    velSection.section.dataset.showWhen = "radial";
    {
      const xMinInput = createNumberInput(emitter.velocity.x[0], -500, 500, 1, (v) => {
        const cur = getSceneState().particles.find((p) => p.id === sid);
        if (!cur) return;
        updateParticleEmitter(sid, { velocity: { ...cur.velocity, x: [v, cur.velocity.x[1]] } });
      });
      xMinInput.dataset.field = "velXMin";
      velSection.body.appendChild(createRow("X Min", xMinInput));

      const xMaxInput = createNumberInput(emitter.velocity.x[1], -500, 500, 1, (v) => {
        const cur = getSceneState().particles.find((p) => p.id === sid);
        if (!cur) return;
        updateParticleEmitter(sid, { velocity: { ...cur.velocity, x: [cur.velocity.x[0], v] } });
      });
      xMaxInput.dataset.field = "velXMax";
      velSection.body.appendChild(createRow("X Max", xMaxInput));

      const yMinInput = createNumberInput(emitter.velocity.y[0], -500, 500, 1, (v) => {
        const cur = getSceneState().particles.find((p) => p.id === sid);
        if (!cur) return;
        updateParticleEmitter(sid, { velocity: { ...cur.velocity, y: [v, cur.velocity.y[1]] } });
      });
      yMinInput.dataset.field = "velYMin";
      velSection.body.appendChild(createRow("Y Min", yMinInput));

      const yMaxInput = createNumberInput(emitter.velocity.y[1], -500, 500, 1, (v) => {
        const cur = getSceneState().particles.find((p) => p.id === sid);
        if (!cur) return;
        updateParticleEmitter(sid, { velocity: { ...cur.velocity, y: [cur.velocity.y[0], v] } });
      });
      yMaxInput.dataset.field = "velYMax";
      velSection.body.appendChild(createRow("Y Max", yMaxInput));
    }
    contentEl.appendChild(velSection.section);

    // --- Direction section (directional) ---
    const dirSection = createSection("Direction");
    dirSection.section.dataset.showWhen = "directional";
    {
      const dial = createDirectionDial(emitter.direction, (dir) => {
        updateParticleEmitter(sid, { direction: dir });
      });
      directionDialRef = dial;
      dirSection.body.appendChild(createRow("Angle", dial.element));

      const spdMinInput = createNumberInput(emitter.speed[0], 0, 500, 1, (v) =>
        updateParticleEmitter(sid, { speed: [v, emitter.speed[1]] }),
      );
      spdMinInput.dataset.field = "speedMin";
      dirSection.body.appendChild(createRow("Speed Min", spdMinInput));

      const spdMaxInput = createNumberInput(emitter.speed[1], 0, 500, 1, (v) =>
        updateParticleEmitter(sid, { speed: [emitter.speed[0], v] }),
      );
      spdMaxInput.dataset.field = "speedMax";
      dirSection.body.appendChild(createRow("Speed Max", spdMaxInput));
    }
    contentEl.appendChild(dirSection.section);

    // --- Color section ---
    const colorSection = createSection("Color Over Life");
    {
      const stopsWrapper = document.createElement("div");
      stopsWrapper.className = "pp-color-stops";

      function rebuildStops(): void {
        const cur = getSceneState().particles.find((p) => p.id === sid);
        if (!cur) return;
        stopsWrapper.innerHTML = "";

        for (let i = 0; i < cur.colorOverLife.length; i++) {
          const stopColor = cur.colorOverLife[i]!;
          const colorIn = createColorInput(stopColor, (v) => {
            const latest = getSceneState().particles.find((p) => p.id === sid);
            if (!latest) return;
            const newStops = [...latest.colorOverLife];
            newStops[i] = v;
            updateParticleEmitter(sid, { colorOverLife: newStops });
          });

          const stopEl = document.createElement("div");
          stopEl.style.display = "flex";
          stopEl.style.alignItems = "center";
          stopEl.style.gap = "2px";

          stopEl.appendChild(colorIn);

          // Remove button (if more than 1 stop)
          if (cur.colorOverLife.length > 1) {
            const removeBtn = document.createElement("button");
            removeBtn.className = "sp-btn-small";
            removeBtn.textContent = "×";
            removeBtn.style.fontSize = "14px";
            removeBtn.style.lineHeight = "1";
            removeBtn.style.padding = "0 4px";
            removeBtn.style.cursor = "pointer";
            removeBtn.addEventListener("click", () => {
              const latest = getSceneState().particles.find((p) => p.id === sid);
              if (!latest) return;
              const newStops = latest.colorOverLife.filter((_: string, idx: number) => idx !== i);
              updateParticleEmitter(sid, { colorOverLife: newStops });
              rebuildStops();
            });
            stopEl.appendChild(removeBtn);
          }

          stopsWrapper.appendChild(stopEl);
        }

        // Add button (max 4)
        if (cur.colorOverLife.length < 4) {
          const addBtn = document.createElement("button");
          addBtn.className = "pp-color-stop-add";
          addBtn.textContent = "+";
          addBtn.title = "Add color stop";
          addBtn.addEventListener("click", () => {
            const latest = getSceneState().particles.find((p) => p.id === sid);
            if (!latest) return;
            const lastColor = latest.colorOverLife[latest.colorOverLife.length - 1] ?? "#FF0000";
            updateParticleEmitter(sid, { colorOverLife: [...latest.colorOverLife, lastColor] });
            rebuildStops();
          });
          stopsWrapper.appendChild(addBtn);
        }
      }

      rebuildStops();
      colorSection.body.appendChild(stopsWrapper);
    }
    contentEl.appendChild(colorSection.section);

    // --- Size section ---
    const sizeSection = createSection("Size");
    {
      const startSlider = createSlider(emitter.size[0], 1, 50, 1, (v) =>
        updateParticleEmitter(sid, { size: [v, emitter.size[1]] }),
      );
      sizeSection.body.appendChild(createRow("Start", startSlider));

      const endSlider = createSlider(emitter.size[1], 1, 50, 1, (v) =>
        updateParticleEmitter(sid, { size: [emitter.size[0], v] }),
      );
      sizeSection.body.appendChild(createRow("End", endSlider));
    }
    contentEl.appendChild(sizeSection.section);

    // --- Glow section ---
    const glowSection = createSection("Effects");
    {
      const glowCb = createCheckbox(emitter.glow, (v) =>
        updateParticleEmitter(sid, { glow: v }),
      );
      glowCb.dataset.field = "glow";
      glowSection.body.appendChild(createRow("Glow", glowCb));
    }
    contentEl.appendChild(glowSection.section);

    // Initial visibility sync
    updateTypeVisibility(emitter.type);
  }

  function updateTypeVisibility(type: string): void {
    if (!contentEl) return;
    const sections = contentEl.querySelectorAll<HTMLElement>("[data-show-when]");
    for (const section of sections) {
      section.style.display = section.dataset.showWhen === type ? "" : "none";
    }
  }

  function updateValues(emitter: ParticleEmitterState): void {
    if (!contentEl) return;

    const inputs = contentEl.querySelectorAll<HTMLInputElement>("input");
    for (const input of inputs) {
      if (document.activeElement === input) continue;
      const field = input.dataset.field;
      if (!field) continue;

      switch (field) {
        case "count": input.value = String(emitter.count); break;
        case "lifetimeMin": input.value = String(emitter.lifetime[0]); break;
        case "lifetimeMax": input.value = String(emitter.lifetime[1]); break;
        case "velXMin": input.value = String(emitter.velocity.x[0]); break;
        case "velXMax": input.value = String(emitter.velocity.x[1]); break;
        case "velYMin": input.value = String(emitter.velocity.y[0]); break;
        case "velYMax": input.value = String(emitter.velocity.y[1]); break;
        case "speedMin": input.value = String(emitter.speed[0]); break;
        case "speedMax": input.value = String(emitter.speed[1]); break;
        case "glow":
          if (input.type === "checkbox") input.checked = emitter.glow;
          break;
        case "type":
          if (input.type === "radio") input.checked = input.value === emitter.type;
          break;
      }
    }

    // Sync direction dial
    directionDialRef?.setValue(emitter.direction);

    updateTypeVisibility(emitter.type);
  }

  subscribeScene(syncUI);
  subscribeEditor(syncUI);
  syncUI();
}
