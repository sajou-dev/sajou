/**
 * Entity Editor panel.
 *
 * CRUD interface for entity definitions. Users create entities,
 * configure their visual type (sprite/spritesheet/GIF), set
 * display dimensions, tags, defaults, and preview the result.
 * Fills the "entity-editor" floating panel shell.
 */

import {
  getEntityStore,
  getSelectedEntity,
  setEntity,
  removeEntity,
  selectEntity,
  subscribeEntities,
} from "../state/entity-store.js";
import { getAssetStore, subscribeAssets } from "../state/asset-store.js";
import type {
  EntityEntry,
  EntityVisual,
  SpriteVisual,
  SpritesheetVisual,
  GifVisual,
  SpriteAnimation,
} from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique entity ID. */
function generateId(): string {
  return `entity-${Date.now().toString(36)}`;
}

/** Create a default entity entry. */
function createDefaultEntity(id: string): EntityEntry {
  return {
    id,
    tags: [],
    displayWidth: 64,
    displayHeight: 64,
    fallbackColor: "#666666",
    defaults: { scale: 1, anchor: [0.5, 0.5], zIndex: 0, opacity: 1 },
    visual: { type: "sprite", source: "" },
  };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** State for the ratio lock toggle. */
let ratioLocked = true;

/** Size unit mode: px (absolute) or % (relative to asset natural size). */
let sizeUnit: "px" | "%" = "px";

/** Initialize the Entity Editor panel content. */
export function initEntityEditorPanel(contentEl: HTMLElement): void {
  contentEl.innerHTML = "";
  contentEl.classList.add("ee-panel");

  // Split layout: entity list (left) + editor form (right)
  const listPane = document.createElement("div");
  listPane.className = "ee-list-pane";

  const formPane = document.createElement("div");
  formPane.className = "ee-form-pane";

  contentEl.appendChild(listPane);
  contentEl.appendChild(formPane);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function render(): void {
    renderList();
    renderForm();
  }

  function renderList(): void {
    listPane.innerHTML = "";

    // New entity button
    const newBtn = document.createElement("button");
    newBtn.className = "ee-new-btn";
    newBtn.textContent = "+ New Entity";
    newBtn.addEventListener("click", () => {
      const id = generateId();
      const entry = createDefaultEntity(id);
      setEntity(id, entry);
      selectEntity(id);
    });
    listPane.appendChild(newBtn);

    // Entity list
    const store = getEntityStore();
    const entries = Object.values(store.entities);

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "ee-empty";
      empty.textContent = "No entities defined yet.";
      listPane.appendChild(empty);
      return;
    }

    for (const entry of entries) {
      const item = document.createElement("div");
      item.className = "ee-list-item" + (store.selectedEntityId === entry.id ? " ee-list-item--selected" : "");

      const label = document.createElement("span");
      label.className = "ee-list-label";
      label.textContent = entry.id;

      const tags = document.createElement("span");
      tags.className = "ee-list-tags";
      tags.textContent = entry.tags.join(", ");

      item.appendChild(label);
      item.appendChild(tags);
      item.addEventListener("click", () => selectEntity(entry.id));
      listPane.appendChild(item);
    }
  }

  function renderForm(): void {
    formPane.innerHTML = "";

    const entity = getSelectedEntity();
    if (!entity) {
      formPane.innerHTML = '<p class="ee-empty">Select or create an entity.</p>';
      return;
    }

    // Make a mutable copy for editing
    const form = document.createElement("div");
    form.className = "ee-form";

    // ID (readonly)
    form.appendChild(createField("ID", createReadonly(entity.id)));

    // Tags
    const tagsInput = createTextInput(entity.tags.join(", "), (val) => {
      const tags = val.split(",").map((t) => t.trim()).filter(Boolean);
      setEntity(entity.id, { ...entity, tags });
    });
    form.appendChild(createField("Tags", tagsInput));

    // Display size with ratio lock + px/% unit toggle
    const sizeContainer = document.createElement("div");
    sizeContainer.className = "ee-size-container";

    const sizeRow = document.createElement("div");
    sizeRow.className = "ee-row ee-size-row";

    const ratio = entity.displayWidth / (entity.displayHeight || 1);

    // Resolve natural dimensions from asset
    const assetForSize = getAssetStore().assets.find((a) => a.path === entity.visual.source);
    const natW = assetForSize?.naturalWidth ?? entity.displayWidth;
    const natH = assetForSize?.naturalHeight ?? entity.displayHeight;

    // Current values depending on unit
    const displayW = sizeUnit === "%"
      ? Math.round((entity.displayWidth / natW) * 100)
      : entity.displayWidth;
    const displayH = sizeUnit === "%"
      ? Math.round((entity.displayHeight / natH) * 100)
      : entity.displayHeight;
    const step = sizeUnit === "%" ? 1 : 1;

    sizeRow.appendChild(createNumberField("W", displayW, (v) => {
      const pxW = sizeUnit === "%" ? Math.round((v / 100) * natW) : v;
      if (ratioLocked) {
        const pxH = Math.round(pxW / ratio);
        setEntity(entity.id, { ...entity, displayWidth: pxW, displayHeight: pxH });
      } else {
        setEntity(entity.id, { ...entity, displayWidth: pxW });
      }
    }, step));

    // Ratio lock button
    const lockBtn = document.createElement("button");
    lockBtn.className = "ee-ratio-lock" + (ratioLocked ? " ee-ratio-lock--active" : "");
    lockBtn.innerHTML = ratioLocked
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><path d="M8 18v4"/><path d="M16 18v4"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><path d="M8 18v4"/><path d="M16 18v4"/><rect x="2" y="6" width="20" height="12" rx="2" stroke-dasharray="4 2"/></svg>';
    lockBtn.title = ratioLocked ? "Unlock ratio" : "Lock ratio";
    lockBtn.addEventListener("click", () => {
      ratioLocked = !ratioLocked;
      render();
    });
    sizeRow.appendChild(lockBtn);

    sizeRow.appendChild(createNumberField("H", displayH, (v) => {
      const pxH = sizeUnit === "%" ? Math.round((v / 100) * natH) : v;
      if (ratioLocked) {
        const pxW = Math.round(pxH * ratio);
        setEntity(entity.id, { ...entity, displayWidth: pxW, displayHeight: pxH });
      } else {
        setEntity(entity.id, { ...entity, displayHeight: pxH });
      }
    }, step));

    // Unit toggle: px / %
    const unitBtn = document.createElement("button");
    unitBtn.className = "ee-unit-toggle";
    unitBtn.textContent = sizeUnit;
    unitBtn.title = sizeUnit === "px" ? "Switch to %" : "Switch to px";
    unitBtn.addEventListener("click", () => {
      sizeUnit = sizeUnit === "px" ? "%" : "px";
      render();
    });
    sizeRow.appendChild(unitBtn);

    sizeContainer.appendChild(sizeRow);

    // Show natural dimensions as hint when in % mode
    if (sizeUnit === "%") {
      const hint = document.createElement("span");
      hint.className = "ee-size-hint";
      hint.textContent = `${natW} \u00D7 ${natH} px (original)`;
      sizeContainer.appendChild(hint);
    }

    form.appendChild(createField("Size", sizeContainer));

    // Fallback color
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "ee-color";
    colorInput.value = entity.fallbackColor;
    colorInput.addEventListener("change", () =>
      setEntity(entity.id, { ...entity, fallbackColor: colorInput.value }));
    form.appendChild(createField("Color", colorInput));

    // Defaults
    const defaultsRow = document.createElement("div");
    defaultsRow.className = "ee-row";
    defaultsRow.appendChild(createNumberField("Scale", entity.defaults.scale ?? 1, (v) =>
      setEntity(entity.id, { ...entity, defaults: { ...entity.defaults, scale: v } }), 0.1));
    defaultsRow.appendChild(createNumberField("Z", entity.defaults.zIndex ?? 0, (v) =>
      setEntity(entity.id, { ...entity, defaults: { ...entity.defaults, zIndex: v } })));
    defaultsRow.appendChild(createNumberField("Opacity", entity.defaults.opacity ?? 1, (v) =>
      setEntity(entity.id, { ...entity, defaults: { ...entity.defaults, opacity: v } }), 0.1));
    form.appendChild(createField("Defaults", defaultsRow));

    // Visual type selector
    const typeRow = document.createElement("div");
    typeRow.className = "ee-type-row";
    for (const vType of ["sprite", "spritesheet", "gif"] as const) {
      const btn = document.createElement("button");
      btn.className = "ee-type-btn" + (entity.visual.type === vType ? " ee-type-btn--active" : "");
      btn.textContent = vType;
      btn.addEventListener("click", () => {
        const visual = switchVisualType(entity, vType);
        setEntity(entity.id, { ...entity, visual });
      });
      typeRow.appendChild(btn);
    }
    form.appendChild(createField("Visual", typeRow));

    // Visual-specific fields
    form.appendChild(renderVisualFields(entity));

    // Preview canvas
    const previewCanvas = document.createElement("canvas");
    previewCanvas.className = "ee-preview";
    previewCanvas.width = 96;
    previewCanvas.height = 96;
    form.appendChild(createField("Preview", previewCanvas));
    renderPreview(previewCanvas, entity);

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ee-delete-btn";
    deleteBtn.textContent = "Delete Entity";
    deleteBtn.addEventListener("click", () => {
      removeEntity(entity.id);
    });
    form.appendChild(deleteBtn);

    formPane.appendChild(form);
  }

  // ---------------------------------------------------------------------------
  // Visual type switching
  // ---------------------------------------------------------------------------

  function switchVisualType(entity: EntityEntry, target: "sprite" | "spritesheet" | "gif"): EntityVisual {
    const current = entity.visual;
    if (current.type === target) return current;
    const source = current.source;

    // Use entity display dimensions as sensible defaults for frame size
    const fw = entity.displayWidth || 64;
    const fh = entity.displayHeight || 64;

    switch (target) {
      case "sprite":
        return { type: "sprite", source } as SpriteVisual;
      case "spritesheet":
        return {
          type: "spritesheet",
          source,
          frameWidth: fw,
          frameHeight: fh,
          animations: { default: { frames: [0], fps: 10, loop: true } },
        } as SpritesheetVisual;
      case "gif":
        return { type: "gif", source, fps: 10, loop: true } as GifVisual;
    }
  }

  // ---------------------------------------------------------------------------
  // Visual-specific form fields
  // ---------------------------------------------------------------------------

  function renderVisualFields(entity: EntityEntry): HTMLElement {
    const container = document.createElement("div");
    container.className = "ee-visual-fields";

    const visual = entity.visual;
    const assetStore = getAssetStore();
    const assetOptions = assetStore.assets.map((a) => a.path);

    // Asset selector (common to all types)
    const assetSelect = document.createElement("select");
    assetSelect.className = "ee-select";
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "Select asset\u2026";
    assetSelect.appendChild(emptyOpt);
    for (const path of assetOptions) {
      const opt = document.createElement("option");
      opt.value = path;
      opt.textContent = path;
      if (path === visual.source) opt.selected = true;
      assetSelect.appendChild(opt);
    }
    assetSelect.addEventListener("change", () => {
      const newVisual = { ...visual, source: assetSelect.value } as EntityVisual;
      setEntity(entity.id, { ...entity, visual: newVisual });
    });
    container.appendChild(createField("Asset", assetSelect));

    // Type-specific fields
    if (visual.type === "spritesheet") {
      const ssRow = document.createElement("div");
      ssRow.className = "ee-row";
      ssRow.appendChild(createNumberField("Frame W", visual.frameWidth, (v) => {
        const v2 = { ...visual, frameWidth: v } as SpritesheetVisual;
        setEntity(entity.id, { ...entity, visual: v2 });
      }));
      ssRow.appendChild(createNumberField("Frame H", visual.frameHeight, (v) => {
        const v2 = { ...visual, frameHeight: v } as SpritesheetVisual;
        setEntity(entity.id, { ...entity, visual: v2 });
      }));
      container.appendChild(createField("Frame size", ssRow));

      // Simplified animations editor
      container.appendChild(renderAnimationsEditor(entity, visual));
    }

    if (visual.type === "gif") {
      const gifRow = document.createElement("div");
      gifRow.className = "ee-row";
      gifRow.appendChild(createNumberField("FPS", visual.fps ?? 10, (v) => {
        const v2 = { ...visual, fps: v } as GifVisual;
        setEntity(entity.id, { ...entity, visual: v2 });
      }));

      const loopCheck = document.createElement("input");
      loopCheck.type = "checkbox";
      loopCheck.checked = visual.loop !== false;
      loopCheck.addEventListener("change", () => {
        const v2 = { ...visual, loop: loopCheck.checked } as GifVisual;
        setEntity(entity.id, { ...entity, visual: v2 });
      });
      const loopLabel = document.createElement("label");
      loopLabel.className = "ee-check-label";
      loopLabel.appendChild(loopCheck);
      loopLabel.append(" Loop");

      gifRow.appendChild(loopLabel);
      container.appendChild(createField("GIF", gifRow));
    }

    return container;
  }

  // ---------------------------------------------------------------------------
  // Animations editor (for spritesheet)
  // ---------------------------------------------------------------------------

  function renderAnimationsEditor(entity: EntityEntry, visual: SpritesheetVisual): HTMLElement {
    const container = document.createElement("div");
    container.className = "ee-anims";

    const animNames = Object.keys(visual.animations);
    for (const name of animNames) {
      const anim = visual.animations[name]!;
      const row = document.createElement("div");
      row.className = "ee-anim-row";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "ee-input ee-anim-name";
      nameInput.value = name;
      nameInput.addEventListener("change", () => {
        const newName = nameInput.value.trim();
        if (!newName || newName === name) return;
        const anims = { ...visual.animations };
        anims[newName] = anims[name]!;
        delete anims[name];
        const v2 = { ...visual, animations: anims } as SpritesheetVisual;
        setEntity(entity.id, { ...entity, visual: v2 });
      });

      const framesInput = document.createElement("input");
      framesInput.type = "text";
      framesInput.className = "ee-input ee-anim-frames";
      framesInput.value = anim.frames.join(", ");
      framesInput.placeholder = "0, 1, 2, 3";
      framesInput.addEventListener("change", () => {
        const frames = framesInput.value.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
        const anims = { ...visual.animations, [name]: { ...anim, frames } };
        const v2 = { ...visual, animations: anims } as SpritesheetVisual;
        setEntity(entity.id, { ...entity, visual: v2 });
      });

      const fpsInput = createNumberField("fps", anim.fps, (v) => {
        const anims = { ...visual.animations, [name]: { ...anim, fps: v } as SpriteAnimation };
        const v2 = { ...visual, animations: anims } as SpritesheetVisual;
        setEntity(entity.id, { ...entity, visual: v2 });
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "ee-anim-remove";
      removeBtn.textContent = "\u00D7";
      removeBtn.addEventListener("click", () => {
        const anims = { ...visual.animations };
        delete anims[name];
        const v2 = { ...visual, animations: anims } as SpritesheetVisual;
        setEntity(entity.id, { ...entity, visual: v2 });
      });

      row.appendChild(nameInput);
      row.appendChild(framesInput);
      row.appendChild(fpsInput);
      row.appendChild(removeBtn);
      container.appendChild(row);
    }

    // Add animation button
    const addBtn = document.createElement("button");
    addBtn.className = "ee-btn";
    addBtn.textContent = "+ Animation";
    addBtn.addEventListener("click", () => {
      const newName = `anim-${animNames.length}`;
      const anims = { ...visual.animations, [newName]: { frames: [0], fps: 10, loop: true } };
      const v2 = { ...visual, animations: anims } as SpritesheetVisual;
      setEntity(entity.id, { ...entity, visual: v2 });
    });
    container.appendChild(addBtn);

    return container;
  }

  // ---------------------------------------------------------------------------
  // Preview renderer
  // ---------------------------------------------------------------------------

  function renderPreview(canvas: HTMLCanvasElement, entity: EntityEntry): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Find the asset
    const assetStore = getAssetStore();
    const asset = assetStore.assets.find((a) => a.path === entity.visual.source);
    if (!asset) {
      // Fallback color
      ctx.fillStyle = entity.fallbackColor;
      ctx.fillRect(16, 16, 64, 64);
      return;
    }

    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = asset.objectUrl;
  }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------

  function createField(label: string, control: HTMLElement): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "ee-field";
    const lbl = document.createElement("label");
    lbl.className = "ee-field-label";
    lbl.textContent = label;
    wrapper.appendChild(lbl);
    wrapper.appendChild(control);
    return wrapper;
  }

  function createReadonly(value: string): HTMLElement {
    const span = document.createElement("span");
    span.className = "ee-readonly";
    span.textContent = value;
    return span;
  }

  function createTextInput(value: string, onChange: (val: string) => void): HTMLElement {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "ee-input";
    input.value = value;
    input.addEventListener("change", () => onChange(input.value));
    return input;
  }

  function createNumberField(label: string, value: number, onChange: (v: number) => void, step = 1): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "ee-num-field";
    const lbl = document.createElement("span");
    lbl.className = "ee-num-label";
    lbl.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.className = "ee-input ee-num-input";
    input.value = String(value);
    input.step = String(step);
    input.addEventListener("change", () => onChange(Number(input.value)));
    wrapper.appendChild(lbl);
    wrapper.appendChild(input);
    return wrapper;
  }

  // ---------------------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------------------

  subscribeEntities(render);
  subscribeAssets(render);
  render();
}
