/**
 * Toolbar module.
 *
 * Thin vertical bar (~40px) pinned to the left edge.
 * Two sections: canvas tools (top) and panel toggles (bottom).
 * Uses Lucide Icons (inline SVG) per brand guidelines.
 * Also wires zoom keyboard shortcuts and the zoom bar buttons.
 */

import type { ToolId, PanelId } from "../types.js";
import { getEditorState, setActiveTool, togglePanel, subscribeEditor, toggleGrid } from "../state/editor-state.js";
import { zoomIn, zoomOut, setZoomLevel, fitToView } from "../canvas/canvas.js";

// ---------------------------------------------------------------------------
// Lucide SVG icons (inline, stroke="currentColor")
// ---------------------------------------------------------------------------

/** Create an SVG element from inner path markup (Lucide 24x24 viewBox). */
function lucide(inner: string, size = 18): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

const ICON = {
  // Tools
  select: lucide(
    '<path d="M12.586 12.586 19 19"/>' +
    '<path d="M3.688 3.037a.497.497 0 0 0-.651.651l6.5 15.999a.501.501 0 0 0 .947-.062l1.569-6.083a2 2 0 0 1 1.448-1.479l6.124-1.579a.5.5 0 0 0 .063-.947z"/>'
  ),
  hand: lucide(
    '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/>' +
    '<path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/>' +
    '<path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/>' +
    '<path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'
  ),
  background: lucide(
    '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>' +
    '<circle cx="9" cy="9" r="2"/>' +
    '<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'
  ),
  place: lucide(
    '<path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13"/>' +
    '<path d="M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1z"/>' +
    '<path d="M5 22h14"/>'
  ),
  position: lucide(
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>' +
    '<circle cx="12" cy="10" r="3"/>'
  ),
  route: lucide(
    '<circle cx="6" cy="19" r="3"/>' +
    '<path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/>' +
    '<circle cx="18" cy="5" r="3"/>'
  ),

  // Panels
  assets: lucide(
    '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>'
  ),
  entities: lucide(
    '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>' +
    '<path d="m3.3 7 8.7 5 8.7-5"/>' +
    '<path d="M12 22V12"/>'
  ),
  layers: lucide(
    '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/>' +
    '<path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/>' +
    '<path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>'
  ),
  settings: lucide(
    '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/>' +
    '<circle cx="12" cy="12" r="3"/>'
  ),
};

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

interface ToolDef {
  id: ToolId;
  label: string;
  iconKey: keyof typeof ICON;
  shortcut: string;
}

interface PanelToggleDef {
  panelId: PanelId;
  label: string;
  iconKey: keyof typeof ICON;
  shortcut: string;
}

const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", iconKey: "select", shortcut: "V" },
  { id: "hand", label: "Hand", iconKey: "hand", shortcut: "H" },
  { id: "background", label: "Background", iconKey: "background", shortcut: "B" },
  { id: "place", label: "Place", iconKey: "place", shortcut: "O" },
  { id: "position", label: "Position", iconKey: "position", shortcut: "P" },
  { id: "route", label: "Route", iconKey: "route", shortcut: "R" },
];

const PANEL_TOGGLES: PanelToggleDef[] = [
  { panelId: "asset-manager", label: "Assets", iconKey: "assets", shortcut: "A" },
  { panelId: "entity-editor", label: "Entities", iconKey: "entities", shortcut: "E" },
  { panelId: "layers", label: "Layers", iconKey: "layers", shortcut: "L" },
  { panelId: "settings", label: "Settings", iconKey: "settings", shortcut: "" },
];

// ---------------------------------------------------------------------------
// Build DOM
// ---------------------------------------------------------------------------

/** Initialize the toolbar, zoom bar, and keyboard shortcuts. */
export function initToolbar(): void {
  const toolbar = document.getElementById("toolbar")!;
  toolbar.innerHTML = "";

  // Tool buttons
  const toolSection = document.createElement("div");
  toolSection.className = "toolbar-section";

  for (const tool of TOOLS) {
    const btn = document.createElement("button");
    btn.className = "toolbar-btn";
    btn.dataset.toolId = tool.id;
    btn.title = `${tool.label} (${tool.shortcut})`;
    btn.innerHTML = ICON[tool.iconKey];
    btn.addEventListener("click", () => setActiveTool(tool.id));
    toolSection.appendChild(btn);
  }

  // Divider
  const divider = document.createElement("div");
  divider.className = "toolbar-divider";

  // Panel toggles
  const panelSection = document.createElement("div");
  panelSection.className = "toolbar-section";

  for (const pt of PANEL_TOGGLES) {
    const btn = document.createElement("button");
    btn.className = "toolbar-btn";
    btn.dataset.panelId = pt.panelId;
    btn.title = pt.shortcut ? `${pt.label} (${pt.shortcut})` : pt.label;
    btn.innerHTML = ICON[pt.iconKey];
    btn.addEventListener("click", () => togglePanel(pt.panelId));
    panelSection.appendChild(btn);
  }

  toolbar.appendChild(toolSection);
  toolbar.appendChild(divider);
  toolbar.appendChild(panelSection);

  // Sync active states
  function syncState(): void {
    const { activeTool, panelLayouts } = getEditorState();

    for (const btn of toolSection.querySelectorAll<HTMLButtonElement>(".toolbar-btn")) {
      const isActive = btn.dataset.toolId === activeTool;
      btn.classList.toggle("toolbar-btn--active", isActive);
    }

    for (const btn of panelSection.querySelectorAll<HTMLButtonElement>(".toolbar-btn")) {
      const pid = btn.dataset.panelId as PanelId | undefined;
      if (!pid) continue;
      const isOpen = panelLayouts[pid]?.visible ?? false;
      btn.classList.toggle("toolbar-btn--panel-open", isOpen);
    }
  }

  subscribeEditor(syncState);
  syncState();

  // Wire zoom bar buttons
  initZoomBar();

  // Keyboard shortcuts
  initShortcuts();
}

// ---------------------------------------------------------------------------
// Zoom bar
// ---------------------------------------------------------------------------

function initZoomBar(): void {
  const zoomOutBtn = document.getElementById("zoom-out");
  const zoomInBtn = document.getElementById("zoom-in");
  const zoomLevelBtn = document.getElementById("zoom-level");
  const presetsEl = document.getElementById("zoom-presets");

  zoomOutBtn?.addEventListener("click", () => zoomOut());
  zoomInBtn?.addEventListener("click", () => zoomIn());

  // Toggle presets dropdown
  zoomLevelBtn?.addEventListener("click", () => {
    if (!presetsEl) return;
    presetsEl.hidden = !presetsEl.hidden;
  });

  // Preset buttons
  presetsEl?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("button");
    if (!btn) return;
    const val = btn.dataset.zoom;
    if (!val) return;
    if (val === "fit") {
      fitToView();
    } else {
      setZoomLevel(parseFloat(val));
    }
    presetsEl.hidden = true;
  });

  // Close presets on outside click
  document.addEventListener("mousedown", (e) => {
    if (!presetsEl || presetsEl.hidden) return;
    const target = e.target as HTMLElement;
    if (target.closest("#zoom-bar")) return;
    presetsEl.hidden = true;
  });
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

function initShortcuts(): void {
  document.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    // Ctrl/Cmd shortcuts (zoom presets)
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case "0":
          e.preventDefault();
          setZoomLevel(1);
          return;
        case "1":
          e.preventDefault();
          fitToView();
          return;
        default:
          return;
      }
    }

    if (e.altKey) return;

    switch (e.key) {
      // Tools
      case "v": case "V": setActiveTool("select"); break;
      case "h": case "H": setActiveTool("hand"); break;
      case "b": case "B": setActiveTool("background"); break;
      case "o": case "O": setActiveTool("place"); break;
      case "p": case "P": setActiveTool("position"); break;
      case "r": case "R": setActiveTool("route"); break;

      // Panels
      case "a": case "A": togglePanel("asset-manager"); break;
      case "e": case "E": togglePanel("entity-editor"); break;
      case "l": case "L": togglePanel("layers"); break;

      // Grid
      case "g": case "G": toggleGrid(); break;

      // Zoom
      case "+": case "=": zoomIn(); break;
      case "-": zoomOut(); break;

      default: return;
    }
    e.preventDefault();
  });
}
