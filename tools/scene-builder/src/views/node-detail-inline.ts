/**
 * Node detail header — compact header rendered above the step chain.
 *
 * Displays: wired input badges (or signal type fallback), interrupts toggle.
 * The step list and step detail have been replaced by the step chain (step-chain.ts)
 * and step popover (step-popover.ts).
 */

import type { ChoreographyDef, WhenConditionDef, WhenOperatorDef } from "../types.js";
import {
  getWiringState,
  removeWire,
} from "../state/wiring-state.js";
import {
  getChoreoInputInfo,
  getSourcesForChoreo,
} from "../state/wiring-queries.js";
import { getSignalSourcesState } from "../state/signal-source-state.js";
import {
  SIGNAL_TYPES,
  SIGNAL_TYPE_COLORS,
  updateChoreographyCmd,
} from "./step-commands.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the compact header section for a choreography node.
 *
 * Contains: wired input badges (or signal type dropdown), interrupts checkbox.
 * Exported as both `renderNodeDetail` (legacy compat) and `renderNodeHeader`.
 */
export function renderNodeDetail(choreo: ChoreographyDef): HTMLElement {
  return renderNodeHeader(choreo);
}

/** Render the compact header for a choreography node (preferred name). */
export function renderNodeHeader(choreo: ChoreographyDef): HTMLElement {
  const header = document.createElement("div");
  header.className = "nc-node-detail";

  // Prevent node drag when interacting with header
  header.addEventListener("mousedown", (e) => e.stopPropagation());

  const section = document.createElement("div");
  section.className = "nc-detail-section";

  // ── Signal type inputs (wire-driven or fallback) ──
  const inputInfo = getChoreoInputInfo(choreo.id);

  if (inputInfo.hasWires) {
    // Wire-driven mode: show wired input badges with detach buttons
    const inputsLabel = document.createElement("div");
    inputsLabel.className = "nc-detail-label";
    inputsLabel.textContent = "inputs";
    section.appendChild(inputsLabel);

    const inputsContainer = document.createElement("div");
    inputsContainer.className = "nc-detail-inputs";

    for (const signalType of inputInfo.wiredTypes) {
      const color = SIGNAL_TYPE_COLORS[signalType] ?? "#6E6E8A";
      const badge = document.createElement("span");
      badge.className = "nc-detail-input-badge";
      badge.style.background = color + "22";
      badge.style.color = color;

      const labelText = document.createElement("span");
      labelText.textContent = signalType.replace(/_/g, " ");
      badge.appendChild(labelText);

      // Detach button
      const detach = document.createElement("span");
      detach.className = "nc-detail-detach";
      detach.textContent = "\u00D7";
      detach.title = `Detach ${signalType}`;
      detach.addEventListener("click", (e) => {
        e.stopPropagation();
        const { wires } = getWiringState();
        const wire = wires.find(
          (w) => w.fromZone === "signal-type" && w.fromId === signalType
            && w.toZone === "choreographer" && w.toId === choreo.id,
        );
        if (wire) removeWire(wire.id);
      });
      badge.appendChild(detach);

      inputsContainer.appendChild(badge);
    }

    section.appendChild(inputsContainer);

    // Source provenance — with orphan detection
    const provenance = getSourcesForChoreo(choreo.id);
    if (provenance.length > 0) {
      const srcEl = document.createElement("div");
      srcEl.className = "nc-detail-sources";
      const { sources } = getSignalSourcesState();

      for (const p of provenance) {
        const src = sources.find((s) => s.id === p.sourceId);
        const isOrphan = !src;

        const entry = document.createElement("span");
        entry.className = isOrphan
          ? "nc-detail-source-entry nc-detail-source--orphan"
          : "nc-detail-source-entry";
        entry.textContent = `${src?.name ?? p.sourceId.slice(0, 8)} → ${p.signalType.replace(/_/g, " ")}`;

        if (isOrphan) {
          // Add remove button for orphaned source→signal-type wires
          const removeBtn = document.createElement("span");
          removeBtn.className = "nc-detail-source-remove";
          removeBtn.textContent = "\u00D7";
          removeBtn.title = "Remove orphaned wire";
          removeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            // Find and remove the orphaned signal→signal-type wire
            const { wires } = getWiringState();
            const orphanWire = wires.find(
              (w) => w.fromZone === "signal" && w.fromId === p.sourceId
                && w.toZone === "signal-type" && w.toId === p.signalType,
            );
            if (orphanWire) removeWire(orphanWire.id);
          });
          entry.appendChild(removeBtn);
        }

        srcEl.appendChild(entry);
      }

      section.appendChild(srcEl);
    }

    const hint = document.createElement("div");
    hint.className = "nc-detail-hint";
    hint.textContent = "Drag signal-type → node to add inputs";
    section.appendChild(hint);
  } else {
    // Fallback mode: show select dropdown for on field
    const onRow = document.createElement("div");
    onRow.className = "nc-detail-row";
    const onLabel = document.createElement("span");
    onLabel.className = "nc-detail-label";
    onLabel.textContent = "on";
    onRow.appendChild(onLabel);

    const onSelect = document.createElement("select");
    onSelect.className = "nc-detail-select";
    for (const st of SIGNAL_TYPES) {
      const opt = document.createElement("option");
      opt.value = st;
      opt.textContent = st;
      if (st === choreo.on) opt.selected = true;
      onSelect.appendChild(opt);
    }
    onSelect.addEventListener("change", () => {
      updateChoreographyCmd(choreo.id, { on: onSelect.value });
    });
    onRow.appendChild(onSelect);
    section.appendChild(onRow);

    const hint = document.createElement("div");
    hint.className = "nc-detail-hint";
    hint.textContent = "Wire a signal-type to override";
    section.appendChild(hint);
  }

  // ── When conditions ──
  section.appendChild(renderWhenEditor(choreo));

  // ── Target entity row ──
  const targetRow = document.createElement("div");
  targetRow.className = "nc-detail-row";
  const targetLabel = document.createElement("span");
  targetLabel.className = "nc-detail-label";
  targetLabel.textContent = "target";
  targetRow.appendChild(targetLabel);

  if (choreo.defaultTargetEntityId) {
    const badge = document.createElement("span");
    badge.className = "nc-target-badge";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = choreo.defaultTargetEntityId;
    badge.appendChild(nameSpan);

    const detach = document.createElement("span");
    detach.className = "nc-target-detach";
    detach.textContent = "\u00D7";
    detach.title = "Detach target entity";
    detach.addEventListener("click", (e) => {
      e.stopPropagation();
      updateChoreographyCmd(choreo.id, { defaultTargetEntityId: undefined });
    });
    badge.appendChild(detach);
    targetRow.appendChild(badge);
  } else {
    const hint = document.createElement("span");
    hint.className = "nc-target-hint";
    hint.textContent = "drag to entity";
    targetRow.appendChild(hint);
  }
  section.appendChild(targetRow);

  // ── Interrupts row ──
  const intRow = document.createElement("div");
  intRow.className = "nc-detail-row";
  const intLabel = document.createElement("span");
  intLabel.className = "nc-detail-label";
  intLabel.textContent = "interrupts";
  intRow.appendChild(intLabel);
  const intCb = document.createElement("input");
  intCb.type = "checkbox";
  intCb.checked = choreo.interrupts;
  intCb.addEventListener("change", () => {
    updateChoreographyCmd(choreo.id, { interrupts: intCb.checked });
  });
  intRow.appendChild(intCb);
  section.appendChild(intRow);

  header.appendChild(section);

  return header;
}

// ---------------------------------------------------------------------------
// When condition editor
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

/** Build a WhenClauseDef from rows, or undefined if empty/incomplete. */
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

/** Render the when condition editor block. */
function renderWhenEditor(choreo: ChoreographyDef): HTMLElement {
  const container = document.createElement("div");
  container.className = "nc-when-section";

  // Label row
  const labelRow = document.createElement("div");
  labelRow.className = "nc-detail-row";
  const label = document.createElement("span");
  label.className = "nc-detail-label";
  label.textContent = "when";
  labelRow.appendChild(label);

  // Toggle: show/hide condition rows
  const rows = parseWhenRows(choreo);
  const hasConditions = rows.length > 0;

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "nc-when-toggle";
  toggleBtn.textContent = hasConditions ? `${rows.length} condition${rows.length > 1 ? "s" : ""}` : "always";
  toggleBtn.title = hasConditions ? "Edit conditions" : "Add a condition filter";
  labelRow.appendChild(toggleBtn);
  container.appendChild(labelRow);

  // Condition rows container (initially collapsed unless there are conditions)
  const body = document.createElement("div");
  body.className = "nc-when-body";
  let expanded = hasConditions;
  body.style.display = expanded ? "" : "none";

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    expanded = !expanded;
    body.style.display = expanded ? "" : "none";
    // If expanding with no rows, add an empty one
    if (expanded && body.querySelectorAll(".nc-when-row").length === 0) {
      body.insertBefore(createConditionRow(choreo, body, { path: "signal.", op: "contains", value: "" }), addBtn);
    }
  });

  // Render existing condition rows
  for (const row of rows) {
    body.appendChild(createConditionRow(choreo, body, row));
  }

  // Add condition button
  const addBtn = document.createElement("button");
  addBtn.className = "nc-when-add";
  addBtn.textContent = "+ condition";
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    body.insertBefore(createConditionRow(choreo, body, { path: "signal.", op: "contains", value: "" }), addBtn);
  });
  body.appendChild(addBtn);

  container.appendChild(body);
  return container;
}

/** Save the current condition rows from the DOM back to the choreography state. */
function saveWhenFromDom(choreo: ChoreographyDef, body: HTMLElement): void {
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
  updateChoreographyCmd(choreo.id, { when: clause });
}

/** Create a single condition row element. */
function createConditionRow(
  choreo: ChoreographyDef,
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
  pathInput.placeholder = "signal.content";
  pathInput.addEventListener("change", () => saveWhenFromDom(choreo, body));

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
    saveWhenFromDom(choreo, body);
  });

  // Value input
  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.className = "nc-when-value";
  valueInput.value = initial.value;
  valueInput.placeholder = "value";
  valueInput.style.display = initial.op === "exists" ? "none" : "";
  valueInput.addEventListener("change", () => saveWhenFromDom(choreo, body));

  // Remove button
  const removeBtn = document.createElement("span");
  removeBtn.className = "nc-when-remove";
  removeBtn.textContent = "\u00D7";
  removeBtn.title = "Remove condition";
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    row.remove();
    saveWhenFromDom(choreo, body);
  });

  row.appendChild(pathInput);
  row.appendChild(opSelect);
  row.appendChild(valueInput);
  row.appendChild(removeBtn);
  return row;
}
