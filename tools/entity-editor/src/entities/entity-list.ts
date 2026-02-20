/**
 * Entity list module.
 *
 * Left panel showing the list of entities. Supports adding, selecting,
 * and deleting entities. Selecting an entity updates the center panel.
 */

import {
  getState,
  updateState,
  subscribe,
  createDefaultEntity,
} from "../app-state.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const entityListEl = document.getElementById("entity-list")!;
const btnAddEntity = document.getElementById("btn-add-entity")!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique entity ID. */
function generateEntityId(): string {
  const existing = Object.keys(getState().entities);
  let idx = existing.length + 1;
  let id = `entity-${idx}`;
  while (existing.includes(id)) {
    idx++;
    id = `entity-${idx}`;
  }
  return id;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Re-render the entity list. */
function render(): void {
  const { entities, selectedEntityId } = getState();
  entityListEl.innerHTML = "";

  const ids = Object.keys(entities);

  for (const id of ids) {
    const entry = entities[id]!;
    const li = document.createElement("li");
    if (id === selectedEntityId) {
      li.classList.add("active");
    }

    // Color dot
    const dot = document.createElement("span");
    dot.className = "entity-color-dot";
    dot.style.backgroundColor = entry.fallbackColor;

    // Name
    const name = document.createElement("span");
    name.textContent = id;

    // State count badge
    const count = document.createElement("span");
    count.className = "entity-state-count";
    const stateCount = Object.keys(entry.states).length;
    count.textContent = `${stateCount} state${stateCount !== 1 ? "s" : ""}`;

    li.appendChild(dot);
    li.appendChild(name);
    li.appendChild(count);

    li.addEventListener("click", () => {
      const stateNames = Object.keys(entry.states);
      updateState({
        selectedEntityId: id,
        selectedStateName: stateNames.length > 0 ? stateNames[0]! : null,
      });
    });

    entityListEl.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the entity list module. */
export function initEntityList(): void {
  btnAddEntity.addEventListener("click", () => {
    const state = getState();
    const id = generateEntityId();
    const newEntities = { ...state.entities, [id]: createDefaultEntity() };
    updateState({
      entities: newEntities,
      selectedEntityId: id,
      selectedStateName: "idle",
    });
  });

  subscribe(render);
  render();
}
