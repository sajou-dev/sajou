/**
 * Property panel module (scene tab right sidebar).
 *
 * Shows editable properties for the currently selected scene element:
 * x, y, size, rotation, layer, name. Includes a delete button.
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

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Render the property panel based on selection. */
function render(): void {
  const { scene, sceneEditor } = getState();
  panel.innerHTML = "";

  if (sceneEditor.selectedIds.length === 0 || !sceneEditor.selectedType) {
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

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger btn-small prop-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      const decorations = getState().scene.decorations.filter((d) => d.id !== id);
      updateState({
        scene: { ...getState().scene, decorations },
        sceneEditor: { ...getState().sceneEditor, selectedIds: [], selectedType: null },
      });
    });
    panel.appendChild(deleteBtn);
  }

  if (sceneEditor.selectedType === "position") {
    const pos = scene.positions[id];
    if (!pos) return;

    panel.appendChild(textRow("Name", id, (newName) => {
      if (!newName || newName === id || scene.positions[newName]) return;
      const positions = { ...scene.positions };
      positions[newName] = positions[id]!;
      delete positions[id];
      // Update routes referencing old name
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

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger btn-small prop-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      const positions = { ...getState().scene.positions };
      delete positions[id];
      // Remove routes referencing this position
      const routes = getState().scene.routes.filter((r) => r.from !== id && r.to !== id);
      updateState({
        scene: { ...getState().scene, positions, routes },
        sceneEditor: { ...getState().sceneEditor, selectedIds: [], selectedType: null },
      });
    });
    panel.appendChild(deleteBtn);
  }

  if (sceneEditor.selectedType === "wall") {
    const wall = scene.walls.find((w) => w.id === id);
    if (!wall) return;

    panel.appendChild(numRow("Thickness", wall.thickness, (v) => {
      wall.thickness = Math.max(1, v);
      updateState({});
    }));

    const colorRow = document.createElement("div");
    colorRow.className = "prop-row";
    const colorLabel = document.createElement("label");
    colorLabel.className = "prop-label";
    colorLabel.textContent = "Color";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = wall.color;
    colorInput.addEventListener("input", () => {
      wall.color = colorInput.value;
      updateState({});
    });
    colorRow.appendChild(colorLabel);
    colorRow.appendChild(colorInput);
    panel.appendChild(colorRow);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger btn-small prop-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      const walls = getState().scene.walls.filter((w) => w.id !== id);
      updateState({
        scene: { ...getState().scene, walls },
        sceneEditor: { ...getState().sceneEditor, selectedIds: [], selectedType: null },
      });
    });
    panel.appendChild(deleteBtn);
  }

  if (sceneEditor.selectedType === "route") {
    const route = scene.routes.find((r) => r.id === id);
    if (!route) return;

    const infoFrom = document.createElement("p");
    infoFrom.className = "prop-info";
    infoFrom.textContent = `From: ${route.from}`;
    panel.appendChild(infoFrom);

    const infoTo = document.createElement("p");
    infoTo.className = "prop-info";
    infoTo.textContent = `To: ${route.to}`;
    panel.appendChild(infoTo);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger btn-small prop-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      const routes = getState().scene.routes.filter((r) => r.id !== id);
      updateState({
        scene: { ...getState().scene, routes },
        sceneEditor: { ...getState().sceneEditor, selectedIds: [], selectedType: null },
      });
    });
    panel.appendChild(deleteBtn);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the property panel. */
export function initPropertyPanel(): void {
  subscribe(render);
  render();
}
