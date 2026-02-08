/**
 * Ground mode.
 *
 * Color picker or tile selection for the scene background.
 */

import { getState, updateState, subscribe } from "../../app-state.js";
import { executeCommand } from "../undo-manager.js";
import type { GroundConfig } from "../../types.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const groundPanel = document.getElementById("ground-panel")!;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Render the ground mode controls. */
function render(): void {
  const { sceneEditor, scene } = getState();

  if (sceneEditor.mode !== "ground") {
    groundPanel.hidden = true;
    return;
  }

  groundPanel.hidden = false;
  groundPanel.innerHTML = "";

  // Type toggle
  const typeRow = document.createElement("div");
  typeRow.className = "prop-row";

  const typeLabel = document.createElement("label");
  typeLabel.className = "prop-label";
  typeLabel.textContent = "Type";

  const typeSelect = document.createElement("select");
  typeSelect.className = "select-input";
  typeSelect.innerHTML = `
    <option value="color"${scene.ground.type === "color" ? " selected" : ""}>Solid Color</option>
    <option value="tile"${scene.ground.type === "tile" ? " selected" : ""}>Tiled</option>
  `;
  typeSelect.addEventListener("change", () => {
    const prev: GroundConfig = { ...scene.ground };
    const next: GroundConfig = { ...scene.ground, type: typeSelect.value as "color" | "tile" };
    executeCommand({
      description: "Change ground type",
      execute() {
        updateState({ scene: { ...getState().scene, ground: next } });
      },
      undo() {
        updateState({ scene: { ...getState().scene, ground: prev } });
      },
    });
  });

  typeRow.appendChild(typeLabel);
  typeRow.appendChild(typeSelect);
  groundPanel.appendChild(typeRow);

  // Color picker
  if (scene.ground.type === "color") {
    const colorRow = document.createElement("div");
    colorRow.className = "prop-row";

    const colorLabel = document.createElement("label");
    colorLabel.className = "prop-label";
    colorLabel.textContent = "Color";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = scene.ground.color;
    colorInput.addEventListener("change", () => {
      const prev = scene.ground.color;
      const next = colorInput.value;
      executeCommand({
        description: "Change ground color",
        execute() {
          const s = getState();
          updateState({ scene: { ...s.scene, ground: { ...s.scene.ground, color: next } } });
        },
        undo() {
          const s = getState();
          updateState({ scene: { ...s.scene, ground: { ...s.scene.ground, color: prev } } });
        },
      });
    });

    colorRow.appendChild(colorLabel);
    colorRow.appendChild(colorInput);
    groundPanel.appendChild(colorRow);
  }

  // Tile params (when type=tile)
  if (scene.ground.type === "tile") {
    const assetRow = document.createElement("div");
    assetRow.className = "prop-row";
    const assetLabel = document.createElement("label");
    assetLabel.className = "prop-label";
    assetLabel.textContent = "Tile Asset";
    const assetBadge = document.createElement("span");
    assetBadge.className = "asset-badge";
    assetBadge.textContent = scene.ground.tileAsset || "drag from palette";
    assetRow.appendChild(assetLabel);
    assetRow.appendChild(assetBadge);
    groundPanel.appendChild(assetRow);

    const sizeRow = document.createElement("div");
    sizeRow.className = "prop-row";
    const sizeLabel = document.createElement("label");
    sizeLabel.className = "prop-label";
    sizeLabel.textContent = "Tile Size";
    const sizeInput = document.createElement("input");
    sizeInput.type = "number";
    sizeInput.className = "num-input prop-input";
    sizeInput.value = String(scene.ground.tileSize);
    sizeInput.min = "8";
    sizeInput.max = "512";
    sizeInput.addEventListener("change", () => {
      const s = getState();
      updateState({
        scene: { ...s.scene, ground: { ...s.scene.ground, tileSize: Math.max(8, Number(sizeInput.value)) } },
      });
    });
    sizeRow.appendChild(sizeLabel);
    sizeRow.appendChild(sizeInput);
    groundPanel.appendChild(sizeRow);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize ground mode. */
export function initGroundMode(): void {
  subscribe(render);
  render();
}
