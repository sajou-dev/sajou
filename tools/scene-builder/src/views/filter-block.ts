/**
 * Filter block — C-shape (pince) wrapper for choreography steps.
 *
 * Renders a visual C-shape container around the action steps,
 * displaying the `when` condition as a filter bar at the top.
 * The C-shape head summarizes conditions ("always" or "content contains hello").
 * Clicking the head opens a popover with the full condition editor.
 *
 * Extracted from node-detail-inline.ts and step-chain.ts.
 */

import type {
  ChoreographyDef,
  ChoreographyStepDef,
  WhenConditionDef,
  WhenOperatorDef,
} from "../types.js";
import {
  getChoreographyState,
} from "../state/choreography-state.js";
import {
  FILTER_BLOCK_COLOR,
  updateChoreographyCmd,
} from "./step-commands.js";
import type { StepChainCallbacks } from "./step-chain.js";

// ---------------------------------------------------------------------------
// When operators — migrated from node-detail-inline.ts
// ---------------------------------------------------------------------------

/** Supported when operators. */
const WHEN_OPERATORS = ["contains", "equals", "matches", "gt", "lt", "exists"] as const;
type WhenOp = typeof WHEN_OPERATORS[number];

/** A single editable condition row in the when editor. */
interface WhenRow {
  path: string;
  op: WhenOp;
  value: string;
}

/** Parse existing `when` clause into flat rows for editing. Only handles the AND (object) form. */
function parseWhenRows(choreo: ChoreographyDef): WhenRow[] {
  const when = choreo.when;
  if (!when) return [];

  // Normalize: if array (OR), take the first condition for simplicity
  const condition: WhenConditionDef = Array.isArray(when) ? (when[0] ?? {}) : when;

  const rows: WhenRow[] = [];
  for (const [path, ops] of Object.entries(condition)) {
    const opObj = ops as WhenOperatorDef;
    for (const op of WHEN_OPERATORS) {
      if (op === "exists" && opObj.exists !== undefined) {
        rows.push({ path, op: "exists", value: String(opObj.exists) });
      } else if (op !== "exists" && opObj[op] !== undefined) {
        rows.push({ path, op, value: String(opObj[op]) });
      }
    }
    // If no known operator found, still show the path
    if (rows.length === 0 || rows[rows.length - 1]!.path !== path) {
      rows.push({ path, op: "contains", value: "" });
    }
  }
  return rows;
}

/** Build a WhenConditionDef from rows, or undefined if empty/incomplete. */
function buildWhenClause(rows: WhenRow[]): WhenConditionDef | undefined {
  const validRows = rows.filter((r) => r.path.trim() !== "");
  if (validRows.length === 0) return undefined;

  const clause: WhenConditionDef = {};
  for (const row of validRows) {
    const ops: WhenOperatorDef = clause[row.path] ?? {};
    if (row.op === "exists") {
      ops.exists = row.value !== "false";
    } else if (row.op === "gt" || row.op === "lt") {
      const num = Number(row.value);
      if (!isNaN(num)) ops[row.op] = num;
    } else {
      ops[row.op] = row.value;
    }
    clause[row.path] = ops;
  }
  return clause;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/** Produce a short text summary of the when conditions. */
function summarizeWhen(choreo: ChoreographyDef): string {
  const rows = parseWhenRows(choreo);
  if (rows.length === 0) return "always";
  if (rows.length === 1) {
    const r = rows[0]!;
    if (r.op === "exists") return `${r.path} exists`;
    return `${r.path} ${r.op} ${r.value}`.trim();
  }
  return `${rows.length} conditions`;
}

// ---------------------------------------------------------------------------
// Popover — singleton condition editor
// ---------------------------------------------------------------------------

let popoverEl: HTMLElement | null = null;
let popoverCleanup: (() => void) | null = null;
let popoverChoreoId: string | null = null;

/** Close the filter condition popover. */
function closeFilterPopover(): void {
  if (popoverCleanup) {
    popoverCleanup();
    popoverCleanup = null;
  }
  if (popoverEl) {
    popoverEl.remove();
    popoverEl = null;
  }
  popoverChoreoId = null;
}

/** Re-read choreography from store. */
function getFreshChoreo(id: string): ChoreographyDef | undefined {
  const { choreographies } = getChoreographyState();
  return choreographies.find((c) => c.id === id);
}

/** Save the current condition rows from the DOM back to the choreography state. */
function saveWhenFromDom(choreoId: string, body: HTMLElement): void {
  const rowEls = body.querySelectorAll(".nc-when-row");
  const rows: WhenRow[] = [];
  for (const el of rowEls) {
    const pathInput = el.querySelector<HTMLInputElement>(".nc-when-path");
    const opSelect = el.querySelector<HTMLSelectElement>(".nc-when-op");
    const valueInput = el.querySelector<HTMLInputElement>(".nc-when-value");
    if (pathInput && opSelect) {
      rows.push({
        path: pathInput.value.trim(),
        op: opSelect.value as WhenOp,
        value: valueInput?.value ?? "",
      });
    }
  }
  const clause = buildWhenClause(rows);
  updateChoreographyCmd(choreoId, { when: clause });
}

/** Create a single condition row element for the popover. */
function createConditionRow(
  choreoId: string,
  body: HTMLElement,
  initial: WhenRow,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "nc-when-row";

  // Path input
  const pathInput = document.createElement("input");
  pathInput.type = "text";
  pathInput.className = "nc-when-path";
  pathInput.value = initial.path;
  pathInput.placeholder = "content";
  pathInput.addEventListener("change", () => saveWhenFromDom(choreoId, body));

  // Operator select
  const opSelect = document.createElement("select");
  opSelect.className = "nc-when-op";
  for (const op of WHEN_OPERATORS) {
    const opt = document.createElement("option");
    opt.value = op;
    opt.textContent = op;
    if (op === initial.op) opt.selected = true;
    opSelect.appendChild(opt);
  }
  opSelect.addEventListener("change", () => {
    // Show/hide value input for "exists"
    valueInput.style.display = opSelect.value === "exists" ? "none" : "";
    saveWhenFromDom(choreoId, body);
  });

  // Value input
  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.className = "nc-when-value";
  valueInput.value = initial.value;
  valueInput.placeholder = "value";
  valueInput.style.display = initial.op === "exists" ? "none" : "";
  valueInput.addEventListener("change", () => saveWhenFromDom(choreoId, body));

  // Remove button
  const removeBtn = document.createElement("span");
  removeBtn.className = "nc-when-remove";
  removeBtn.textContent = "\u00D7";
  removeBtn.title = "Remove condition";
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    row.remove();
    saveWhenFromDom(choreoId, body);
  });

  row.appendChild(pathInput);
  row.appendChild(opSelect);
  row.appendChild(valueInput);
  row.appendChild(removeBtn);
  return row;
}

/** Open the filter condition editor popover anchored to the C-shape head. */
function openFilterPopover(choreoId: string, anchorEl: HTMLElement): void {
  // Toggle off if same
  if (popoverChoreoId === choreoId && popoverEl) {
    closeFilterPopover();
    return;
  }

  closeFilterPopover();
  popoverChoreoId = choreoId;

  const choreo = getFreshChoreo(choreoId);
  if (!choreo) return;

  // Create popover element
  const el = document.createElement("div");
  el.className = "nc-popover";

  // Arrow
  const arrow = document.createElement("div");
  arrow.className = "nc-popover-arrow";
  el.appendChild(arrow);

  // Content
  const content = document.createElement("div");
  content.className = "nc-popover-content";

  // Title
  const title = document.createElement("div");
  title.className = "nc-popover-subtitle";
  title.textContent = "filter conditions";
  title.style.borderTop = "none";
  title.style.marginTop = "0";
  content.appendChild(title);

  // Condition rows
  const body = document.createElement("div");
  body.className = "nc-when-body";
  body.style.display = "";

  const rows = parseWhenRows(choreo);
  for (const row of rows) {
    body.appendChild(createConditionRow(choreoId, body, row));
  }

  // If no rows, add an empty one
  if (rows.length === 0) {
    body.appendChild(createConditionRow(choreoId, body, { path: "", op: "contains", value: "" }));
  }

  // Add condition button
  const addBtn = document.createElement("button");
  addBtn.className = "nc-when-add";
  addBtn.textContent = "+ condition";
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    body.insertBefore(createConditionRow(choreoId, body, { path: "", op: "contains", value: "" }), addBtn);
  });
  body.appendChild(addBtn);

  content.appendChild(body);
  el.appendChild(content);
  document.body.appendChild(el);
  popoverEl = el;

  // Position below the anchor
  positionPopover(el, arrow, anchorEl);

  // Close on click outside or Escape
  const onDocClick = (e: MouseEvent) => {
    if (el.contains(e.target as Node)) return;
    if (anchorEl.contains(e.target as Node)) return;
    closeFilterPopover();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeFilterPopover();
  };

  requestAnimationFrame(() => {
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
  });

  popoverCleanup = () => {
    document.removeEventListener("mousedown", onDocClick);
    document.removeEventListener("keydown", onKeyDown);
  };
}

/** Position the popover below (or above) the anchor element. */
function positionPopover(el: HTMLElement, arrow: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const popoverWidth = 280;
  const margin = 8;

  let top = rect.bottom + margin;
  let left = rect.left + rect.width / 2 - popoverWidth / 2;

  // Clamp horizontal
  left = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, left));

  // If below would overflow viewport, place above
  const estimatedHeight = 200;
  if (top + estimatedHeight > window.innerHeight - 8) {
    top = rect.top - estimatedHeight - margin;
    el.classList.add("nc-popover--above");
    arrow.style.top = "auto";
    arrow.style.bottom = "-6px";
  } else {
    el.classList.remove("nc-popover--above");
    arrow.style.top = "-6px";
    arrow.style.bottom = "auto";
  }

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.width = `${popoverWidth}px`;

  // Arrow horizontal position
  const arrowLeft = rect.left + rect.width / 2 - left - 6;
  arrow.style.left = `${Math.max(8, Math.min(popoverWidth - 20, arrowLeft))}px`;
}

// ---------------------------------------------------------------------------
// C-shape renderer
// ---------------------------------------------------------------------------

/**
 * Render the C-shape filter block wrapping the choreography steps.
 *
 * Structure:
 *   .nc-cshape
 *     .nc-cshape-head  — filter summary, click to edit
 *     .nc-cshape-body  — indented steps + drop zone
 *     .nc-cshape-foot  — visual closure
 */
export function renderFilterCShape(
  choreo: ChoreographyDef,
  callbacks: StepChainCallbacks,
  renderBlock: (
    step: ChoreographyStepDef,
    isSelected: boolean,
    onClick: (stepId: string) => void,
    choreoId: string,
    isTail: boolean,
  ) => HTMLElement,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "nc-cshape";
  wrapper.style.setProperty("--filter-color", FILTER_BLOCK_COLOR);

  // ── Head: filter summary bar ──
  wrapper.appendChild(renderFilterHead(choreo));

  // ── Body: indented steps + drop zone ──
  wrapper.appendChild(renderFilterBody(choreo, callbacks, renderBlock));

  // ── Foot: closure bar ──
  wrapper.appendChild(renderFilterFoot());

  return wrapper;
}

/** Render the top bar of the C-shape: funnel icon + "filter" + summary. */
function renderFilterHead(choreo: ChoreographyDef): HTMLElement {
  const head = document.createElement("div");
  head.className = "nc-cshape-head";

  // Funnel icon
  const icon = document.createElement("span");
  icon.className = "nc-block-icon";
  icon.textContent = "\u25E7"; // ◧ (filter-like)
  icon.style.color = FILTER_BLOCK_COLOR;
  head.appendChild(icon);

  // "filter" keyword
  const kw = document.createElement("span");
  kw.className = "nc-block-action";
  kw.textContent = "filter";
  head.appendChild(kw);

  // Summary text
  const summary = document.createElement("span");
  summary.className = "nc-inline-label";
  summary.textContent = summarizeWhen(choreo);
  summary.style.color = "var(--color-text-muted)";
  head.appendChild(summary);

  // Click → open condition popover
  head.addEventListener("click", (e) => {
    e.stopPropagation();
    openFilterPopover(choreo.id, head);
  });

  return head;
}

/** Render the indented body of the C-shape containing step blocks + drop zone. */
function renderFilterBody(
  choreo: ChoreographyDef,
  callbacks: StepChainCallbacks,
  renderBlockFn: (
    step: ChoreographyStepDef,
    isSelected: boolean,
    onClick: (stepId: string) => void,
    choreoId: string,
    isTail: boolean,
  ) => HTMLElement,
): HTMLElement {
  const body = document.createElement("div");
  body.className = "nc-cshape-body";

  const { selectedStepId } = getChoreographyState();
  const hasSteps = choreo.steps.length > 0;

  for (let i = 0; i < choreo.steps.length; i++) {
    const step = choreo.steps[i]!;
    const isTail = i === choreo.steps.length - 1;
    const block = renderBlockFn(
      step, step.id === selectedStepId, callbacks.onStepClick,
      choreo.id, isTail,
    );
    body.appendChild(block);
  }

  // Drop zone hint
  const dropHint = document.createElement("div");
  dropHint.className = "nc-chain-drop-hint";
  dropHint.textContent = hasSteps ? "+" : "drop actions here";
  dropHint.title = "Drag an action from the palette";
  body.appendChild(dropHint);

  return body;
}

/** Render the bottom closure bar of the C-shape. */
function renderFilterFoot(): HTMLElement {
  const foot = document.createElement("div");
  foot.className = "nc-cshape-foot";
  return foot;
}
