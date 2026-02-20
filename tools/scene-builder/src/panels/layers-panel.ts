/**
 * Layers panel.
 *
 * Photoshop/Tiled-style layer manager for generic scene layers.
 * Each layer is a Z-group: a named, ordered, hideable, lockable container.
 * Content (entities, background images, routes...) is placed on layers
 * via the active layer selection.
 *
 * Entities within each layer are listed and ordered by per-instance zIndex.
 * All changes go through the undo system.
 */

import {
  getSceneState,
  subscribeScene,
  updateSceneState,
} from "../state/scene-state.js";
import {
  getEditorState,
  setActiveLayer,
  setSelection,
  subscribeEditor,
} from "../state/editor-state.js";
import { getEntityStore } from "../state/entity-store.js";
import { executeCommand } from "../state/undo.js";
import type { PlacedEntity, SceneLayer, UndoableCommand } from "../types.js";

// ---------------------------------------------------------------------------
// Lucide SVG helpers
// ---------------------------------------------------------------------------

/** Create an SVG element from inner path markup (Lucide 24x24 viewBox). */
function lucide(inner: string, size = 14): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

const ICON_EYE = lucide(
  '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>' +
  '<circle cx="12" cy="12" r="3"/>',
);

const ICON_EYE_OFF = lucide(
  '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>' +
  '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>' +
  '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>' +
  '<path d="m2 2 20 20"/>',
);

const ICON_LOCK = lucide(
  '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>' +
  '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
);

const ICON_UNLOCK = lucide(
  '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>' +
  '<path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
);

const ICON_PLUS = lucide(
  '<path d="M5 12h14"/><path d="M12 5v14"/>',
);

const ICON_TRASH = lucide(
  '<path d="M3 6h18"/>' +
  '<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>' +
  '<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
);

const ICON_ARROW_UP = lucide(
  '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
);

const ICON_ARROW_DOWN = lucide(
  '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
);

const ICON_CHEVRON_UP = lucide(
  '<path d="m18 15-6-6-6 6"/>',
  12,
);

const ICON_CHEVRON_DOWN = lucide(
  '<path d="m6 9 6 6 6-6"/>',
  12,
);

/** Custom MIME type for entity layer drag-and-drop within the layers panel. */
const MIME_ENTITY_MOVE = "application/x-sajou-entity-move";

// ---------------------------------------------------------------------------
// Undo helpers
// ---------------------------------------------------------------------------

/** Execute an undoable layers change. */
function changeLayers(next: SceneLayer[], description: string): void {
  const prev = getSceneState().layers.map((l) => ({ ...l }));
  const cmd: UndoableCommand = {
    execute() {
      updateSceneState({ layers: next });
    },
    undo() {
      updateSceneState({ layers: prev });
    },
    description,
  };
  executeCommand(cmd);
}

/** Generate a unique layer ID. */
function generateLayerId(): string {
  return `layer-${Date.now().toString(36)}`;
}

/** Swap order of a layer with its neighbor. direction: +1=move up, -1=move down. */
function swapOrder(layerId: string, direction: number): void {
  const { layers } = getSceneState();
  const sorted = [...layers].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((l) => l.id === layerId);
  if (idx < 0) return;
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;

  const a = sorted[idx]!;
  const b = sorted[swapIdx]!;
  const newLayers = layers.map((l) => {
    if (l.id === a.id) return { ...l, order: b.order };
    if (l.id === b.id) return { ...l, order: a.order };
    return { ...l };
  });
  changeLayers(newLayers, "Reorder layers");
}

/** Swap zIndex of a placed entity with its neighbor within the same layer. */
function swapEntityZIndex(placedId: string, direction: number): void {
  const { entities } = getSceneState();
  const target = entities.find((e) => e.id === placedId);
  if (!target) return;

  const siblings = entities
    .filter((e) => e.layerId === target.layerId)
    .sort((a, b) => a.zIndex - b.zIndex);

  const idx = siblings.findIndex((e) => e.id === placedId);
  const swapIdx = idx + direction;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;

  const other = siblings[swapIdx]!;
  const oldEntities = entities.map((e) => ({ ...e }));
  const newEntities = entities.map((e) => {
    if (e.id === target.id) return { ...e, zIndex: other.zIndex };
    if (e.id === other.id) return { ...e, zIndex: target.zIndex };
    return e;
  });

  const cmd: UndoableCommand = {
    execute() {
      updateSceneState({ entities: newEntities });
    },
    undo() {
      updateSceneState({ entities: oldEntities });
    },
    description: "Reorder entity",
  };
  executeCommand(cmd);
}

/** Create an undoable command that updates a placed entity's properties. */
function createEntityUpdateCommand(
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
// Panel render
// ---------------------------------------------------------------------------

let panelEl: HTMLElement | null = null;
/** Currently expanded layer ID (for rename/delete detail). */
let expandedLayerId: string | null = null;

/** Render the full Layers panel contents. */
function render(): void {
  if (!panelEl) return;
  panelEl.innerHTML = "";
  panelEl.className = "lp-panel";

  const { layers } = getSceneState();
  const { activeLayerId } = getEditorState();

  // ── Toolbar: title + Add layer ──
  const toolbar = document.createElement("div");
  toolbar.className = "lp-toolbar";

  const title = document.createElement("span");
  title.className = "lp-title";
  title.textContent = "Layers";

  const addBtn = document.createElement("button");
  addBtn.className = "lp-add-btn";
  addBtn.innerHTML = ICON_PLUS;
  addBtn.title = "Add layer";
  addBtn.addEventListener("click", () => {
    const current = getSceneState().layers;
    const maxOrder = current.reduce((m, l) => Math.max(m, l.order), -1);
    const newLayer: SceneLayer = {
      id: generateLayerId(),
      name: `Layer ${current.length + 1}`,
      order: maxOrder + 1,
      visible: true,
      locked: false,
    };
    changeLayers([...current.map((l) => ({ ...l })), newLayer], "Add layer");
  });

  toolbar.appendChild(title);
  toolbar.appendChild(addBtn);
  panelEl.appendChild(toolbar);

  // ── Layer list (top = highest order = front) ──
  const sorted = [...layers].sort((a, b) => b.order - a.order);

  if (sorted.length === 0) {
    const hint = document.createElement("p");
    hint.className = "lp-hint";
    hint.textContent = "No layers. Click + to add one.";
    panelEl.appendChild(hint);
    return;
  }

  const list = document.createElement("div");
  list.className = "lp-list";

  for (const layer of sorted) {
    list.appendChild(renderLayerRow(layer, activeLayerId));
  }

  panelEl.appendChild(list);
}

/** Render a single layer row with its entity listing. */
function renderLayerRow(layer: SceneLayer, activeLayerId: string | null): HTMLElement {
  const isActive = layer.id === activeLayerId;
  const isExpanded = expandedLayerId === layer.id;

  const row = document.createElement("div");
  row.className =
    "lp-layer" +
    (isActive ? " lp-layer--active" : "") +
    (!layer.visible ? " lp-layer--hidden" : "") +
    (isExpanded ? " lp-layer--expanded" : "");

  // ── Drop target ──
  row.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes(MIME_ENTITY_MOVE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    row.classList.add("lp-layer--drop-target");
  });

  row.addEventListener("dragleave", (e) => {
    // Only remove highlight when leaving the layer row entirely
    if (!row.contains(e.relatedTarget as Node)) {
      row.classList.remove("lp-layer--drop-target");
    }
  });

  row.addEventListener("drop", (e) => {
    e.preventDefault();
    row.classList.remove("lp-layer--drop-target");

    const placedId = e.dataTransfer?.getData(MIME_ENTITY_MOVE);
    if (!placedId) return;

    const { entities } = getSceneState();
    const entity = entities.find((ent) => ent.id === placedId);
    if (!entity) return;

    // No-op if dropping onto the same layer or a locked layer
    if (entity.layerId === layer.id) return;
    if (layer.locked) return;

    // Place on top of target layer
    const maxZ = entities
      .filter((ent) => ent.layerId === layer.id)
      .reduce((m, ent) => Math.max(m, ent.zIndex), -1);

    executeCommand(createEntityUpdateCommand(
      placedId,
      { layerId: layer.id, zIndex: maxZ + 1 },
      `Move to layer "${layer.name}"`,
    ));
  });

  // ── Main row: visibility, lock, name, active indicator ──
  const main = document.createElement("div");
  main.className = "lp-layer-main";

  // Visibility toggle
  const visBtn = document.createElement("button");
  visBtn.className = "lp-icon-btn";
  visBtn.innerHTML = layer.visible ? ICON_EYE : ICON_EYE_OFF;
  visBtn.title = layer.visible ? "Hide layer" : "Show layer";
  visBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const current = getSceneState().layers;
    const updated = current.map((l) =>
      l.id === layer.id ? { ...l, visible: !l.visible } : { ...l },
    );
    changeLayers(updated, layer.visible ? "Hide layer" : "Show layer");
  });

  // Lock toggle
  const lockBtn = document.createElement("button");
  lockBtn.className = "lp-icon-btn";
  lockBtn.innerHTML = layer.locked ? ICON_LOCK : ICON_UNLOCK;
  lockBtn.title = layer.locked ? "Unlock layer" : "Lock layer";
  lockBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const current = getSceneState().layers;
    const updated = current.map((l) =>
      l.id === layer.id ? { ...l, locked: !l.locked } : { ...l },
    );
    changeLayers(updated, layer.locked ? "Unlock layer" : "Lock layer");
  });

  // Name
  const name = document.createElement("span");
  name.className = "lp-layer-name";
  name.textContent = layer.name;

  // Active indicator
  const indicator = document.createElement("span");
  indicator.className = "lp-active-indicator";
  if (isActive) {
    indicator.textContent = "\u25C6";
    indicator.title = "Active layer";
  }

  main.appendChild(visBtn);
  main.appendChild(lockBtn);
  main.appendChild(name);
  main.appendChild(indicator);

  // Click row → set as active layer
  main.addEventListener("click", () => {
    setActiveLayer(layer.id);
  });

  // Double-click → expand/collapse detail
  main.addEventListener("dblclick", (e) => {
    e.preventDefault();
    expandedLayerId = expandedLayerId === layer.id ? null : layer.id;
    render();
  });

  row.appendChild(main);

  // ── Entity listing within this layer ──
  row.appendChild(renderEntityList(layer.id));

  // ── Expanded detail panel ──
  if (isExpanded) {
    const detail = document.createElement("div");
    detail.className = "lp-detail";

    // Name edit
    const nameRow = document.createElement("div");
    nameRow.className = "lp-field";
    const nameLabel = document.createElement("span");
    nameLabel.className = "lp-field-label";
    nameLabel.textContent = "Name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "lp-input";
    nameInput.value = layer.name;
    nameInput.addEventListener("change", () => {
      const current = getSceneState().layers;
      const updated = current.map((l) =>
        l.id === layer.id ? { ...l, name: nameInput.value.trim() || layer.name } : { ...l },
      );
      changeLayers(updated, "Rename layer");
    });
    nameRow.appendChild(nameLabel);
    nameRow.appendChild(nameInput);
    detail.appendChild(nameRow);

    // Actions: move up, move down, delete
    const actionsRow = document.createElement("div");
    actionsRow.className = "lp-actions";

    const upBtn = document.createElement("button");
    upBtn.className = "lp-action-btn";
    upBtn.innerHTML = ICON_ARROW_UP;
    upBtn.title = "Move forward";
    upBtn.addEventListener("click", () => swapOrder(layer.id, 1));

    const downBtn = document.createElement("button");
    downBtn.className = "lp-action-btn";
    downBtn.innerHTML = ICON_ARROW_DOWN;
    downBtn.title = "Move backward";
    downBtn.addEventListener("click", () => swapOrder(layer.id, -1));

    const delBtn = document.createElement("button");
    delBtn.className = "lp-action-btn lp-action-btn--danger";
    delBtn.innerHTML = ICON_TRASH;
    delBtn.title = "Delete layer";
    delBtn.addEventListener("click", () => {
      const current = getSceneState().layers;
      if (current.length <= 1) return; // Don't delete last layer
      expandedLayerId = null;
      const updated = current.filter((l) => l.id !== layer.id).map((l) => ({ ...l }));
      changeLayers(updated, "Delete layer");

      // If we deleted the active layer, switch to the first remaining
      const { activeLayerId } = getEditorState();
      if (activeLayerId === layer.id && updated.length > 0) {
        setActiveLayer(updated[0]!.id);
      }
    });

    actionsRow.appendChild(downBtn);
    actionsRow.appendChild(upBtn);
    actionsRow.appendChild(delBtn);
    detail.appendChild(actionsRow);

    row.appendChild(detail);
  }

  return row;
}

// ---------------------------------------------------------------------------
// Entity listing within a layer
// ---------------------------------------------------------------------------

/** Get a display name for a placed entity. */
function getEntityDisplayName(placed: PlacedEntity): string {
  if (placed.semanticId) return placed.semanticId;
  // Truncate entityId for display
  const id = placed.entityId ?? placed.id;
  return id.length > 16 ? id.slice(0, 14) + "\u2026" : id;
}

/** Render the list of entities within a layer, sorted by zIndex (highest first). */
function renderEntityList(layerId: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "lp-entity-list";

  const { entities } = getSceneState();
  const { selectedIds } = getEditorState();
  const entityStore = getEntityStore();

  // Filter entities for this layer, sorted by zIndex descending (top = front)
  const layerEntities = entities
    .filter((e) => e.layerId === layerId)
    .sort((a, b) => b.zIndex - a.zIndex);

  if (layerEntities.length === 0) return container;

  for (const placed of layerEntities) {
    const isSelected = selectedIds.includes(placed.id);
    const def = entityStore.entities[placed.entityId];

    const row = document.createElement("div");
    row.className = "lp-entity-row" + (isSelected ? " lp-entity-row--selected" : "");

    // ── Drag source ──
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      if (!e.dataTransfer) return;
      e.dataTransfer.setData(MIME_ENTITY_MOVE, placed.id);
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("lp-entity-row--dragging");
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("lp-entity-row--dragging");
      // Clean up any lingering drop-target highlights
      panelEl?.querySelectorAll(".lp-layer--drop-target").forEach((el) =>
        el.classList.remove("lp-layer--drop-target"),
      );
    });

    // Entity name
    const nameEl = document.createElement("span");
    nameEl.className = "lp-entity-name";
    nameEl.textContent = getEntityDisplayName(placed);
    nameEl.title = `${placed.entityId} (${def?.visual.type ?? "unknown"})`;

    // Z-order buttons
    const zBtns = document.createElement("span");
    zBtns.className = "lp-entity-z-btns";

    const upBtn = document.createElement("button");
    upBtn.className = "lp-entity-z-btn";
    upBtn.innerHTML = ICON_CHEVRON_UP;
    upBtn.title = "Move forward";
    upBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      swapEntityZIndex(placed.id, 1);
    });

    const downBtn = document.createElement("button");
    downBtn.className = "lp-entity-z-btn";
    downBtn.innerHTML = ICON_CHEVRON_DOWN;
    downBtn.title = "Move backward";
    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      swapEntityZIndex(placed.id, -1);
    });

    zBtns.appendChild(upBtn);
    zBtns.appendChild(downBtn);

    row.appendChild(nameEl);
    row.appendChild(zBtns);

    // Click → select this entity on canvas
    row.addEventListener("click", () => {
      setSelection([placed.id]);
    });

    container.appendChild(row);
  }

  return container;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the Layers panel. */
export function initLayersPanel(contentEl: HTMLElement): void {
  panelEl = contentEl;
  render();

  subscribeScene(() => render());
  subscribeEditor(() => render());
}
