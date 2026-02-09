/**
 * Property panel module (scene tab right sidebar).
 *
 * Shows editable properties for the currently selected scene element:
 * x, y, size, rotation, layer, name, color. Includes a delete button.
 * When nothing is selected, shows scene settings (dimensions).
 */

import { getState, updateState, subscribe } from "../app-state.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const panel = document.getElementById("scene-props")!;

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/** Create a labeled number input row. */
function numRow(label: string, value: number, onChange: (v: number) => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "prop-row";

  const lbl = document.createElement("label");
  lbl.className = "prop-label";
  lbl.textContent = label;

  const input = document.createElement("input");
  input.type = "number";
  input.className = "num-input prop-input";
  input.value = String(Math.round(value));
  input.addEventListener("change", () => {
    onChange(Number(input.value));
  });

  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}

/** Create a labeled text input row. */
function textRow(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "prop-row";

  const lbl = document.createElement("label");
  lbl.className = "prop-label";
  lbl.textContent = label;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "entity-name-input prop-input";
  input.value = value;
  input.spellcheck = false;
  input.addEventListener("change", () => {
    onChange(input.value.trim());
  });

  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}

/** Create a labeled color input row. */
function colorRow(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "prop-row";

  const lbl = document.createElement("label");
  lbl.className = "prop-label";
  lbl.textContent = label;

  const input = document.createElement("input");
  input.type = "color";
  input.value = value;
  input.addEventListener("input", () => {
    onChange(input.value);
  });

  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Render the property panel based on selection. */
function render(): void {
  const { scene, sceneEditor } = getState();
  panel.innerHTML = "";

  // No selection — show scene settings
  if (sceneEditor.selectedIds.length === 0 || !sceneEditor.selectedType) {
    const title = document.createElement("p");
    title.className = "prop-section-title";
    title.textContent = "Scene";
    panel.appendChild(title);

    panel.appendChild(numRow("Width", scene.sceneWidth, (v) => {
      updateState({ scene: { ...getState().scene, sceneWidth: Math.max(100, v) } });
    }));
    panel.appendChild(numRow("Height", scene.sceneHeight, (v) => {
      updateState({ scene: { ...getState().scene, sceneHeight: Math.max(100, v) } });
    }));

    const hint = document.createElement("p");
    hint.className = "prop-empty";
    hint.textContent = "Select an element to edit its properties.";
    panel.appendChild(hint);
    return;
  }

  const id = sceneEditor.selectedIds[0]!;

  if (sceneEditor.selectedType === "decoration") {
    const decor = scene.decorations.find((d) => d.id === id);
    if (!decor) return;

    panel.appendChild(numRow("X", decor.x, (v) => {
      decor.x = v;
      updateState({});
    }));
    panel.appendChild(numRow("Y", decor.y, (v) => {
      decor.y = v;
      updateState({});
    }));
    panel.appendChild(numRow("Width", decor.displayWidth, (v) => {
      decor.displayWidth = Math.max(1, v);
      updateState({});
    }));
    panel.appendChild(numRow("Height", decor.displayHeight, (v) => {
      decor.displayHeight = Math.max(1, v);
      updateState({});
    }));
    panel.appendChild(numRow("Rotation", decor.rotation, (v) => {
      decor.rotation = v;
      updateState({});
    }));
    panel.appendChild(numRow("Layer", decor.layer, (v) => {
      decor.layer = v;
      updateState({});
    }));

    // Asset path (read-only info)
    const assetInfo = document.createElement("p");
    assetInfo.className = "prop-info";
    assetInfo.textContent = decor.asset.split("/").pop() ?? decor.asset;
    assetInfo.title = decor.asset;
    panel.appendChild(assetInfo);

    appendDeleteButton(() => {
      const decorations = getState().scene.decorations.filter((d) => d.id !== id);
      updateState({
        scene: { ...getState().scene, decorations },
        sceneEditor: { ...getState().sceneEditor, selectedIds: [], selectedType: null },
      });
    });
  }

  if (sceneEditor.selectedType === "position") {
    const pos = scene.positions[id];
    if (!pos) return;

    panel.appendChild(textRow("Name", id, (newName) => {
      if (!newName || newName === id || scene.positions[newName]) return;
      const positions = { ...scene.positions };
      positions[newName] = positions[id]!;
      delete positions[id];
      const routes = scene.routes.map((r) => ({
        ...r,
        from: r.from === id ? newName : r.from,
        to: r.to === id ? newName : r.to,
      }));
      updateState({
        scene: { ...getState().scene, positions, routes },
        sceneEditor: { ...getState().sceneEditor, selectedIds: [newName] },
      });
    }));
    panel.appendChild(numRow("X", pos.x, (v) => {
      pos.x = v;
      updateState({});
    }));
    panel.appendChild(numRow("Y", pos.y, (v) => {
      pos.y = v;
      updateState({});
    }));
    panel.appendChild(colorRow("Color", pos.color ?? "#f0c040", (v) => {
      pos.color = v;
      updateState({});
    }));

    appendDeleteButton(() => {
      const positions = { ...getState().scene.positions };
      delete positions[id];
      const routes = getState().scene.routes.filter((r) => r.from !== id && r.to !== id);
      updateState({
        scene: { ...getState().scene, positions, routes },
        sceneEditor: { ...getState().sceneEditor, selectedIds: [], selectedType: null },
      });
    });
  }

  if (sceneEditor.selectedType === "wall") {
    const wall = scene.walls.find((w) => w.id === id);
    if (!wall) return;

    panel.appendChild(numRow("Thickness", wall.thickness, (v) => {
      wall.thickness = Math.max(1, v);
      updateState({});
    }));
    panel.appendChild(colorRow("Color", wall.color, (v) => {
      wall.color = v;
      updateState({});
    }));

    appendDeleteButton(() => {
      const walls = getState().scene.walls.filter((w) => w.id !== id);
      updateState({
        scene: { ...getState().scene, walls },
        sceneEditor: { ...getState().sceneEditor, selectedIds: [], selectedType: null },
      });
    });
  }

  if (sceneEditor.selectedType === "route") {
    const route = scene.routes.find((r) => r.id === id);
    if (!route) return;

    panel.appendChild(textRow("Name", route.name ?? "", (v) => {
      route.name = v || undefined;
      updateState({});
    }));

    const infoFrom = document.createElement("p");
    infoFrom.className = "prop-info";
    infoFrom.textContent = `From: ${route.from}`;
    panel.appendChild(infoFrom);

    const infoTo = document.createElement("p");
    infoTo.className = "prop-info";
    infoTo.textContent = `To: ${route.to}`;
    panel.appendChild(infoTo);

    appendDeleteButton(() => {
      const routes = getState().scene.routes.filter((r) => r.id !== id);
      updateState({
        scene: { ...getState().scene, routes },
        sceneEditor: { ...getState().sceneEditor, selectedIds: [], selectedType: null },
      });
    });
  }
}

/** Append a delete button to the panel. */
function appendDeleteButton(onDelete: () => void): void {
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-danger btn-small prop-delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", onDelete);
  panel.appendChild(deleteBtn);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the property panel. */
export function initPropertyPanel(): void {
  subscribe(render);
  render();
}
