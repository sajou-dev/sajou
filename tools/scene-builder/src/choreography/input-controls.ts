/**
 * ISF input controls factory.
 *
 * Creates a DOM control element for each InputDeclaration type.
 * Each control emits its current value via a callback on change.
 *
 * All controls follow the pattern:
 *   createControl(decl, currentValue, onChange) → HTMLElement
 */

import type { InputDeclaration } from "./input-types.js";
import { getSceneState } from "../state/scene-state.js";

// ---------------------------------------------------------------------------
// Easing names (shared constant)
// ---------------------------------------------------------------------------

const EASING_OPTIONS = ["linear", "easeIn", "easeOut", "easeInOut", "arc"];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Callback invoked when the user changes a control value. */
export type OnInputChange = (key: string, value: unknown) => void;

/**
 * Create a DOM control for the given input declaration.
 *
 * Returns a container `<div class="isf-control">` with label + control.
 */
export function createInputControl(
  decl: InputDeclaration,
  currentValue: unknown,
  onChange: OnInputChange,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "isf-control";

  // Label
  const label = document.createElement("span");
  label.className = "isf-label";
  label.textContent = decl.label;
  if (decl.required) {
    const req = document.createElement("span");
    req.className = "isf-required";
    req.textContent = "*";
    label.appendChild(req);
  }
  container.appendChild(label);

  // Control element (dispatched by type)
  const control = buildControl(decl, currentValue, onChange);
  container.appendChild(control);

  // Hint text
  if (decl.hint) {
    const hint = document.createElement("div");
    hint.className = "isf-hint";
    hint.textContent = decl.hint;
    container.appendChild(hint);
  }

  return container;
}

// ---------------------------------------------------------------------------
// Control builders (by type)
// ---------------------------------------------------------------------------

function buildControl(
  decl: InputDeclaration,
  currentValue: unknown,
  onChange: OnInputChange,
): HTMLElement {
  switch (decl.type) {
    case "float":
      return buildFloatControl(decl.key, currentValue, onChange, decl.min, decl.max, decl.step, decl.default);
    case "int":
      return buildIntControl(decl.key, currentValue, onChange, decl.min, decl.max, decl.default);
    case "bool":
      return buildBoolControl(decl.key, currentValue, onChange, decl.default);
    case "string":
      return buildStringControl(decl.key, currentValue, onChange, decl.placeholder, decl.default);
    case "enum":
      return buildEnumControl(decl.key, currentValue, onChange, decl.options, decl.default);
    case "point2D":
      return buildPoint2DControl(decl.key, currentValue, onChange);
    case "color":
      return buildColorControl(decl.key, currentValue, onChange, decl.default);
    case "duration":
      return buildDurationControl(decl.key, currentValue, onChange, decl.min, decl.max, decl.default);
    case "easing":
      return buildEasingControl(decl.key, currentValue, onChange, decl.default);
    case "entity-ref":
      return buildEntityRefControl(decl.key, currentValue, onChange, decl.allowSignalRef, decl.placeholder, decl.default);
    case "position-ref":
      return buildPositionRefControl(decl.key, currentValue, onChange, decl.allowSignalRef, decl.placeholder, decl.default);
    case "route-ref":
      return buildRouteRefControl(decl.key, currentValue, onChange, decl.placeholder, decl.default);
    case "waypoint-ref":
      return buildWaypointRefControl(decl.key, currentValue, onChange, decl.placeholder, decl.default);
    case "angle":
      return buildAngleControl(decl.key, currentValue, onChange, decl.default);
    case "json":
      return buildJsonControl(decl.key, currentValue, onChange);
  }
}

// ---------------------------------------------------------------------------
// Float / Int
// ---------------------------------------------------------------------------

function buildFloatControl(
  key: string, value: unknown, onChange: OnInputChange,
  min?: number, max?: number, step?: number, defaultVal?: number,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "isf-slider-wrap";

  const numVal = typeof value === "number" ? value : (defaultVal ?? 0);

  if (min !== undefined && max !== undefined) {
    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "isf-slider";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step ?? 0.01);
    slider.value = String(numVal);
    wrap.appendChild(slider);

    const numInput = document.createElement("input");
    numInput.type = "number";
    numInput.className = "isf-number";
    numInput.value = String(numVal);
    numInput.step = String(step ?? 0.01);
    wrap.appendChild(numInput);

    slider.addEventListener("input", () => {
      numInput.value = slider.value;
      onChange(key, parseFloat(slider.value));
    });
    numInput.addEventListener("change", () => {
      slider.value = numInput.value;
      onChange(key, parseFloat(numInput.value));
    });
  } else {
    const numInput = document.createElement("input");
    numInput.type = "number";
    numInput.className = "isf-number isf-number--full";
    numInput.value = String(numVal);
    numInput.step = String(step ?? 0.01);
    numInput.addEventListener("change", () => {
      onChange(key, parseFloat(numInput.value));
    });
    wrap.appendChild(numInput);
  }

  return wrap;
}

function buildIntControl(
  key: string, value: unknown, onChange: OnInputChange,
  min?: number, max?: number, defaultVal?: number,
): HTMLElement {
  return buildFloatControl(key, value, onChange, min, max, 1, defaultVal);
}

// ---------------------------------------------------------------------------
// Bool
// ---------------------------------------------------------------------------

function buildBoolControl(
  key: string, value: unknown, onChange: OnInputChange,
  defaultVal?: boolean,
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "isf-toggle-wrap";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "isf-toggle";
  cb.checked = typeof value === "boolean" ? value : (defaultVal ?? false);
  cb.addEventListener("change", () => onChange(key, cb.checked));

  const slider = document.createElement("span");
  slider.className = "isf-toggle-slider";

  wrap.appendChild(cb);
  wrap.appendChild(slider);
  return wrap;
}

// ---------------------------------------------------------------------------
// String
// ---------------------------------------------------------------------------

function buildStringControl(
  key: string, value: unknown, onChange: OnInputChange,
  placeholder?: string, defaultVal?: string,
): HTMLElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "isf-text";
  input.value = typeof value === "string" ? value : (defaultVal ?? "");
  if (placeholder) input.placeholder = placeholder;
  input.addEventListener("change", () => onChange(key, input.value));
  return input;
}

// ---------------------------------------------------------------------------
// Enum
// ---------------------------------------------------------------------------

function buildEnumControl(
  key: string, value: unknown, onChange: OnInputChange,
  options: Array<{ value: string; label: string }>, defaultVal?: string,
): HTMLElement {
  const select = document.createElement("select");
  select.className = "isf-select";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === (value ?? defaultVal)) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener("change", () => onChange(key, select.value));
  return select;
}

// ---------------------------------------------------------------------------
// Point2D
// ---------------------------------------------------------------------------

function buildPoint2DControl(
  key: string, value: unknown, onChange: OnInputChange,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "isf-point2d";

  const obj = (typeof value === "object" && value !== null)
    ? value as Record<string, unknown>
    : { x: 0, y: 0 };

  const xInput = document.createElement("input");
  xInput.type = "number";
  xInput.className = "isf-number";
  xInput.value = String(obj["x"] ?? 0);
  xInput.placeholder = "x";

  const yInput = document.createElement("input");
  yInput.type = "number";
  yInput.className = "isf-number";
  yInput.value = String(obj["y"] ?? 0);
  yInput.placeholder = "y";

  const emit = (): void => {
    onChange(key, { x: parseFloat(xInput.value) || 0, y: parseFloat(yInput.value) || 0 });
  };

  xInput.addEventListener("change", emit);
  yInput.addEventListener("change", emit);

  const xLabel = document.createElement("span");
  xLabel.className = "isf-point2d-label";
  xLabel.textContent = "x";
  const yLabel = document.createElement("span");
  yLabel.className = "isf-point2d-label";
  yLabel.textContent = "y";

  wrap.appendChild(xLabel);
  wrap.appendChild(xInput);
  wrap.appendChild(yLabel);
  wrap.appendChild(yInput);
  return wrap;
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

function buildColorControl(
  key: string, value: unknown, onChange: OnInputChange,
  defaultVal?: string,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "isf-color-wrap";

  const colorVal = typeof value === "string" ? value : (defaultVal ?? "#E8A851");

  const swatch = document.createElement("input");
  swatch.type = "color";
  swatch.className = "isf-color-swatch";
  swatch.value = colorVal;

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.className = "isf-color-text";
  textInput.value = colorVal;

  swatch.addEventListener("input", () => {
    textInput.value = swatch.value;
    onChange(key, swatch.value);
  });

  textInput.addEventListener("change", () => {
    // Validate hex color
    if (/^#[0-9a-fA-F]{6}$/.test(textInput.value)) {
      swatch.value = textInput.value;
      onChange(key, textInput.value);
    }
  });

  wrap.appendChild(swatch);
  wrap.appendChild(textInput);
  return wrap;
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

function buildDurationControl(
  key: string, value: unknown, onChange: OnInputChange,
  min?: number, max?: number, defaultVal?: number,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "isf-duration-wrap";

  const msVal = typeof value === "number" ? value : (defaultVal ?? 500);
  const rangeMin = min ?? 0;
  const rangeMax = max ?? 10000;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "isf-slider";
  slider.min = String(rangeMin);
  slider.max = String(rangeMax);
  slider.step = "50";
  slider.value = String(msVal);

  const numInput = document.createElement("input");
  numInput.type = "number";
  numInput.className = "isf-number";
  numInput.value = String(msVal);
  numInput.min = String(rangeMin);

  const unit = document.createElement("span");
  unit.className = "isf-unit";
  unit.textContent = "ms";

  slider.addEventListener("input", () => {
    numInput.value = slider.value;
    onChange(key, parseInt(slider.value, 10));
  });
  numInput.addEventListener("change", () => {
    slider.value = numInput.value;
    onChange(key, parseInt(numInput.value, 10));
  });

  wrap.appendChild(slider);
  wrap.appendChild(numInput);
  wrap.appendChild(unit);
  return wrap;
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

function buildEasingControl(
  key: string, value: unknown, onChange: OnInputChange,
  defaultVal?: string,
): HTMLElement {
  const select = document.createElement("select");
  select.className = "isf-select";
  for (const e of EASING_OPTIONS) {
    const opt = document.createElement("option");
    opt.value = e;
    opt.textContent = e;
    if (e === (value ?? defaultVal ?? "linear")) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => onChange(key, select.value));
  return select;
}

// ---------------------------------------------------------------------------
// Entity reference
// ---------------------------------------------------------------------------

function buildEntityRefControl(
  key: string, value: unknown, onChange: OnInputChange,
  allowSignalRef?: boolean, placeholder?: string, defaultVal?: string,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "isf-ref-wrap";

  const strVal = typeof value === "string" ? value : (defaultVal ?? "");
  const isSignalRef = strVal.startsWith("signal.");

  // Combo: text input + datalist for suggestions
  const input = document.createElement("input");
  input.type = "text";
  input.className = "isf-text isf-ref-input";
  input.value = strVal;
  if (placeholder) input.placeholder = placeholder;

  // Generate datalist with scene entities
  const listId = `dl-${key}-${crypto.randomUUID().slice(0, 8)}`;
  const datalist = document.createElement("datalist");
  datalist.id = listId;
  input.setAttribute("list", listId);

  // Populate with scene entities (deduplicate shared semanticIds)
  const scene = getSceneState();
  const seenIds = new Set<string>();
  for (const entity of scene.entities) {
    const refId = entity.semanticId ?? entity.id;
    if (seenIds.has(refId)) continue;
    seenIds.add(refId);
    const opt = document.createElement("option");
    opt.value = refId;
    opt.textContent = refId;
    datalist.appendChild(opt);
  }

  // Add signal.* options if allowed
  if (allowSignalRef) {
    for (const ref of ["signal.from", "signal.to", "signal.agentId"]) {
      const opt = document.createElement("option");
      opt.value = ref;
      datalist.appendChild(opt);
    }
  }

  input.addEventListener("change", () => onChange(key, input.value));

  // Signal ref indicator
  if (isSignalRef) {
    input.classList.add("isf-ref-input--signal");
  }
  input.addEventListener("input", () => {
    input.classList.toggle("isf-ref-input--signal", input.value.startsWith("signal."));
  });

  wrap.appendChild(input);
  wrap.appendChild(datalist);
  return wrap;
}

// ---------------------------------------------------------------------------
// Position reference
// ---------------------------------------------------------------------------

function buildPositionRefControl(
  key: string, value: unknown, onChange: OnInputChange,
  allowSignalRef?: boolean, placeholder?: string, defaultVal?: string,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "isf-ref-wrap";

  const strVal = typeof value === "string" ? value : (defaultVal ?? "");

  const input = document.createElement("input");
  input.type = "text";
  input.className = "isf-text isf-ref-input";
  input.value = strVal;
  if (placeholder) input.placeholder = placeholder;

  const listId = `dl-${key}-${crypto.randomUUID().slice(0, 8)}`;
  const datalist = document.createElement("datalist");
  datalist.id = listId;
  input.setAttribute("list", listId);

  // Populate with scene positions
  const scene = getSceneState();
  for (const pos of scene.positions) {
    const opt = document.createElement("option");
    opt.value = pos.name;
    opt.textContent = pos.name;
    datalist.appendChild(opt);
  }

  // Add signal.* options if allowed
  if (allowSignalRef) {
    for (const ref of ["signal.from", "signal.to"]) {
      const opt = document.createElement("option");
      opt.value = ref;
      datalist.appendChild(opt);
    }
  }

  input.addEventListener("change", () => onChange(key, input.value));

  const isSignalRef = strVal.startsWith("signal.");
  if (isSignalRef) {
    input.classList.add("isf-ref-input--signal");
  }
  input.addEventListener("input", () => {
    input.classList.toggle("isf-ref-input--signal", input.value.startsWith("signal."));
  });

  wrap.appendChild(input);
  wrap.appendChild(datalist);
  return wrap;
}

// ---------------------------------------------------------------------------
// Route reference
// ---------------------------------------------------------------------------

function buildRouteRefControl(
  key: string, value: unknown, onChange: OnInputChange,
  placeholder?: string, defaultVal?: string,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "isf-ref-wrap";

  const strVal = typeof value === "string" ? value : (defaultVal ?? "");

  const input = document.createElement("input");
  input.type = "text";
  input.className = "isf-text isf-ref-input";
  input.value = strVal;
  if (placeholder) input.placeholder = placeholder;

  const listId = `dl-${key}-${crypto.randomUUID().slice(0, 8)}`;
  const datalist = document.createElement("datalist");
  datalist.id = listId;
  input.setAttribute("list", listId);

  // Populate with scene routes
  const scene = getSceneState();
  for (const route of scene.routes) {
    const opt = document.createElement("option");
    opt.value = route.name;
    opt.textContent = route.name;
    datalist.appendChild(opt);
  }

  input.addEventListener("change", () => onChange(key, input.value));

  wrap.appendChild(input);
  wrap.appendChild(datalist);
  return wrap;
}

// ---------------------------------------------------------------------------
// Waypoint reference
// ---------------------------------------------------------------------------

function buildWaypointRefControl(
  key: string, value: unknown, onChange: OnInputChange,
  placeholder?: string, defaultVal?: string,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "isf-ref-wrap";

  const strVal = typeof value === "string" ? value : (defaultVal ?? "");

  const input = document.createElement("input");
  input.type = "text";
  input.className = "isf-text isf-ref-input";
  input.value = strVal;
  if (placeholder) input.placeholder = placeholder;

  const listId = `dl-${key}-${crypto.randomUUID().slice(0, 8)}`;
  const datalist = document.createElement("datalist");
  datalist.id = listId;
  input.setAttribute("list", listId);

  // Populate with named waypoints from all routes
  const scene = getSceneState();
  const seen = new Set<string>();
  for (const route of scene.routes) {
    for (const rp of route.points) {
      if (rp.name && !seen.has(rp.name)) {
        seen.add(rp.name);
        const opt = document.createElement("option");
        opt.value = rp.name;
        opt.textContent = `${rp.name} (${route.name})`;
        datalist.appendChild(opt);
      }
    }
  }

  input.addEventListener("change", () => onChange(key, input.value));

  wrap.appendChild(input);
  wrap.appendChild(datalist);
  return wrap;
}

// ---------------------------------------------------------------------------
// Angle
// ---------------------------------------------------------------------------

function buildAngleControl(
  key: string, value: unknown, onChange: OnInputChange,
  defaultVal?: number,
): HTMLElement {
  return buildFloatControl(key, value, onChange, 0, 360, 1, defaultVal ?? 0);
}

// ---------------------------------------------------------------------------
// JSON (fallback)
// ---------------------------------------------------------------------------

function buildJsonControl(
  key: string, value: unknown, onChange: OnInputChange,
): HTMLElement {
  const textarea = document.createElement("textarea");
  textarea.className = "isf-json";
  textarea.rows = 3;
  textarea.value = value !== undefined ? JSON.stringify(value, null, 2) : "";
  textarea.addEventListener("change", () => {
    try {
      onChange(key, JSON.parse(textarea.value));
      textarea.classList.remove("isf-json--error");
    } catch {
      textarea.classList.add("isf-json--error");
    }
  });
  return textarea;
}
