/**
 * Rideau (curtain) — vertical slider between Choreographer and Theme zones.
 *
 * Drag to resize the split ratio. Double-click to cycle presets.
 * Publishes rideauSplit to editor state, which drives CSS flex-basis.
 */

import { getEditorState, setRideauSplit, subscribeEditor } from "../state/editor-state.js";

// ---------------------------------------------------------------------------
// Preset cycle: balanced → full-choreo → full-preview → balanced
// ---------------------------------------------------------------------------

const PRESETS = [0.5, 1.0, 0.0] as const;

/** Find next preset (cycle). */
function nextPreset(current: number): number {
  // Find closest preset and move to the next one
  let closest = 0;
  let minDist = Infinity;
  for (let i = 0; i < PRESETS.length; i++) {
    const dist = Math.abs(current - PRESETS[i]);
    if (dist < minDist) {
      minDist = dist;
      closest = i;
    }
  }
  return PRESETS[(closest + 1) % PRESETS.length];
}

// ---------------------------------------------------------------------------
// Min-width constraints
// ---------------------------------------------------------------------------

const MIN_ZONE_PX = 200;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the rideau (curtain slider) between Choreographer and Theme zones. */
export function initRideau(): void {
  const _r = document.getElementById("rideau");
  const _l = document.getElementById("zone-lower");
  const _c = document.getElementById("zone-choreographer");
  const _t = document.getElementById("zone-theme");
  if (!_r || !_l || !_c || !_t) return;

  // Reassign to non-null consts so TypeScript narrows inside closures
  const rideauEl: HTMLElement = _r;
  const zoneLower: HTMLElement = _l;
  const zoneChoreo: HTMLElement = _c;
  const zoneTheme: HTMLElement = _t;

  // ── Sync layout from state ──
  function applyLayout(): void {
    const { rideauSplit } = getEditorState();
    const totalWidth = zoneLower.clientWidth;
    const rideauWidth = rideauEl.offsetWidth || 6;
    const available = totalWidth - rideauWidth;

    const choreoWidth = Math.round(available * rideauSplit);
    const themeWidth = available - choreoWidth;

    zoneChoreo.style.width = `${choreoWidth}px`;
    zoneChoreo.style.flex = "none";
    zoneTheme.style.width = `${themeWidth}px`;
    zoneTheme.style.flex = "none";

    // Hide zones at extremes
    zoneChoreo.style.display = rideauSplit <= 0.02 ? "none" : "flex";
    zoneTheme.style.display = rideauSplit >= 0.98 ? "none" : "flex";
  }

  subscribeEditor(applyLayout);

  // Defer first layout to after the DOM is laid out
  requestAnimationFrame(applyLayout);

  // Also re-apply on window resize
  window.addEventListener("resize", applyLayout);

  // ── Drag ──
  let dragging = false;

  rideauEl.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    rideauEl.classList.add("rideau--dragging");
    document.body.style.cursor = "col-resize";
    // Prevent text selection during drag
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging) return;
    const rect = zoneLower.getBoundingClientRect();
    const rideauWidth = rideauEl.offsetWidth || 6;
    const available = rect.width - rideauWidth;

    // Mouse position relative to zone-lower left edge
    const mouseX = e.clientX - rect.left;
    let ratio = mouseX / (available || 1);

    // Clamp with min-width guards
    const minRatio = MIN_ZONE_PX / (available || 1);
    const maxRatio = 1 - minRatio;

    // Allow snapping to extremes when dragging past min
    if (ratio < minRatio * 0.5) {
      ratio = 0;
    } else if (ratio > 1 - minRatio * 0.5) {
      ratio = 1;
    } else {
      ratio = Math.max(minRatio, Math.min(maxRatio, ratio));
    }

    setRideauSplit(ratio);
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    rideauEl.classList.remove("rideau--dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  // ── Double-click: cycle presets ──
  rideauEl.addEventListener("dblclick", (e: MouseEvent) => {
    e.preventDefault();
    const { rideauSplit } = getEditorState();
    setRideauSplit(nextPreset(rideauSplit));
  });
}
