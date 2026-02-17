/**
 * Choreography view — rack-based editor.
 *
 * Orchestrator module: creates a scrollable rack list in `#zone-choreographer`
 * and wires together the rack renderer, drag system, and state subscriptions.
 *
 * The actual rendering, drag, and inline editing logic lives in:
 *   - rack-renderer.ts      — renders choreographies as vertical racks
 *   - rack-drag.ts          — drag-from-rail to create + rack reorder
 *   - node-detail-inline.ts — inline detail (when, interrupts, target)
 *   - step-chain.ts         — horizontal pill-based step renderer
 */

import { shouldSuppressShortcut } from "../shortcuts/shortcut-registry.js";
import {
  getChoreographyState,
  subscribeChoreography,
  removeChoreography,
} from "../state/choreography-state.js";
import { subscribeWiring } from "../state/wiring-state.js";
import { subscribeActiveSource } from "../workspace/connector-bar-horizontal.js";
import { renderAllRacks } from "./rack-renderer.js";
import { initRackDrag } from "./rack-drag.js";
import { initStepReorder } from "./step-reorder.js";
import { initActionPalette } from "./action-palette.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let initialized = false;
let rackListEl: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize the Choreography view (rack-based editor). Idempotent. */
export function initChoreographyView(): void {
  if (initialized) return;
  initialized = true;

  const zoneEl = document.getElementById("zone-choreographer");
  if (!zoneEl) return;

  // Action palette at top of zone
  initActionPalette(zoneEl);

  // Create the scrollable rack list
  rackListEl = document.createElement("div");
  rackListEl.className = "rack-list";
  zoneEl.appendChild(rackListEl);

  // Initialize drag interactions (drag-from-rail + rack reorder)
  initRackDrag();

  // Initialize step reorder (drag grip within chains)
  initStepReorder();

  // Initialize keyboard shortcuts (Delete to remove selected rack)
  initChoreographyKeyboard(zoneEl);

  // Initial render
  renderRacks();

  // Subscribe to state changes
  subscribeChoreography(renderRacks);
  subscribeWiring(renderRacks);
  subscribeActiveSource(renderRacks);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/** Re-render all racks into the list. */
function renderRacks(): void {
  if (!rackListEl) return;
  renderAllRacks(rackListEl);
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

/** Initialize Delete/Backspace shortcut for removing selected choreography. */
function initChoreographyKeyboard(zoneEl: HTMLElement): void {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;

    if (shouldSuppressShortcut(e)) return;

    // Only act when choreographer zone is visible
    if (zoneEl.offsetParent === null) return;

    const { selectedChoreographyId } = getChoreographyState();
    if (!selectedChoreographyId) return;

    e.preventDefault();
    removeChoreography(selectedChoreographyId);
  });
}
