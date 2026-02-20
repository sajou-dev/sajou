/**
 * Node detail — dock-level parameter editor.
 *
 * Shows dock params only: inputs/on, target entity, interrupts.
 * When conditions are now rendered as a C-shape filter block (filter-block.ts).
 * Step params are rendered inline inside each block (step-chain.ts).
 */

import type { ChoreographyDef } from "../types.js";
import {
  getWiringState,
  removeWire,
} from "../state/wiring-state.js";
import { removeChoreography } from "../state/choreography-state.js";
import {
  getChoreoInputInfo,
  getSourcesForChoreo,
} from "../state/wiring-queries.js";
import { getSignalSourcesState } from "../state/signal-source-state.js";
import {
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

/** Render the dock-level detail (inputs, when, target, interrupts). */
export function renderNodeHeader(choreo: ChoreographyDef): HTMLElement {
  const header = document.createElement("div");
  header.className = "nc-node-detail";

  // Prevent rack drag when interacting with detail
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
  }
  // Fallback mode (no wires): hat block already has the signal type selector,
  // so no need for a redundant "on" row here.

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

  // ── Delete button ──
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "nc-detail-delete";
  deleteBtn.textContent = "Delete choreography";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeChoreography(choreo.id);
  });
  section.appendChild(deleteBtn);

  header.appendChild(section);

  return header;
}

