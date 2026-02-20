/**
 * Compositor view — filter/routing editor panel.
 *
 * Renders as a collapsible panel in the horizontal connector bar area.
 * Shows filter cards: source → type filter → tag → route target.
 * Each card can be enabled/disabled, edited, or removed.
 */

import {
  getCompositorState,
  addCompositorFilter,
  removeCompositorFilter,
  updateCompositorFilter,
  toggleCompositorFilter,
  toggleCompositorEditor,
  subscribeCompositor,
} from "../state/compositor-state.js";
import {
  getSignalSourcesState,
  subscribeSignalSources,
} from "../state/signal-source-state.js";
import {
  getChoreographyState,
  subscribeChoreography,
} from "../state/choreography-state.js";
import type { SignalType } from "../types.js";

// ---------------------------------------------------------------------------
// Signal types for filter dropdown
// ---------------------------------------------------------------------------

const SIGNAL_TYPES: SignalType[] = [
  "task_dispatch", "tool_call", "tool_result",
  "token_usage", "agent_state_change", "error", "completion",
];

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let containerEl: HTMLElement | null = null;
let editorEl: HTMLElement | null = null;
let initialized = false;

/**
 * Initialize the compositor view.
 * Call after the horizontal connector bar is created.
 * The compositor panel expands below the connector bar.
 */
export function initCompositorView(parent: HTMLElement): void {
  if (initialized) return;
  initialized = true;

  containerEl = parent;

  // Toggle button (added to the connector bar)
  const toggleBtn = document.createElement("button");
  toggleBtn.className = "compositor-toggle";
  toggleBtn.textContent = "⚡ Compositor";
  toggleBtn.title = "Toggle compositor filter editor";
  toggleBtn.addEventListener("click", () => toggleCompositorEditor());
  containerEl.appendChild(toggleBtn);

  // Editor panel (collapsible)
  editorEl = document.createElement("div");
  editorEl.className = "compositor-editor";
  editorEl.hidden = true;
  containerEl.appendChild(editorEl);

  subscribeCompositor(render);
  subscribeSignalSources(render);
  subscribeChoreography(render);
  render();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  if (!editorEl) return;

  const { filters, editorVisible } = getCompositorState();
  editorEl.hidden = !editorVisible;

  if (!editorVisible) return;

  editorEl.innerHTML = "";

  // Header
  const header = document.createElement("div");
  header.className = "compositor-header";

  const title = document.createElement("span");
  title.className = "compositor-title";
  title.textContent = "Signal Compositor";
  header.appendChild(title);

  const addBtn = document.createElement("button");
  addBtn.className = "compositor-add-btn";
  addBtn.textContent = "+ Add Filter";
  addBtn.addEventListener("click", () => {
    addCompositorFilter({
      sourceId: "*",
      typeFilter: null,
      tag: null,
      routeTo: null,
      enabled: true,
    });
  });
  header.appendChild(addBtn);

  editorEl.appendChild(header);

  // Filter cards
  if (filters.length === 0) {
    const empty = document.createElement("div");
    empty.className = "compositor-empty";
    empty.textContent = "No filters. Add one to route and transform signals.";
    editorEl.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "compositor-list";

  for (const filter of filters) {
    list.appendChild(renderFilterCard(filter));
  }

  editorEl.appendChild(list);
}

function renderFilterCard(filter: ReturnType<typeof getCompositorState>["filters"][number]): HTMLElement {
  const card = document.createElement("div");
  card.className = `compositor-card${filter.enabled ? "" : " compositor-card--disabled"}`;

  // Enable toggle
  const toggle = document.createElement("button");
  toggle.className = `compositor-card-toggle${filter.enabled ? " compositor-card-toggle--on" : ""}`;
  toggle.textContent = filter.enabled ? "●" : "○";
  toggle.title = filter.enabled ? "Disable filter" : "Enable filter";
  toggle.addEventListener("click", () => toggleCompositorFilter(filter.id));
  card.appendChild(toggle);

  // Source selector
  const sourceSelect = document.createElement("select");
  sourceSelect.className = "compositor-select";
  const allOpt = document.createElement("option");
  allOpt.value = "*";
  allOpt.textContent = "All sources";
  if (filter.sourceId === "*") allOpt.selected = true;
  sourceSelect.appendChild(allOpt);

  const { sources } = getSignalSourcesState();
  for (const src of sources) {
    const opt = document.createElement("option");
    opt.value = src.id;
    opt.textContent = src.name;
    if (src.id === filter.sourceId) opt.selected = true;
    sourceSelect.appendChild(opt);
  }
  sourceSelect.addEventListener("change", () => {
    updateCompositorFilter(filter.id, { sourceId: sourceSelect.value });
  });
  card.appendChild(sourceSelect);

  // Arrow
  const arrow1 = document.createElement("span");
  arrow1.className = "compositor-arrow";
  arrow1.textContent = "→";
  card.appendChild(arrow1);

  // Type filter
  const typeSelect = document.createElement("select");
  typeSelect.className = "compositor-select";
  const anyOpt = document.createElement("option");
  anyOpt.value = "";
  anyOpt.textContent = "All types";
  if (!filter.typeFilter) anyOpt.selected = true;
  typeSelect.appendChild(anyOpt);

  for (const t of SIGNAL_TYPES) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t.replace(/_/g, " ");
    if (t === filter.typeFilter) opt.selected = true;
    typeSelect.appendChild(opt);
  }
  typeSelect.addEventListener("change", () => {
    updateCompositorFilter(filter.id, {
      typeFilter: (typeSelect.value || null) as SignalType | null,
    });
  });
  card.appendChild(typeSelect);

  // Arrow
  const arrow2 = document.createElement("span");
  arrow2.className = "compositor-arrow";
  arrow2.textContent = "→";
  card.appendChild(arrow2);

  // Tag input
  const tagInput = document.createElement("input");
  tagInput.className = "compositor-tag-input";
  tagInput.type = "text";
  tagInput.placeholder = "tag";
  tagInput.value = filter.tag ?? "";
  tagInput.addEventListener("change", () => {
    updateCompositorFilter(filter.id, { tag: tagInput.value || null });
  });
  card.appendChild(tagInput);

  // Route target
  const routeSelect = document.createElement("select");
  routeSelect.className = "compositor-select";
  const passOpt = document.createElement("option");
  passOpt.value = "";
  passOpt.textContent = "Pass-through";
  if (!filter.routeTo) passOpt.selected = true;
  routeSelect.appendChild(passOpt);

  const { choreographies } = getChoreographyState();
  for (const choreo of choreographies) {
    const opt = document.createElement("option");
    opt.value = choreo.id;
    opt.textContent = `on:${choreo.on}`;
    if (choreo.id === filter.routeTo) opt.selected = true;
    routeSelect.appendChild(opt);
  }
  routeSelect.addEventListener("change", () => {
    updateCompositorFilter(filter.id, { routeTo: routeSelect.value || null });
  });
  card.appendChild(routeSelect);

  // Remove button
  const removeBtn = document.createElement("button");
  removeBtn.className = "compositor-remove-btn";
  removeBtn.textContent = "×";
  removeBtn.title = "Remove filter";
  removeBtn.addEventListener("click", () => removeCompositorFilter(filter.id));
  card.appendChild(removeBtn);

  return card;
}
