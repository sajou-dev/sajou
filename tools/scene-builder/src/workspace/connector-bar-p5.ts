/**
 * p5.js connector bar — visual → shader rail.
 *
 * Mounts param badges inside the rail separator (#rail-visual-shader).
 * Each badge represents a user-defined param from the selected sketch.
 *
 * Wired section (top): params that have a choreo→p5 wire.
 * Unwired section (bottom): params without a wire.
 */

import {
  getP5State,
  subscribeP5,
} from "../p5-editor/p5-state.js";
import { subscribeWiring } from "../state/wiring-state.js";
import { getP5Bindings } from "../state/wiring-queries.js";
import type { P5ParamDef } from "../p5-editor/p5-types.js";

// ---------------------------------------------------------------------------
// Dot color by param type
// ---------------------------------------------------------------------------

const PARAM_TYPE_COLORS: Record<string, string> = {
  float: "#E8A851",   // amber
  int:   "#60A5FA",   // blue
  bool:  "#6E6E8A",   // grey
  color: "#2DD4BF",   // teal
  vec2:  "#2DD4BF",   // teal
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let wiredEl: HTMLElement | null = null;
let unwiredEl: HTMLElement | null = null;
let initialized = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize the p5 connector bar inside the visual→shader rail. */
export function initConnectorBarP5(): void {
  if (initialized) return;
  initialized = true;

  const rail = document.getElementById("rail-visual-shader");
  if (!rail) return;

  const badgesContainer = rail.querySelector(".pl-rail-badges");

  wiredEl = document.createElement("div");
  wiredEl.className = "pl-rail-sources";

  unwiredEl = document.createElement("div");
  unwiredEl.className = "pl-rail-sources pl-rail-sources--inactive";

  if (badgesContainer) {
    rail.insertBefore(wiredEl, badgesContainer);
    if (badgesContainer.nextSibling) {
      rail.insertBefore(unwiredEl, badgesContainer.nextSibling);
    } else {
      rail.appendChild(unwiredEl);
    }
  } else {
    rail.appendChild(wiredEl);
    rail.appendChild(unwiredEl);
  }

  subscribeP5(render);
  subscribeWiring(render);
  render();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  if (!wiredEl || !unwiredEl) return;

  const { sketches, selectedSketchId } = getP5State();
  const sketch = sketches.find((s) => s.id === selectedSketchId);

  if (!sketch) {
    wiredEl.innerHTML = "";
    wiredEl.style.display = "none";
    unwiredEl.innerHTML = "";
    unwiredEl.style.display = "none";
    return;
  }

  const userParams = sketch.params;

  // Build set of wired param keys (format: p5:sketchId:paramName)
  const p5Bindings = getP5Bindings();
  const wiredIds = new Set(p5Bindings.map((w) => w.toId));

  const wiredParams: P5ParamDef[] = [];
  const unwiredParams: P5ParamDef[] = [];

  for (const param of userParams) {
    const wireId = `p5:${sketch.id}:${param.name}`;
    if (wiredIds.has(wireId)) {
      wiredParams.push(param);
    } else {
      unwiredParams.push(param);
    }
  }

  wiredEl.innerHTML = "";
  wiredEl.style.display = wiredParams.length === 0 ? "none" : "";
  for (const param of wiredParams) {
    wiredEl.appendChild(createParamBadge(sketch.id, param, true));
  }

  unwiredEl.innerHTML = "";
  unwiredEl.style.display = unwiredParams.length === 0 ? "none" : "";
  for (const param of unwiredParams) {
    unwiredEl.appendChild(createParamBadge(sketch.id, param, false));
  }
}

// ---------------------------------------------------------------------------
// Badge creation
// ---------------------------------------------------------------------------

function createParamBadge(
  sketchId: string,
  param: P5ParamDef,
  wired: boolean,
): HTMLElement {
  const badge = document.createElement("div");
  badge.className = "pl-rail-badge";

  badge.dataset.wireZone = "p5";
  badge.dataset.wireId = `p5:${sketchId}:${param.name}`;

  if (wired) {
    badge.classList.add("pl-rail-badge--active");
  } else {
    badge.classList.add("pl-rail-badge--unbound");
  }

  const dot = document.createElement("span");
  dot.className = "pl-rail-badge-dot";
  dot.style.background = PARAM_TYPE_COLORS[param.type] ?? "#6E6E8A";
  badge.appendChild(dot);

  const label = document.createElement("span");
  label.className = "pl-rail-badge-label";
  label.textContent = param.name;
  badge.appendChild(label);

  badge.title = `${param.name} (${param.type})${wired ? " — wired" : " — drop choreo action here"}`;

  return badge;
}
