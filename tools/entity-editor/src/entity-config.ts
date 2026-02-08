/**
 * Entity config module.
 *
 * Center panel top section: entity name, display dimensions (sliders),
 * fallback color picker, and state tab management (add/remove/select states).
 */

import {
  getState,
  updateState,
  subscribe,
  getSelectedEntity,
  createDefaultState,
} from "./app-state.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const noSelection = document.getElementById("no-selection")!;
const entityConfig = document.getElementById("entity-config")!;
const entityNameInput = document.getElementById("entity-name") as HTMLInputElement;
const btnDeleteEntity = document.getElementById("btn-delete-entity")!;
const inputWidth = document.getElementById("input-width") as HTMLInputElement;
const inputHeight = document.getElementById("input-height") as HTMLInputElement;
const valWidth = document.getElementById("val-width")!;
const valHeight = document.getElementById("val-height")!;
const inputColor = document.getElementById("input-color") as HTMLInputElement;
const stateTabs = document.getElementById("state-tabs")!;
const btnAddState = document.getElementById("btn-add-state")!;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Prevent re-entrant updates during programmatic input changes. */
let rendering = false;

/** Re-render the entity config panel. */
function render(): void {
  rendering = true;
  const state = getState();
  const entity = getSelectedEntity();

  if (!entity || !state.selectedEntityId) {
    entityConfig.hidden = true;
    noSelection.hidden = false;
    rendering = false;
    return;
  }

  entityConfig.hidden = false;
  noSelection.hidden = true;

  entityNameInput.value = state.selectedEntityId;
  inputWidth.value = String(entity.displayWidth);
  valWidth.textContent = String(entity.displayWidth);
  inputHeight.value = String(entity.displayHeight);
  valHeight.textContent = String(entity.displayHeight);
  inputColor.value = entity.fallbackColor;

  // Render state tabs
  stateTabs.innerHTML = "";
  const stateNames = Object.keys(entity.states);

  for (const name of stateNames) {
    const tab = document.createElement("div");
    tab.className = "state-tab";
    if (name === state.selectedStateName) {
      tab.classList.add("active");
    }

    const label = document.createElement("span");
    label.textContent = name;

    tab.appendChild(label);

    // Don't allow removing the "idle" state
    if (name !== "idle") {
      const remove = document.createElement("span");
      remove.className = "state-remove";
      remove.textContent = "\u00D7"; // multiplication sign
      remove.addEventListener("click", (e) => {
        e.stopPropagation();
        removeState(name);
      });
      tab.appendChild(remove);
    }

    tab.addEventListener("click", () => {
      updateState({ selectedStateName: name });
    });

    stateTabs.appendChild(tab);
  }

  rendering = false;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Rename the selected entity. */
function renameEntity(newId: string): void {
  const state = getState();
  const oldId = state.selectedEntityId;
  if (!oldId || oldId === newId) return;

  // Validate: no empty, no duplicate
  const trimmed = newId.trim().toLowerCase().replace(/\s+/g, "-");
  if (!trimmed || state.entities[trimmed]) return;

  const entries = { ...state.entities };
  entries[trimmed] = entries[oldId]!;
  delete entries[oldId];

  updateState({
    entities: entries,
    selectedEntityId: trimmed,
  });
}

/** Delete the selected entity. */
function deleteEntity(): void {
  const state = getState();
  const id = state.selectedEntityId;
  if (!id) return;

  const entries = { ...state.entities };
  delete entries[id];

  const remaining = Object.keys(entries);
  updateState({
    entities: entries,
    selectedEntityId: remaining.length > 0 ? remaining[0]! : null,
    selectedStateName: remaining.length > 0 ? Object.keys(entries[remaining[0]!]!.states)[0] ?? null : null,
  });
}

/** Add a new state to the selected entity. */
function addState(): void {
  const state = getState();
  const entity = getSelectedEntity();
  if (!entity || !state.selectedEntityId) return;

  const existing = Object.keys(entity.states);
  let idx = existing.length;
  let name = `state-${idx}`;
  while (existing.includes(name)) {
    idx++;
    name = `state-${idx}`;
  }

  // Prompt for name
  const input = prompt("State name:", name);
  if (!input) return;

  const stateName = input.trim().toLowerCase().replace(/\s+/g, "-");
  if (!stateName || entity.states[stateName]) return;

  entity.states[stateName] = createDefaultState();
  updateState({ selectedStateName: stateName });
}

/** Remove a state from the selected entity. */
function removeState(name: string): void {
  const state = getState();
  const entity = getSelectedEntity();
  if (!entity || !state.selectedEntityId) return;
  if (name === "idle") return; // Never remove idle

  delete entity.states[name];

  const remaining = Object.keys(entity.states);
  updateState({
    selectedStateName: remaining.length > 0 ? remaining[0]! : null,
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the entity config module. */
export function initEntityConfig(): void {
  // Entity name change (on blur to avoid mid-typing renames)
  entityNameInput.addEventListener("blur", () => {
    if (!rendering) renameEntity(entityNameInput.value);
  });
  entityNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      entityNameInput.blur();
    }
  });

  // Delete entity
  btnDeleteEntity.addEventListener("click", deleteEntity);

  // Width / Height sliders
  inputWidth.addEventListener("input", () => {
    if (rendering) return;
    const entity = getSelectedEntity();
    if (entity) {
      entity.displayWidth = Number(inputWidth.value);
      valWidth.textContent = inputWidth.value;
      // Notify for preview update
      updateState({});
    }
  });

  inputHeight.addEventListener("input", () => {
    if (rendering) return;
    const entity = getSelectedEntity();
    if (entity) {
      entity.displayHeight = Number(inputHeight.value);
      valHeight.textContent = inputHeight.value;
      updateState({});
    }
  });

  // Color picker
  inputColor.addEventListener("input", () => {
    if (rendering) return;
    const entity = getSelectedEntity();
    if (entity) {
      entity.fallbackColor = inputColor.value;
      updateState({});
    }
  });

  // Add state
  btnAddState.addEventListener("click", addState);

  subscribe(render);
  render();
}
