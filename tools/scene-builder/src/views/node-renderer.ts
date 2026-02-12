/**
 * Node renderer — renders choreography nodes on the canvas.
 *
 * Each ChoreographyDef becomes a positioned DOM element with:
 *   - Input ports (left side, derived from wiring state)
 *   - Header bar (colored by signal type)
 *   - Body (compact step preview)
 *   - Output port (right side)
 *   - Inline detail panel (when selected)
 *
 * Pure render function: creates DOM from state snapshots.
 * Parent (choreography-view) handles re-rendering on state changes.
 */

import type { ChoreographyDef, ChoreographyStepDef } from "../types.js";
import {
  getChoreographyState,
  toggleNodeCollapsed,
} from "../state/choreography-state.js";
import { getChoreoInputInfo, getSourcesForChoreo } from "../state/wiring-queries.js";
import { getActiveBarHSource } from "../workspace/connector-bar-horizontal.js";
import { renderNodeDetail } from "./node-detail-inline.js";

// ---------------------------------------------------------------------------
// Signal type colors (shared palette)
// ---------------------------------------------------------------------------

const SIGNAL_TYPE_COLORS: Record<string, string> = {
  task_dispatch: "#E8A851",
  tool_call: "#5B8DEF",
  tool_result: "#4EC9B0",
  token_usage: "#C586C0",
  agent_state_change: "#6A9955",
  error: "#F44747",
  completion: "#4EC9B0",
  event: "#8E8EA0",
};

/** Short display labels for signal types. */
const SIGNAL_TYPE_LABELS: Record<string, string> = {
  task_dispatch: "task",
  tool_call: "tool↗",
  tool_result: "tool↙",
  token_usage: "tokens",
  agent_state_change: "state",
  error: "error",
  completion: "done",
  event: "event",
};

/** Structural actions that have children. */
const STRUCTURAL_ACTIONS = ["parallel", "onArrive", "onInterrupt"];

// ---------------------------------------------------------------------------
// Render all nodes
// ---------------------------------------------------------------------------

/** Render all choreography nodes into the container. */
export function renderAllNodes(container: HTMLElement): void {
  container.innerHTML = "";

  const { choreographies, selectedChoreographyId } = getChoreographyState();
  const activeSource = getActiveBarHSource();

  for (const choreo of choreographies) {
    const isSelected = choreo.id === selectedChoreographyId;
    const node = renderNode(choreo, isSelected);

    // Dim nodes not connected to the active source
    if (activeSource) {
      const provenance = getSourcesForChoreo(choreo.id);
      const connected = provenance.some((p) => p.sourceId === activeSource);
      if (!connected) node.classList.add("nc-node--dimmed");
    }

    container.appendChild(node);
  }
}

// ---------------------------------------------------------------------------
// Render single node
// ---------------------------------------------------------------------------

/** Render a single choreography node. */
function renderNode(
  choreo: ChoreographyDef,
  isSelected: boolean,
): HTMLElement {
  const node = document.createElement("div");
  node.className = "nc-node" + (isSelected ? " nc-node--selected" : "");
  node.dataset.nodeId = choreo.id;
  node.style.left = `${choreo.nodeX}px`;
  node.style.top = `${choreo.nodeY}px`;

  // Resolve effective inputs (wire-driven with on fallback)
  const inputInfo = getChoreoInputInfo(choreo.id);
  const primaryType = inputInfo.effectiveTypes[0] ?? choreo.on;
  const color = SIGNAL_TYPE_COLORS[primaryType] ?? "#6E6E8A";

  // ── Input ports (left side) ──
  const inputPorts = document.createElement("div");
  inputPorts.className = "nc-ports nc-ports--input";

  for (const signalType of inputInfo.effectiveTypes) {
    const port = createPort(choreo.id, signalType, "in", inputInfo.hasWires);
    inputPorts.appendChild(port);
  }

  node.appendChild(inputPorts);

  // ── Header ──
  const header = document.createElement("div");
  header.className = "nc-node-header";
  header.style.borderTopColor = color;

  const badge = document.createElement("span");
  badge.className = "nc-node-badge";
  badge.style.background = color + "22";
  badge.style.color = color;
  badge.textContent = inputInfo.effectiveTypes.length > 1
    ? `${SIGNAL_TYPE_LABELS[primaryType] ?? primaryType} +${inputInfo.effectiveTypes.length - 1}`
    : (SIGNAL_TYPE_LABELS[primaryType] ?? primaryType);
  header.appendChild(badge);

  const title = document.createElement("span");
  title.className = "nc-node-title";
  title.textContent = "choreography";
  header.appendChild(title);

  const count = document.createElement("span");
  count.className = "nc-node-count";
  count.textContent = `${choreo.steps.length} step${choreo.steps.length !== 1 ? "s" : ""}`;
  header.appendChild(count);

  // Collapse/expand on double-click
  header.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    toggleNodeCollapsed(choreo.id);
  });

  // Selection is handled by mouseup threshold in node-drag.ts (initNodeReposition)

  node.appendChild(header);

  // ── Body (step preview — hidden when collapsed) ──
  if (!choreo.collapsed) {
    const body = document.createElement("div");
    body.className = "nc-node-body";

    if (choreo.steps.length === 0) {
      const empty = document.createElement("div");
      empty.className = "nc-node-empty";
      empty.textContent = "No steps";
      body.appendChild(empty);
    } else {
      const maxPreview = 5;
      const steps = choreo.steps.slice(0, maxPreview);
      for (let i = 0; i < steps.length; i++) {
        const stepEl = document.createElement("div");
        stepEl.className = "nc-node-step";
        stepEl.textContent = `${i + 1}. ${summarizeStep(steps[i]!)}`;
        body.appendChild(stepEl);
      }
      if (choreo.steps.length > maxPreview) {
        const more = document.createElement("div");
        more.className = "nc-node-step nc-node-step--more";
        more.textContent = `+${choreo.steps.length - maxPreview} more`;
        body.appendChild(more);
      }
    }

    node.appendChild(body);
  }

  // ── Output port (right side) ──
  const outputPorts = document.createElement("div");
  outputPorts.className = "nc-ports nc-ports--output";

  const outPort = document.createElement("div");
  outPort.className = "nc-port";
  outPort.dataset.wireZone = "choreographer";
  outPort.dataset.wireId = choreo.id;
  outPort.dataset.portDir = "out";

  const outDot = document.createElement("span");
  outDot.className = "nc-port-dot";
  outDot.style.borderColor = color;
  outPort.appendChild(outDot);

  outputPorts.appendChild(outPort);
  node.appendChild(outputPorts);

  // ── Inline detail (when selected, not collapsed) ──
  if (isSelected && !choreo.collapsed) {
    const detail = renderNodeDetail(choreo);
    node.appendChild(detail);
  }

  return node;
}

// ---------------------------------------------------------------------------
// Port helper
// ---------------------------------------------------------------------------

/** Create an input port element. */
function createPort(nodeId: string, signalType: string, direction: "in" | "out", isWired = true): HTMLElement {
  const port = document.createElement("div");
  port.className = "nc-port";
  port.dataset.wireZone = "choreographer";
  port.dataset.wireId = nodeId;
  port.dataset.portDir = direction;
  port.dataset.portType = signalType;
  port.dataset.portSource = isWired ? "wire" : "default";

  const color = SIGNAL_TYPE_COLORS[signalType] ?? "#6E6E8A";

  const dot = document.createElement("span");
  dot.className = "nc-port-dot";
  dot.style.background = color;
  port.appendChild(dot);

  const label = document.createElement("span");
  label.className = "nc-port-label";
  label.textContent = SIGNAL_TYPE_LABELS[signalType] ?? signalType;
  port.appendChild(label);

  return port;
}

// ---------------------------------------------------------------------------
// Step summary (compact)
// ---------------------------------------------------------------------------

/** Summarize a step for compact display. */
function summarizeStep(step: ChoreographyStepDef): string {
  const entity = step.entity ?? step.target ?? "";
  const to = step.params["to"] ? ` → ${step.params["to"]}` : "";
  const at = step.params["at"] ? ` @ ${step.params["at"]}` : "";
  const dur = step.duration ? ` ${step.duration}ms` : "";

  if (STRUCTURAL_ACTIONS.includes(step.action)) {
    const count = step.children?.length ?? 0;
    return `${step.action} (${count})`;
  }
  const detail = `${entity}${to}${at}${dur}`.trim();
  return detail ? `${step.action} ${detail}` : step.action;
}
