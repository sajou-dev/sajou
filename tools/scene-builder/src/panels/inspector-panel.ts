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
import {
  getChoreographyState,
  subscribeChoreography,
} from "../state/choreography-state.js";
import {
  getBindingsForEntity,
  getCompatibleProperties,
  addBinding,
  removeBinding,
  subscribeBindings,
  BINDABLE_PROPERTIES,
} from "../state/binding-store.js";
import { executeCommand } from "../state/undo.js";
import type {
  EntityTopology,
  PlacedEntity,
  ScenePosition,
  SceneRoute,
  UndoableCommand,
  BindingValueType,
} from "../types.js";

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

    // Context-aware: check position selection first, then route, then entity
    const { selectedPositionIds, selectedRouteIds } = getEditorState();
    if (selectedPositionIds.length > 0) {
      renderPositionInspector(contentEl, selectedPositionIds[0]!);
      return;
    }
    if (selectedRouteIds.length > 0) {
      renderRouteInspector(contentEl, selectedRouteIds[0]!);
      return;
    }

    const placed = getSelectedPlaced();
    if (!placed) {
      contentEl.innerHTML = '<p class="ip-empty">Select an element on the canvas.</p>';
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

    // Semantic ID (actor name for choreographies)
    const semanticInput = document.createElement("input");
    semanticInput.type = "text";
    semanticInput.className = "ip-input ip-input--semantic";
    semanticInput.value = placed.semanticId ?? "";
    semanticInput.placeholder = "e.g. door-kitchen";
    semanticInput.title = "Semantic name for choreographies. Leave empty for passive decor.";
    semanticInput.addEventListener("change", () => {
      const val = semanticInput.value.trim() || undefined;
      // Validate uniqueness
      if (val) {
        const { entities } = getSceneState();
        const duplicate = entities.find((e) => e.id !== placed.id && e.semanticId === val);
        if (duplicate) {
          semanticInput.value = placed.semanticId ?? "";
          return;
        }
      }
      executeCommand(createUpdateCommand(
        placed.id,
        { semanticId: val } as Partial<PlacedEntity>,
        val ? `Set semantic ID "${val}"` : "Clear semantic ID",
      ));
    });
    form.appendChild(createRow("Actor ID", semanticInput));

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

    // Layer (read-only — use drag-drop in Layers panel to change)
    const { layers: sceneLayers } = getSceneState();
    const sortedLayers = [...sceneLayers].sort((a, b) => a.order - b.order);
    const layerName = sortedLayers.find((l) => l.id === placed.layerId)?.name ?? placed.layerId;
    form.appendChild(createRow("Layer", createReadonly(layerName)));

    // Z-Index (per-placement stacking order within layer)
    form.appendChild(createRow("Z-Index", createNumInputEl(placed.zIndex, (v) =>
      executeCommand(createUpdateCommand(placed.id, { zIndex: v }, `Z-Index ${placed.id}`)))));

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

    // ── Topology section (actors only) ──
    if (placed.semanticId) {
      const topoHeader = document.createElement("div");
      topoHeader.className = "ip-section-header";
      topoHeader.textContent = "Topology";
      form.appendChild(topoHeader);

      const { positions, routes } = getSceneState();
      const currentTopo: EntityTopology = placed.topology ?? { waypoints: [] };

      // Home waypoint dropdown
      const homeSelect = document.createElement("select");
      homeSelect.className = "ip-select";
      const homeNone = document.createElement("option");
      homeNone.value = "";
      homeNone.textContent = "None";
      if (!currentTopo.home) homeNone.selected = true;
      homeSelect.appendChild(homeNone);
      for (const pos of positions) {
        const opt = document.createElement("option");
        opt.value = pos.id;
        opt.textContent = pos.name;
        if (pos.id === currentTopo.home) opt.selected = true;
        homeSelect.appendChild(opt);
      }
      homeSelect.addEventListener("change", () => {
        const val = homeSelect.value || undefined;
        const newTopo: EntityTopology = { ...currentTopo, home: val };
        // Auto-add home to waypoints if not already there
        if (val && !newTopo.waypoints.includes(val)) {
          newTopo.waypoints = [...newTopo.waypoints, val];
        }
        executeCommand(createUpdateCommand(
          placed.id,
          { topology: newTopo },
          val ? "Set home waypoint" : "Clear home waypoint",
        ));
      });
      form.appendChild(createRow("Home", homeSelect));

      // Accessible waypoints — chip list
      const wpContainer = document.createElement("div");
      wpContainer.className = "ip-chip-list";

      for (const wpId of currentTopo.waypoints) {
        const pos = positions.find((p) => p.id === wpId);
        const chip = document.createElement("span");
        chip.className = "ip-chip";
        chip.textContent = pos?.name ?? wpId;
        const removeBtn = document.createElement("button");
        removeBtn.className = "ip-chip-remove";
        removeBtn.textContent = "\u00D7";
        removeBtn.addEventListener("click", () => {
          const newWaypoints = currentTopo.waypoints.filter((id) => id !== wpId);
          const newTopo: EntityTopology = { ...currentTopo, waypoints: newWaypoints };
          // Clear home if it was removed
          if (currentTopo.home === wpId) newTopo.home = undefined;
          executeCommand(createUpdateCommand(
            placed.id,
            { topology: newTopo },
            "Remove waypoint",
          ));
        });
        chip.appendChild(removeBtn);
        wpContainer.appendChild(chip);
      }

      // Add dropdown (filtered: exclude already-added waypoints)
      const addSelect = document.createElement("select");
      addSelect.className = "ip-select ip-select--add";
      const addPlaceholder = document.createElement("option");
      addPlaceholder.value = "";
      addPlaceholder.textContent = "+ Add waypoint";
      addSelect.appendChild(addPlaceholder);
      for (const pos of positions) {
        if (currentTopo.waypoints.includes(pos.id)) continue;
        const opt = document.createElement("option");
        opt.value = pos.id;
        opt.textContent = pos.name;
        addSelect.appendChild(opt);
      }
      addSelect.addEventListener("change", () => {
        if (!addSelect.value) return;
        const newWaypoints = [...currentTopo.waypoints, addSelect.value];
        const newTopo: EntityTopology = { ...currentTopo, waypoints: newWaypoints };
        executeCommand(createUpdateCommand(
          placed.id,
          { topology: newTopo },
          "Add waypoint",
        ));
      });
      wpContainer.appendChild(addSelect);
      form.appendChild(createRow("Waypoints", wpContainer));

      // Available routes (read-only derived list)
      const entityPositionIds = new Set<string>();
      if (currentTopo.home) entityPositionIds.add(currentTopo.home);
      for (const wp of currentTopo.waypoints) entityPositionIds.add(wp);

      const availableRoutes = routes.filter((r) =>
        r.fromPositionId && r.toPositionId
        && entityPositionIds.has(r.fromPositionId) && entityPositionIds.has(r.toPositionId),
      );

      if (availableRoutes.length > 0) {
        const routeList = document.createElement("div");
        routeList.className = "ip-route-list";
        for (const r of availableRoutes) {
          const fromPos = positions.find((p) => p.id === r.fromPositionId);
          const toPos = positions.find((p) => p.id === r.toPositionId);
          const item = document.createElement("span");
          item.className = "ip-readonly";
          item.textContent = `${r.name} (${fromPos?.name ?? "?"} → ${toPos?.name ?? "?"})`;
          routeList.appendChild(item);
        }
        form.appendChild(createRow("Routes", routeList));
      }

      // State mapping — key→value table (context → animation state)
      const stateMap = currentTopo.stateMapping ?? {};
      const smContainer = document.createElement("div");
      smContainer.className = "ip-state-map";

      // Existing entries
      for (const [key, val] of Object.entries(stateMap)) {
        const row = document.createElement("div");
        row.className = "ip-state-map-row";

        const keyInput = document.createElement("input");
        keyInput.className = "ip-input ip-input--sm";
        keyInput.value = key;
        keyInput.placeholder = "context";

        const valInput = document.createElement("input");
        valInput.className = "ip-input ip-input--sm";
        valInput.value = val;
        valInput.placeholder = "state";

        const removeBtn = document.createElement("button");
        removeBtn.className = "ip-chip-remove";
        removeBtn.textContent = "\u00D7";

        // Update key on blur
        keyInput.addEventListener("change", () => {
          const newKey = keyInput.value.trim();
          if (!newKey || (newKey !== key && newKey in stateMap)) return;
          const newMap = { ...stateMap };
          delete newMap[key];
          newMap[newKey] = val;
          executeCommand(createUpdateCommand(
            placed.id,
            { topology: { ...currentTopo, stateMapping: newMap } },
            "Rename state mapping key",
          ));
        });

        // Update value on blur
        valInput.addEventListener("change", () => {
          const newVal = valInput.value.trim();
          if (!newVal) return;
          const newMap = { ...stateMap, [key]: newVal };
          executeCommand(createUpdateCommand(
            placed.id,
            { topology: { ...currentTopo, stateMapping: newMap } },
            "Update state mapping value",
          ));
        });

        // Remove entry
        removeBtn.addEventListener("click", () => {
          const newMap = { ...stateMap };
          delete newMap[key];
          const hasEntries = Object.keys(newMap).length > 0;
          executeCommand(createUpdateCommand(
            placed.id,
            { topology: { ...currentTopo, stateMapping: hasEntries ? newMap : undefined } },
            "Remove state mapping",
          ));
        });

        row.appendChild(keyInput);
        row.appendChild(valInput);
        row.appendChild(removeBtn);
        smContainer.appendChild(row);
      }

      // Add new entry row
      const addRow = document.createElement("div");
      addRow.className = "ip-state-map-row ip-state-map-row--add";
      const addKeyInput = document.createElement("input");
      addKeyInput.className = "ip-input ip-input--sm";
      addKeyInput.placeholder = "context";
      const addValInput = document.createElement("input");
      addValInput.className = "ip-input ip-input--sm";
      addValInput.placeholder = "state";
      const addBtn = document.createElement("button");
      addBtn.className = "ip-btn ip-btn--sm";
      addBtn.textContent = "+";
      addBtn.addEventListener("click", () => {
        const newKey = addKeyInput.value.trim();
        const newVal = addValInput.value.trim();
        if (!newKey || !newVal) return;
        if (newKey in stateMap) return; // No duplicates
        const newMap = { ...stateMap, [newKey]: newVal };
        executeCommand(createUpdateCommand(
          placed.id,
          { topology: { ...currentTopo, stateMapping: newMap } },
          "Add state mapping",
        ));
      });
      addRow.appendChild(addKeyInput);
      addRow.appendChild(addValInput);
      addRow.appendChild(addBtn);
      smContainer.appendChild(addRow);

      form.appendChild(createRow("States", smContainer));
    }

    // ── Bindings section (actors only — Level 2 dynamic bindings) ──
    if (placed.semanticId) {
      const bindHeader = document.createElement("div");
      bindHeader.className = "ip-section-header";
      bindHeader.textContent = "Bindings";
      form.appendChild(bindHeader);

      const entityBindings = getBindingsForEntity(placed.semanticId);
      const { choreographies } = getChoreographyState();
      const hasTopo = !!(placed.topology && placed.topology.waypoints.length > 0);

      // Existing bindings list
      if (entityBindings.length > 0) {
        const bindList = document.createElement("div");
        bindList.className = "ip-binding-list";

        for (const binding of entityBindings) {
          const choreo = choreographies.find((c) => c.id === binding.sourceChoreographyId);
          const propDef = BINDABLE_PROPERTIES.find((p) => p.key === binding.property);
          const row = document.createElement("div");
          row.className = "ip-binding-row";

          // Binding dot (colored by type)
          const dot = document.createElement("span");
          dot.className = `ip-binding-dot ip-binding-dot--${binding.sourceType}`;
          row.appendChild(dot);

          // Label: property ← source
          const label = document.createElement("span");
          label.className = "ip-binding-label";
          label.textContent = `${propDef?.label ?? binding.property} ← ${choreo?.on ?? "?"}`;
          label.title = `Source: ${choreo?.on ?? binding.sourceChoreographyId}\nType: ${binding.sourceType}\nProperty: ${binding.property}`;
          row.appendChild(label);

          // Mapping info (if present)
          if (binding.mapping) {
            const mapInfo = document.createElement("span");
            mapInfo.className = "ip-binding-mapping";
            mapInfo.textContent = binding.mapping.fn;
            row.appendChild(mapInfo);
          }

          // Disconnect button
          const disconnectBtn = document.createElement("button");
          disconnectBtn.className = "ip-chip-remove";
          disconnectBtn.textContent = "\u00D7";
          disconnectBtn.title = "Disconnect binding";
          disconnectBtn.addEventListener("click", () => {
            removeBinding(binding.id);
          });
          row.appendChild(disconnectBtn);

          bindList.appendChild(row);
        }

        form.appendChild(bindList);
      } else {
        const emptyMsg = document.createElement("span");
        emptyMsg.className = "ip-readonly";
        emptyMsg.textContent = "No bindings";
        form.appendChild(createRow("", emptyMsg));
      }

      // Add binding — two-step: pick source, then pick property
      if (choreographies.length > 0) {
        const addContainer = document.createElement("div");
        addContainer.className = "ip-binding-add";

        // Step 1: Source choreography dropdown
        const srcSelect = document.createElement("select");
        srcSelect.className = "ip-select ip-select--add";
        const srcPlaceholder = document.createElement("option");
        srcPlaceholder.value = "";
        srcPlaceholder.textContent = "+ Add binding...";
        srcSelect.appendChild(srcPlaceholder);

        for (const choreo of choreographies) {
          const opt = document.createElement("option");
          opt.value = choreo.id;
          opt.textContent = choreo.on || choreo.id.slice(0, 8);
          srcSelect.appendChild(opt);
        }

        // Step 2: Property dropdown (hidden until source selected)
        const propSelect = document.createElement("select");
        propSelect.className = "ip-select ip-select--add";
        propSelect.style.display = "none";

        // Step 3: Type dropdown (for source output type)
        const typeSelect = document.createElement("select");
        typeSelect.className = "ip-select ip-select--add";
        typeSelect.style.display = "none";

        const outputTypes: BindingValueType[] = ["float", "event", "bool", "enum", "point2D", "color", "int"];
        const typePlaceholder = document.createElement("option");
        typePlaceholder.value = "";
        typePlaceholder.textContent = "Output type...";
        typeSelect.appendChild(typePlaceholder);
        for (const t of outputTypes) {
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t;
          typeSelect.appendChild(opt);
        }

        // When source selected, show type picker
        srcSelect.addEventListener("change", () => {
          if (srcSelect.value) {
            typeSelect.style.display = "";
            typeSelect.value = "";
            propSelect.style.display = "none";
            propSelect.innerHTML = "";
          } else {
            typeSelect.style.display = "none";
            propSelect.style.display = "none";
          }
        });

        // When type selected, populate property dropdown
        typeSelect.addEventListener("change", () => {
          if (!typeSelect.value) {
            propSelect.style.display = "none";
            return;
          }

          const sourceType = typeSelect.value as BindingValueType;
          const compatProps = getCompatibleProperties(sourceType, hasTopo);

          propSelect.innerHTML = "";
          const propPlaceholder = document.createElement("option");
          propPlaceholder.value = "";
          propPlaceholder.textContent = "Target property...";
          propSelect.appendChild(propPlaceholder);

          for (const prop of compatProps) {
            const opt = document.createElement("option");
            opt.value = prop.key;
            opt.textContent = `${prop.label} (${prop.category})`;
            propSelect.appendChild(opt);
          }

          propSelect.style.display = "";
        });

        // When property selected, create the binding
        propSelect.addEventListener("change", () => {
          const choreographyId = srcSelect.value;
          const sourceType = typeSelect.value as BindingValueType;
          const property = propSelect.value;
          if (!choreographyId || !sourceType || !property || !placed.semanticId) return;

          addBinding({
            targetEntityId: placed.semanticId,
            property,
            sourceChoreographyId: choreographyId,
            sourceType,
          });

          // Reset selects
          srcSelect.value = "";
          typeSelect.style.display = "none";
          typeSelect.value = "";
          propSelect.style.display = "none";
          propSelect.innerHTML = "";
        });

        addContainer.appendChild(srcSelect);
        addContainer.appendChild(typeSelect);
        addContainer.appendChild(propSelect);
        form.appendChild(addContainer);
      }
    }

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
  // Position inspector sub-renderer
  // ---------------------------------------------------------------------------

  function renderPositionInspector(el: HTMLElement, posId: string): void {
    const { positions } = getSceneState();
    const pos = positions.find((p) => p.id === posId);
    if (!pos) {
      el.innerHTML = '<p class="ip-empty">Position not found.</p>';
      return;
    }

    const form = document.createElement("div");
    form.className = "ip-form";

    // ID (readonly)
    form.appendChild(createRow("ID", createReadonly(pos.id)));

    // Name
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "ip-input";
    nameInput.value = pos.name;
    nameInput.addEventListener("change", () => {
      const val = nameInput.value.trim();
      if (!val) { nameInput.value = pos.name; return; }
      // Validate uniqueness
      const { positions: allPos } = getSceneState();
      if (allPos.some((p) => p.id !== pos.id && p.name === val)) {
        nameInput.value = pos.name;
        return;
      }
      executeCommand(createPositionUpdateCommand(pos.id, { name: val }, `Rename position "${val}"`));
    });
    form.appendChild(createRow("Name", nameInput));

    // Position X/Y
    const posRow = document.createElement("div");
    posRow.className = "ip-inline";
    posRow.appendChild(createNumInput("X", pos.x, (v) =>
      executeCommand(createPositionUpdateCommand(pos.id, { x: v }, `Move position X`))));
    posRow.appendChild(createNumInput("Y", pos.y, (v) =>
      executeCommand(createPositionUpdateCommand(pos.id, { y: v }, `Move position Y`))));
    form.appendChild(createRow("Position", posRow));

    // Type hint
    const typeSelect = document.createElement("select");
    typeSelect.className = "ip-select";
    const types = ["generic", "spawn", "waypoint", "destination"] as const;
    for (const t of types) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      if (t === pos.typeHint) opt.selected = true;
      typeSelect.appendChild(opt);
    }
    typeSelect.addEventListener("change", () =>
      executeCommand(createPositionUpdateCommand(pos.id, { typeHint: typeSelect.value as typeof types[number] }, `Set type "${typeSelect.value}"`)));
    form.appendChild(createRow("Type", typeSelect));

    // Color
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "ip-color";
    colorInput.value = pos.color;
    colorInput.addEventListener("change", () =>
      executeCommand(createPositionUpdateCommand(pos.id, { color: colorInput.value }, "Change color")));
    form.appendChild(createRow("Color", colorInput));

    // Entity binding
    const bindSelect = document.createElement("select");
    bindSelect.className = "ip-select";
    const noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "None";
    if (!pos.entityBinding) noneOpt.selected = true;
    bindSelect.appendChild(noneOpt);
    const entityStore = getEntityStore();
    for (const id of Object.keys(entityStore.entities)) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id;
      if (id === pos.entityBinding) opt.selected = true;
      bindSelect.appendChild(opt);
    }
    bindSelect.addEventListener("change", () => {
      const val = bindSelect.value || undefined;
      executeCommand(createPositionUpdateCommand(pos.id, { entityBinding: val }, "Set entity binding"));
    });
    form.appendChild(createRow("Binding", bindSelect));

    el.appendChild(form);
  }

  // ---------------------------------------------------------------------------
  // Route inspector sub-renderer
  // ---------------------------------------------------------------------------

  function renderRouteInspector(el: HTMLElement, routeId: string): void {
    const { routes } = getSceneState();
    const route = routes.find((r) => r.id === routeId);
    if (!route) {
      el.innerHTML = '<p class="ip-empty">Route not found.</p>';
      return;
    }

    const form = document.createElement("div");
    form.className = "ip-form";

    // ID (readonly)
    form.appendChild(createRow("ID", createReadonly(route.id)));

    // Name
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "ip-input";
    nameInput.value = route.name;
    nameInput.addEventListener("change", () => {
      const val = nameInput.value.trim();
      if (!val) { nameInput.value = route.name; return; }
      executeCommand(createRouteUpdateCommand(route.id, { name: val }, `Rename route "${val}"`));
    });
    form.appendChild(createRow("Name", nameInput));

    // Points count (readonly)
    form.appendChild(createRow("Points", createReadonly(String(route.points.length))));

    // Waypoint names (editable per-point)
    if (route.points.length > 2) {
      const wpSection = document.createElement("div");
      wpSection.className = "ip-section";

      const wpLabel = document.createElement("div");
      wpLabel.className = "ip-section-label";
      wpLabel.textContent = "Waypoints";
      wpSection.appendChild(wpLabel);

      // Only intermediate points (not first/last, which are endpoints)
      for (let pi = 1; pi < route.points.length - 1; pi++) {
        const rp = route.points[pi]!;
        const wpRow = document.createElement("div");
        wpRow.className = "ip-inline";

        const idxLabel = document.createElement("span");
        idxLabel.className = "ip-muted";
        idxLabel.textContent = `#${pi}`;
        idxLabel.style.minWidth = "24px";
        wpRow.appendChild(idxLabel);

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "ip-input";
        nameInput.value = rp.name ?? "";
        nameInput.placeholder = "(unnamed)";
        nameInput.style.flex = "1";
        const pointIndex = pi;
        nameInput.addEventListener("change", () => {
          const newName = nameInput.value.trim() || undefined;
          const updatedPoints = route.points.map((p, idx) =>
            idx === pointIndex ? { ...p, name: newName } : p,
          );
          executeCommand(createRouteUpdateCommand(
            route.id,
            { points: updatedPoints },
            newName ? `Name waypoint #${pointIndex} "${newName}"` : `Clear waypoint #${pointIndex} name`,
          ));
        });
        wpRow.appendChild(nameInput);
        wpSection.appendChild(wpRow);
      }

      form.appendChild(wpSection);
    }

    // Style
    const styleSelect = document.createElement("select");
    styleSelect.className = "ip-select";
    const styles = ["solid", "dashed"] as const;
    for (const s of styles) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      if (s === route.style) opt.selected = true;
      styleSelect.appendChild(opt);
    }
    styleSelect.addEventListener("change", () =>
      executeCommand(createRouteUpdateCommand(
        route.id,
        { style: styleSelect.value as typeof styles[number] },
        `Set style "${styleSelect.value}"`,
      )));
    form.appendChild(createRow("Style", styleSelect));

    // Color
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "ip-color";
    colorInput.value = route.color;
    colorInput.addEventListener("change", () =>
      executeCommand(createRouteUpdateCommand(route.id, { color: colorInput.value }, "Change route color")));
    form.appendChild(createRow("Color", colorInput));

    // Bidirectional toggle
    const bidiRow = document.createElement("div");
    bidiRow.className = "ip-inline";
    bidiRow.appendChild(createCheckbox("Bidirectional", route.bidirectional, (v) =>
      executeCommand(createRouteUpdateCommand(route.id, { bidirectional: v }, v ? "Set bidirectional" : "Set one-way"))));
    form.appendChild(createRow("Direction", bidiRow));

    // From position
    const { positions } = getSceneState();
    const fromSelect = document.createElement("select");
    fromSelect.className = "ip-select";
    const fromNone = document.createElement("option");
    fromNone.value = "";
    fromNone.textContent = "None";
    if (!route.fromPositionId) fromNone.selected = true;
    fromSelect.appendChild(fromNone);
    for (const pos of positions) {
      const opt = document.createElement("option");
      opt.value = pos.id;
      opt.textContent = pos.name;
      if (pos.id === route.fromPositionId) opt.selected = true;
      fromSelect.appendChild(opt);
    }
    fromSelect.addEventListener("change", () => {
      const val = fromSelect.value || undefined;
      executeCommand(createRouteUpdateCommand(route.id, { fromPositionId: val }, val ? "Set route origin" : "Clear route origin"));
    });
    form.appendChild(createRow("From", fromSelect));

    // To position
    const toSelect = document.createElement("select");
    toSelect.className = "ip-select";
    const toNone = document.createElement("option");
    toNone.value = "";
    toNone.textContent = "None";
    if (!route.toPositionId) toNone.selected = true;
    toSelect.appendChild(toNone);
    for (const pos of positions) {
      const opt = document.createElement("option");
      opt.value = pos.id;
      opt.textContent = pos.name;
      if (pos.id === route.toPositionId) opt.selected = true;
      toSelect.appendChild(opt);
    }
    toSelect.addEventListener("change", () => {
      const val = toSelect.value || undefined;
      executeCommand(createRouteUpdateCommand(route.id, { toPositionId: val }, val ? "Set route destination" : "Clear route destination"));
    });
    form.appendChild(createRow("To", toSelect));

    el.appendChild(form);
  }

  /** Create an undoable command that updates a route's properties. */
  function createRouteUpdateCommand(
    routeId: string,
    updates: Partial<SceneRoute>,
    description: string,
  ): UndoableCommand {
    const { routes } = getSceneState();
    const oldRoute = routes.find((r) => r.id === routeId);
    if (!oldRoute) {
      return { execute() { /* noop */ }, undo() { /* noop */ }, description };
    }

    const snapshot = { ...oldRoute };
    return {
      execute() {
        const { routes: current } = getSceneState();
        updateSceneState({
          routes: current.map((r) =>
            r.id === routeId ? { ...r, ...updates } : r,
          ),
        });
      },
      undo() {
        const { routes: current } = getSceneState();
        updateSceneState({
          routes: current.map((r) =>
            r.id === routeId ? snapshot : r,
          ),
        });
      },
      description,
    };
  }

  /** Create an undoable command that updates a position's properties. */
  function createPositionUpdateCommand(
    posId: string,
    updates: Partial<ScenePosition>,
    description: string,
  ): UndoableCommand {
    const { positions } = getSceneState();
    const oldPos = positions.find((p) => p.id === posId);
    if (!oldPos) {
      return { execute() { /* noop */ }, undo() { /* noop */ }, description };
    }

    const snapshot = { ...oldPos };
    return {
      execute() {
        const { positions: current } = getSceneState();
        updateSceneState({
          positions: current.map((p) =>
            p.id === posId ? { ...p, ...updates } : p,
          ),
        });
      },
      undo() {
        const { positions: current } = getSceneState();
        updateSceneState({
          positions: current.map((p) =>
            p.id === posId ? snapshot : p,
          ),
        });
      },
      description,
    };
  }

  // ---------------------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------------------

  subscribeEditor(render);
  subscribeScene(render);
  subscribeEntities(render);
  subscribeChoreography(render);
  subscribeBindings(render);
  render();
}
