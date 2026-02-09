/**
 * Inspector panel.
 *
 * Editable property form for the selected PlacedEntity instance(s).
 * Supports single-selection editing. All mutations go through the
 * undo system via executeCommand().
 * Fills the "inspector" floating panel shell.
 */

import {
  getEditorState,
  subscribeEditor,
} from "../state/editor-state.js";
import {
  getSceneState,
  updateSceneState,
  subscribeScene,
} from "../state/scene-state.js";
import {
  getEntityStore,
  subscribeEntities,
} from "../state/entity-store.js";
import { executeCommand } from "../state/undo.js";
import type { PlacedEntity, UndoableCommand } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the first selected PlacedEntity, or null. */
function getSelectedPlaced(): PlacedEntity | null {
  const { selectedIds } = getEditorState();
  if (selectedIds.length === 0) return null;
  const { entities } = getSceneState();
  return entities.find((e) => e.id === selectedIds[0]) ?? null;
}

/** Create an undoable command that updates a placed entity's properties. */
function createUpdateCommand(
  entityId: string,
  updates: Partial<PlacedEntity>,
  description: string,
): UndoableCommand {
  const oldEntities = getSceneState().entities;
  const oldEntity = oldEntities.find((e) => e.id === entityId);
  if (!oldEntity) {
    return { execute() { /* noop */ }, undo() { /* noop */ }, description };
  }

  const snapshot = { ...oldEntity };
  return {
    execute() {
      const { entities } = getSceneState();
      updateSceneState({
        entities: entities.map((e) =>
          e.id === entityId ? { ...e, ...updates } : e,
        ),
      });
    },
    undo() {
      const { entities } = getSceneState();
      updateSceneState({
        entities: entities.map((e) =>
          e.id === entityId ? snapshot : e,
        ),
      });
    },
    description,
  };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the Inspector panel content. */
export function initInspectorPanel(contentEl: HTMLElement): void {
  contentEl.innerHTML = "";
  contentEl.classList.add("ip-panel");

  function render(): void {
    contentEl.innerHTML = "";

    const placed = getSelectedPlaced();
    if (!placed) {
      contentEl.innerHTML = '<p class="ip-empty">Select an entity on the canvas.</p>';
      return;
    }

    const entityStore = getEntityStore();
    const def = entityStore.entities[placed.entityId];

    const form = document.createElement("div");
    form.className = "ip-form";

    // Instance ID (readonly)
    form.appendChild(createRow("Instance", createReadonly(placed.id)));

    // Entity type (readonly)
    form.appendChild(createRow("Entity", createReadonly(placed.entityId)));

    // Position (X/Y fields)
    const posRow = document.createElement("div");
    posRow.className = "ip-inline";
    posRow.appendChild(createNumInput("X", placed.x, (v) =>
      executeCommand(createUpdateCommand(placed.id, { x: v }, `Move ${placed.id} X`))));
    posRow.appendChild(createNumInput("Y", placed.y, (v) =>
      executeCommand(createUpdateCommand(placed.id, { y: v }, `Move ${placed.id} Y`))));
    form.appendChild(createRow("Position", posRow));

    // Alignment buttons (like macOS Align dialog)
    // Computes bounding box from entity dimensions + anchor + scale
    const { dimensions } = getSceneState();
    const ew = (def?.displayWidth ?? 32) * placed.scale;
    const eh = (def?.displayHeight ?? 32) * placed.scale;
    const ax = def?.defaults.anchor?.[0] ?? 0.5;
    const ay = def?.defaults.anchor?.[1] ?? 0.5;

    const alignContainer = document.createElement("div");
    alignContainer.className = "ip-align-container";

    // Vertical alignment (X axis): left, center, right
    const vRow = document.createElement("div");
    vRow.className = "ip-align-row";

    const vLabel = document.createElement("span");
    vLabel.className = "ip-align-label";
    vLabel.textContent = "H";
    vRow.appendChild(vLabel);

    const alignsH: Array<{ icon: string; title: string; computeX: () => number }> = [
      { icon: "\u258C", title: "Align left", computeX: () => ew * ax },
      { icon: "\u2503", title: "Align center", computeX: () => dimensions.width / 2 },
      { icon: "\u2590", title: "Align right", computeX: () => dimensions.width - ew * (1 - ax) },
    ];

    for (const a of alignsH) {
      const btn = document.createElement("button");
      btn.className = "ip-align-btn";
      btn.textContent = a.icon;
      btn.title = a.title;
      btn.addEventListener("click", () => {
        const newX = a.computeX();
        executeCommand(createUpdateCommand(placed.id, { x: newX }, a.title));
      });
      vRow.appendChild(btn);
    }
    alignContainer.appendChild(vRow);

    // Horizontal alignment (Y axis): top, center, bottom
    const hRow = document.createElement("div");
    hRow.className = "ip-align-row";

    const hLabel = document.createElement("span");
    hLabel.className = "ip-align-label";
    hLabel.textContent = "V";
    hRow.appendChild(hLabel);

    const alignsV: Array<{ icon: string; title: string; computeY: () => number }> = [
      { icon: "\u2580", title: "Align top", computeY: () => eh * ay },
      { icon: "\u2501", title: "Align middle", computeY: () => dimensions.height / 2 },
      { icon: "\u2584", title: "Align bottom", computeY: () => dimensions.height - eh * (1 - ay) },
    ];

    for (const a of alignsV) {
      const btn = document.createElement("button");
      btn.className = "ip-align-btn";
      btn.textContent = a.icon;
      btn.title = a.title;
      btn.addEventListener("click", () => {
        const newY = a.computeY();
        executeCommand(createUpdateCommand(placed.id, { y: newY }, a.title));
      });
      hRow.appendChild(btn);
    }
    alignContainer.appendChild(hRow);

    form.appendChild(createRow("Align", alignContainer));

    // Scale
    form.appendChild(createRow("Scale", createNumInputEl(placed.scale, (v) =>
      executeCommand(createUpdateCommand(placed.id, { scale: v }, `Scale ${placed.id}`)), 0.1)));

    // Rotation
    form.appendChild(createRow("Rotation", createNumInputEl(placed.rotation, (v) =>
      executeCommand(createUpdateCommand(placed.id, { rotation: v }, `Rotate ${placed.id}`)))));

    // Layer (dynamic from SceneState.layers)
    const layerSelect = document.createElement("select");
    layerSelect.className = "ip-select";
    const { layers: sceneLayers } = getSceneState();
    const sortedLayers = [...sceneLayers].sort((a, b) => a.order - b.order);
    for (const l of sortedLayers) {
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = l.name;
      if (l.id === placed.layerId) opt.selected = true;
      layerSelect.appendChild(opt);
    }
    layerSelect.addEventListener("change", () =>
      executeCommand(createUpdateCommand(placed.id, { layerId: layerSelect.value }, `Layer ${placed.id}`)));
    form.appendChild(createRow("Layer", layerSelect));

    // Opacity
    const opacitySlider = document.createElement("input");
    opacitySlider.type = "range";
    opacitySlider.className = "ip-slider";
    opacitySlider.min = "0";
    opacitySlider.max = "1";
    opacitySlider.step = "0.05";
    opacitySlider.value = String(placed.opacity);
    const opacityLabel = document.createElement("span");
    opacityLabel.className = "ip-slider-value";
    opacityLabel.textContent = String(Math.round(placed.opacity * 100)) + "%";
    opacitySlider.addEventListener("input", () => {
      opacityLabel.textContent = String(Math.round(Number(opacitySlider.value) * 100)) + "%";
    });
    opacitySlider.addEventListener("change", () =>
      executeCommand(createUpdateCommand(placed.id, { opacity: Number(opacitySlider.value) }, `Opacity ${placed.id}`)));
    const opacityRow = document.createElement("div");
    opacityRow.className = "ip-inline";
    opacityRow.appendChild(opacitySlider);
    opacityRow.appendChild(opacityLabel);
    form.appendChild(createRow("Opacity", opacityRow));

    // Flip
    const flipRow = document.createElement("div");
    flipRow.className = "ip-inline";
    flipRow.appendChild(createCheckbox("H", placed.flipH, (v) =>
      executeCommand(createUpdateCommand(placed.id, { flipH: v }, `Flip H ${placed.id}`))));
    flipRow.appendChild(createCheckbox("V", placed.flipV, (v) =>
      executeCommand(createUpdateCommand(placed.id, { flipV: v }, `Flip V ${placed.id}`))));
    form.appendChild(createRow("Flip", flipRow));

    // Active state (dropdown from entity's visual states)
    if (def && def.visual.type === "spritesheet") {
      const stateSelect = document.createElement("select");
      stateSelect.className = "ip-select";
      for (const name of Object.keys(def.visual.animations)) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        if (name === placed.activeState) opt.selected = true;
        stateSelect.appendChild(opt);
      }
      stateSelect.addEventListener("change", () =>
        executeCommand(createUpdateCommand(placed.id, { activeState: stateSelect.value }, `State ${placed.id}`)));
      form.appendChild(createRow("State", stateSelect));
    }

    // Locked / Visible
    const flagsRow = document.createElement("div");
    flagsRow.className = "ip-inline";
    flagsRow.appendChild(createCheckbox("Locked", placed.locked, (v) =>
      executeCommand(createUpdateCommand(placed.id, { locked: v }, `Lock ${placed.id}`))));
    flagsRow.appendChild(createCheckbox("Visible", placed.visible, (v) =>
      executeCommand(createUpdateCommand(placed.id, { visible: v }, `Visible ${placed.id}`))));
    form.appendChild(createRow("Flags", flagsRow));

    contentEl.appendChild(form);
  }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------

  function createRow(label: string, control: HTMLElement): HTMLElement {
    const row = document.createElement("div");
    row.className = "ip-row";
    const lbl = document.createElement("label");
    lbl.className = "ip-label";
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(control);
    return row;
  }

  function createReadonly(value: string): HTMLElement {
    const span = document.createElement("span");
    span.className = "ip-readonly";
    span.textContent = value;
    return span;
  }

  function createNumInput(label: string, value: number, onChange: (v: number) => void): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "ip-num-field";
    const lbl = document.createElement("span");
    lbl.className = "ip-num-label";
    lbl.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.className = "ip-input";
    input.value = String(Math.round(value));
    input.addEventListener("change", () => onChange(Number(input.value)));
    wrapper.appendChild(lbl);
    wrapper.appendChild(input);
    return wrapper;
  }

  function createNumInputEl(value: number, onChange: (v: number) => void, step = 1): HTMLElement {
    const input = document.createElement("input");
    input.type = "number";
    input.className = "ip-input";
    input.value = String(value);
    input.step = String(step);
    input.addEventListener("change", () => onChange(Number(input.value)));
    return input;
  }

  function createCheckbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
    const wrapper = document.createElement("label");
    wrapper.className = "ip-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    wrapper.appendChild(input);
    wrapper.append(` ${label}`);
    return wrapper;
  }

  // ---------------------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------------------

  subscribeEditor(render);
  subscribeScene(render);
  subscribeEntities(render);
  render();
}
