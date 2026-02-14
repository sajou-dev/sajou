/**
 * View tabs — zone label indicators embedded in each zone.
 *
 * Instead of a central tab bar in the header, each zone has its own
 * small floating tab label in the top-right corner. Clicking it
 * focuses that zone (sets `activeView`).
 *
 * The labels replace the CSS `::before` zone labels (SIGNAL, CHOREOGRAPHER, THEME)
 * with interactive branded buttons containing SVG icons.
 */

import { getEditorState, setActiveView, subscribeEditor } from "../state/editor-state.js";
import type { ViewId } from "../types.js";

// ---------------------------------------------------------------------------
// Brand SVG icons (inlined from docs/brand/sajou-brand_dev-kit_001/)
// ---------------------------------------------------------------------------

const ICON_SIGNAL = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none">
  <path d="M 8 24 C 12 18, 12 30, 16 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
  <path d="M 14 24 C 18 16, 18 32, 22 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
  <path d="M 20 24 C 24 14, 24 34, 28 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
  <circle cx="34" cy="24" r="4" fill="currentColor"/>
  <rect x="30" y="20" width="8" height="8" rx="2.5" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.4"/>
</svg>`;

const ICON_CHOREOGRAPHER = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none">
  <path d="M 8 36 C 14 20, 22 14, 28 22 C 34 30, 38 18, 42 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <circle cx="8" cy="36" r="3" fill="currentColor" opacity="0.4"/>
  <circle cx="20" cy="20" r="2.5" fill="currentColor" opacity="0.6"/>
  <circle cx="34" cy="22" r="2.5" fill="currentColor" opacity="0.6"/>
  <circle cx="42" cy="12" r="3.5" fill="currentColor"/>
  <line x1="20" y1="23" x2="20" y2="27" stroke="currentColor" stroke-width="1" opacity="0.3"/>
  <line x1="34" y1="25" x2="34" y2="29" stroke="currentColor" stroke-width="1" opacity="0.3"/>
</svg>`;

const ICON_THEME = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none">
  <rect x="6" y="12" width="28" height="24" rx="4" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.25"/>
  <rect x="10" y="10" width="28" height="24" rx="4" stroke="currentColor" stroke-width="1.8" fill="none" opacity="0.5"/>
  <rect x="14" y="8" width="28" height="24" rx="4" stroke="currentColor" stroke-width="2.2" fill="none" opacity="0.85"/>
  <circle cx="24" cy="20" r="3" fill="currentColor"/>
  <line x1="34" y1="14" x2="36" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  <line x1="36" y1="14" x2="34" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
</svg>`;

// ---------------------------------------------------------------------------
// Tab definitions — each tab is placed inside its zone
// ---------------------------------------------------------------------------

interface ZoneTabDef {
  view: ViewId;
  label: string;
  icon: string;
  /** CSS selector of the zone container. */
  zoneSelector: string;
}

const ZONE_TABS: readonly ZoneTabDef[] = [
  { view: "signal", label: "Signal", icon: ICON_SIGNAL, zoneSelector: "#zone-signal" },
  { view: "orchestrator", label: "Choreographer", icon: ICON_CHOREOGRAPHER, zoneSelector: "#zone-choreographer" },
  { view: "visual", label: "Visual", icon: ICON_THEME, zoneSelector: "#zone-theme" },
];

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the view tab labels inside each zone. */
export function initViewTabs(): void {
  // Hide the old header nav (we render inside zones now)
  const oldNav = document.getElementById("view-tabs");
  if (oldNav) oldNav.style.display = "none";

  const buttons = new Map<ViewId, HTMLButtonElement>();

  for (const tab of ZONE_TABS) {
    const zone = document.querySelector<HTMLElement>(tab.zoneSelector);
    if (!zone) continue;

    const btn = document.createElement("button");
    btn.className = "zone-tab";
    btn.innerHTML = `${tab.icon}<span>${tab.label}</span>`;

    btn.addEventListener("click", () => setActiveView(tab.view));

    zone.appendChild(btn);
    buttons.set(tab.view, btn);
  }

  // Sync active state
  function sync(): void {
    const { currentView } = getEditorState();
    for (const [view, btn] of buttons) {
      btn.classList.toggle("zone-tab--active", view === currentView);
    }
  }

  subscribeEditor(sync);
  sync();
}
