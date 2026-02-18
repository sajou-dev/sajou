/**
 * Binding drop menu — radial / OPie-style.
 *
 * Contextual pie menu that appears when the user drops a choreographer output
 * wire onto an entity in the scene (cross-rideau drag). Bindable properties
 * are arranged in a ring around the drop point. Click one to create a binding.
 *
 * Behaviour:
 *   - Items fan out radially from the drop point.
 *   - Hover highlights the slice.
 *   - Click creates the binding and closes the menu.
 *   - Click outside or Escape closes without creating.
 */

import { addBinding } from "../state/binding-store.js";
import type { BindingValueType, BindingTransition, ChoreographyEasing } from "../types.js";
import { MIDI_SOURCE_FIELDS, suggestMapping } from "../midi/midi-presets.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let menuEl: HTMLElement | null = null;
let cleanupFn: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Property definitions
// ---------------------------------------------------------------------------

interface RadialItem {
  /** Property key for the binding. */
  key: string;
  /** Short display label. */
  label: string;
  /** Icon character (emoji or symbol). */
  icon: string;
  /** Inferred source type when this property is selected. */
  sourceType: BindingValueType;
  /** Optional action payload (for animation states). */
  action?: { animationDuring: string };
}

/** Build the list of radial items based on entity capabilities. */
function buildItems(
  hasTopology: boolean,
  animationStates: string[],
): RadialItem[] {
  const items: RadialItem[] = [];

  // Topological actions first (most common intent for game entities)
  if (hasTopology) {
    items.push({ key: "moveTo:waypoint", label: "Move To", icon: "\u279C", sourceType: "event" });
    items.push({ key: "followRoute", label: "Follow Route", icon: "\u21BB", sourceType: "event" });
    items.push({ key: "teleportTo", label: "Teleport", icon: "\u26A1", sourceType: "event" });
  }

  // Animation states (spritesheet)
  for (const state of animationStates) {
    items.push({
      key: "animation.state",
      label: state,
      icon: "\u25B6",
      sourceType: "event",
      action: { animationDuring: state },
    });
  }

  // Core spatial/visual properties
  items.push({ key: "position.x", label: "Pos X", icon: "\u2194", sourceType: "float" });
  items.push({ key: "position.y", label: "Pos Y", icon: "\u2195", sourceType: "float" });
  items.push({ key: "rotation", label: "Rotation", icon: "\u21BB", sourceType: "float" });
  items.push({ key: "scale", label: "Scale", icon: "\u2922", sourceType: "float" });
  items.push({ key: "opacity", label: "Opacity", icon: "\u25D1", sourceType: "float" });
  items.push({ key: "visible", label: "Visible", icon: "\u25C9", sourceType: "bool" });

  return items;
}

// ---------------------------------------------------------------------------
// Transition defaults per float property
// ---------------------------------------------------------------------------

/** Properties that support temporal transitions (float-type bindings). */
const FLOAT_PROPERTIES = new Set(["scale", "opacity", "rotation", "position.x", "position.y"]);

/** Property reference info for the config popup (range, unit, step). */
const PROPERTY_HINTS: Record<string, { hint: string; min?: string; max?: string; step: string }> = {
  scale: { hint: "0.1 – 10  (1 = original size)", min: "0.01", max: "20", step: "0.1" },
  opacity: { hint: "0 – 1  (0 = transparent, 1 = opaque)", min: "0", max: "1", step: "0.05" },
  rotation: { hint: "0 – 360  (degrees)", step: "5" },
  "position.x": { hint: "pixels  (relative to current)", step: "1" },
  "position.y": { hint: "pixels  (relative to current)", step: "1" },
};

/** Default transition values per float property. */
const TRANSITION_DEFAULTS: Record<string, BindingTransition> = {
  scale: { targetValue: 1.5, durationMs: 300, easing: "easeOut", revert: false, revertDelayMs: 0 },
  opacity: { targetValue: 0.0, durationMs: 300, easing: "easeOut", revert: false, revertDelayMs: 0 },
  rotation: { targetValue: 180, durationMs: 500, easing: "easeInOut", revert: false, revertDelayMs: 0 },
  "position.x": { targetValue: 50, durationMs: 400, easing: "easeOut", revert: false, revertDelayMs: 0 },
  "position.y": { targetValue: 50, durationMs: 400, easing: "easeOut", revert: false, revertDelayMs: 0 },
};

// ---------------------------------------------------------------------------
// Geometry constants
// ---------------------------------------------------------------------------

/** Radius of the item ring from center (px). */
const RING_RADIUS = 100;

/** Size of each item button (px). */
const ITEM_SIZE = 56;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BindingDropMenuOptions {
  /** Client X of the drop point. */
  x: number;
  /** Client Y of the drop point. */
  y: number;
  /** Source choreography ID. */
  choreographyId: string;
  /** Target entity semantic ID. */
  targetSemanticId: string;
  /** Whether the entity has topology (waypoints/routes). */
  hasTopology: boolean;
  /** Animation state names if entity is a spritesheet (empty for static). */
  animationStates: string[];
  /** Signal type that triggers this choreography (for MIDI field selector). */
  triggerSignalType?: string;
}

/** Show the radial binding menu at the drop point. */
export function showBindingDropMenu(options: BindingDropMenuOptions): void {
  hideBindingDropMenu();

  const { triggerSignalType } = options;
  const midiFields = triggerSignalType ? MIDI_SOURCE_FIELDS[triggerSignalType] : undefined;

  if (midiFields && midiFields.length > 0) {
    // MIDI flow: show field selector first, then radial on selection
    showMidiFieldSelector(options, midiFields);
  } else {
    // Standard flow: show radial directly
    showRadialMenu(options);
  }
}

/** Show the MIDI source field selector before the radial menu. */
function showMidiFieldSelector(
  options: BindingDropMenuOptions,
  fields: Array<{ field: string; label: string }>,
): void {
  const { x, y } = options;

  const overlay = document.createElement("div");
  overlay.className = "radial-overlay";

  const panel = document.createElement("div");
  panel.className = "midi-field-selector";
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;

  const title = document.createElement("div");
  title.className = "midi-field-selector-title";
  title.textContent = "Source field";
  panel.appendChild(title);

  const btnRow = document.createElement("div");
  btnRow.className = "midi-field-selector-row";

  for (const { field, label } of fields) {
    const btn = document.createElement("button");
    btn.className = "midi-field-btn";
    btn.textContent = label;
    btn.title = field;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Remove field selector, show radial with selected field
      hideBindingDropMenu();
      showRadialMenu(options, field);
    });

    btnRow.appendChild(btn);
  }

  panel.appendChild(btnRow);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  menuEl = overlay;

  // Animate in
  requestAnimationFrame(() => {
    panel.classList.add("midi-field-selector--open");
  });

  // Close on overlay click or Escape
  const onOverlayClick = (e: MouseEvent) => {
    if (e.target === overlay) hideBindingDropMenu();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") hideBindingDropMenu();
  };

  overlay.addEventListener("mousedown", onOverlayClick);
  document.addEventListener("keydown", onKeyDown);

  cleanupFn = () => {
    overlay.removeEventListener("mousedown", onOverlayClick);
    document.removeEventListener("keydown", onKeyDown);
  };
}

/** Show the radial property selector. */
function showRadialMenu(
  options: BindingDropMenuOptions,
  selectedSourceField?: string,
): void {
  hideBindingDropMenu();

  const {
    x, y,
    choreographyId,
    targetSemanticId,
    hasTopology,
    animationStates,
    triggerSignalType,
  } = options;

  const items = buildItems(hasTopology, animationStates);
  if (items.length === 0) return;

  // Container — covers the full viewport to capture clicks outside
  const overlay = document.createElement("div");
  overlay.className = "radial-overlay";

  // Ring container — positioned at the drop point
  const ring = document.createElement("div");
  ring.className = "radial-ring";
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;

  // Center dot
  const center = document.createElement("div");
  center.className = "radial-center";
  ring.appendChild(center);

  // Place items around the ring
  const count = items.length;
  const startAngle = -Math.PI / 2; // 12 o'clock

  for (let i = 0; i < count; i++) {
    const item = items[i]!;
    const angle = startAngle + (2 * Math.PI * i) / count;
    const ix = Math.cos(angle) * RING_RADIUS;
    const iy = Math.sin(angle) * RING_RADIUS;

    const btn = document.createElement("button");
    btn.className = "radial-item";
    btn.style.left = `${ix - ITEM_SIZE / 2}px`;
    btn.style.top = `${iy - ITEM_SIZE / 2}px`;
    btn.title = item.label;

    const iconSpan = document.createElement("span");
    iconSpan.className = "radial-item-icon";
    iconSpan.textContent = item.icon;

    const labelSpan = document.createElement("span");
    labelSpan.className = "radial-item-label";
    labelSpan.textContent = item.label;

    btn.appendChild(iconSpan);
    btn.appendChild(labelSpan);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      // MIDI float → instant continuous binding (value-driven, no transition)
      if (FLOAT_PROPERTIES.has(item.key) && selectedSourceField) {
        const mapping = triggerSignalType
          ? suggestMapping(triggerSignalType, selectedSourceField, item.key)
          : undefined;

        addBinding({
          targetEntityId: targetSemanticId,
          property: item.key,
          sourceChoreographyId: choreographyId,
          sourceType: "float",
          sourceField: selectedSourceField,
          ...(mapping ? { mapping } : {}),
        });
        hideBindingDropMenu();
        return;
      }

      // Float properties without sourceField → show transition config popup (AI event-driven)
      if (FLOAT_PROPERTIES.has(item.key)) {
        hideBindingDropMenu();
        showTransitionConfigPopup({
          x, y,
          choreographyId,
          targetSemanticId,
          property: item.key,
          sourceType: item.sourceType,
          selectedSourceField,
          triggerSignalType,
        });
        return;
      }

      // Non-float properties → immediate binding (existing behavior)
      const mapping = (selectedSourceField && triggerSignalType)
        ? suggestMapping(triggerSignalType, selectedSourceField, item.key)
        : undefined;

      addBinding({
        targetEntityId: targetSemanticId,
        property: item.key,
        sourceChoreographyId: choreographyId,
        sourceType: item.sourceType,
        ...(item.action ? { action: item.action } : {}),
        ...(selectedSourceField ? { sourceField: selectedSourceField } : {}),
        ...(mapping ? { mapping } : {}),
      });
      hideBindingDropMenu();
    });

    ring.appendChild(btn);
  }

  overlay.appendChild(ring);
  document.body.appendChild(overlay);
  menuEl = overlay;

  // Animate in
  requestAnimationFrame(() => {
    ring.classList.add("radial-ring--open");
  });

  // Close on overlay click or Escape
  const onOverlayClick = (e: MouseEvent) => {
    if (e.target === overlay) {
      hideBindingDropMenu();
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      hideBindingDropMenu();
    }
  };

  overlay.addEventListener("mousedown", onOverlayClick);
  document.addEventListener("keydown", onKeyDown);

  cleanupFn = () => {
    overlay.removeEventListener("mousedown", onOverlayClick);
    document.removeEventListener("keydown", onKeyDown);
  };
}

// ---------------------------------------------------------------------------
// Transition config popup
// ---------------------------------------------------------------------------

interface TransitionConfigOptions {
  x: number;
  y: number;
  choreographyId: string;
  targetSemanticId: string;
  property: string;
  sourceType: BindingValueType;
  selectedSourceField?: string;
  triggerSignalType?: string;
}

/** Show a config popup for a float property transition. */
function showTransitionConfigPopup(options: TransitionConfigOptions): void {
  const {
    x, y, choreographyId, targetSemanticId, property, sourceType,
    selectedSourceField, triggerSignalType,
  } = options;

  const defaults = TRANSITION_DEFAULTS[property] ?? {
    targetValue: 1, durationMs: 300, easing: "easeOut" as ChoreographyEasing, revert: false, revertDelayMs: 0,
  };

  const overlay = document.createElement("div");
  overlay.className = "radial-overlay";

  const panel = document.createElement("div");
  panel.className = "binding-transition-config";
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;

  // Title
  const title = document.createElement("div");
  title.className = "binding-transition-config-title";
  title.textContent = property;
  panel.appendChild(title);

  // Target value
  const propHint = PROPERTY_HINTS[property];
  const targetRow = createRow("Target");
  const targetInput = document.createElement("input");
  targetInput.type = "number";
  targetInput.className = "binding-transition-config-input";
  targetInput.value = String(defaults.targetValue);
  targetInput.step = propHint?.step ?? "0.1";
  if (propHint?.min !== undefined) targetInput.min = propHint.min;
  if (propHint?.max !== undefined) targetInput.max = propHint.max;
  targetRow.appendChild(targetInput);
  panel.appendChild(targetRow);

  // Range hint
  if (propHint) {
    const hint = document.createElement("div");
    hint.className = "binding-transition-config-hint";
    hint.textContent = propHint.hint;
    panel.appendChild(hint);
  }

  // Duration
  const durationRow = createRow("Duration");
  const durationInput = document.createElement("input");
  durationInput.type = "number";
  durationInput.className = "binding-transition-config-input";
  durationInput.value = String(defaults.durationMs);
  durationInput.min = "16";
  durationInput.step = "50";
  const msLabel = document.createElement("span");
  msLabel.className = "binding-transition-config-label";
  msLabel.style.minWidth = "auto";
  msLabel.textContent = "ms";
  durationRow.appendChild(durationInput);
  durationRow.appendChild(msLabel);
  panel.appendChild(durationRow);

  // Easing
  const easingRow = createRow("Easing");
  const easingSelect = document.createElement("select");
  easingSelect.className = "binding-transition-config-select";
  for (const name of ["linear", "easeIn", "easeOut", "easeInOut"] as const) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === defaults.easing) opt.selected = true;
    easingSelect.appendChild(opt);
  }
  easingRow.appendChild(easingSelect);
  panel.appendChild(easingRow);

  // Revert toggle
  const revertRow = document.createElement("div");
  revertRow.className = "binding-transition-config-checkbox";
  const revertCheckbox = document.createElement("input");
  revertCheckbox.type = "checkbox";
  revertCheckbox.id = "btc-revert";
  revertCheckbox.checked = defaults.revert;
  const revertLabel = document.createElement("label");
  revertLabel.htmlFor = "btc-revert";
  revertLabel.textContent = "Revert after";
  revertRow.appendChild(revertCheckbox);
  revertRow.appendChild(revertLabel);
  panel.appendChild(revertRow);

  // Revert delay (hidden unless checked)
  const revertDelayRow = createRow("Delay");
  revertDelayRow.style.display = defaults.revert ? "flex" : "none";
  const revertDelayInput = document.createElement("input");
  revertDelayInput.type = "number";
  revertDelayInput.className = "binding-transition-config-input";
  revertDelayInput.value = String(defaults.revertDelayMs);
  revertDelayInput.min = "0";
  revertDelayInput.step = "50";
  const msLabel2 = document.createElement("span");
  msLabel2.className = "binding-transition-config-label";
  msLabel2.style.minWidth = "auto";
  msLabel2.textContent = "ms";
  revertDelayRow.appendChild(revertDelayInput);
  revertDelayRow.appendChild(msLabel2);
  panel.appendChild(revertDelayRow);

  revertCheckbox.addEventListener("change", () => {
    revertDelayRow.style.display = revertCheckbox.checked ? "flex" : "none";
  });

  // Apply button
  const applyBtn = document.createElement("button");
  applyBtn.className = "binding-transition-config-apply";
  applyBtn.textContent = "Apply";
  applyBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    const transition: BindingTransition = {
      targetValue: parseFloat(targetInput.value) || defaults.targetValue,
      durationMs: Math.max(16, parseInt(durationInput.value, 10) || defaults.durationMs),
      easing: easingSelect.value as ChoreographyEasing,
      revert: revertCheckbox.checked,
      revertDelayMs: revertCheckbox.checked
        ? Math.max(0, parseInt(revertDelayInput.value, 10) || 0)
        : 0,
    };

    const mapping = (selectedSourceField && triggerSignalType)
      ? suggestMapping(triggerSignalType, selectedSourceField, property)
      : undefined;

    addBinding({
      targetEntityId: targetSemanticId,
      property,
      sourceChoreographyId: choreographyId,
      sourceType: sourceType === "float" ? "event" : sourceType,
      ...(selectedSourceField ? { sourceField: selectedSourceField } : {}),
      ...(mapping ? { mapping } : {}),
      transition,
    });

    hideBindingDropMenu();
  });
  panel.appendChild(applyBtn);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  menuEl = overlay;

  // Focus target input
  requestAnimationFrame(() => targetInput.focus());

  // Close on overlay click or Escape
  const onOverlayClick = (e: MouseEvent) => {
    if (e.target === overlay) hideBindingDropMenu();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") hideBindingDropMenu();
  };

  overlay.addEventListener("mousedown", onOverlayClick);
  document.addEventListener("keydown", onKeyDown);

  cleanupFn = () => {
    overlay.removeEventListener("mousedown", onOverlayClick);
    document.removeEventListener("keydown", onKeyDown);
  };
}

/** Helper: create a labeled row for the transition config popup. */
function createRow(labelText: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "binding-transition-config-row";
  const label = document.createElement("span");
  label.className = "binding-transition-config-label";
  label.textContent = labelText;
  row.appendChild(label);
  return row;
}

/** Hide and remove the radial binding menu. */
export function hideBindingDropMenu(): void {
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
}
