# Sajou Scene Builder — Specification V1

## Context

The current theme editor (`tools/entity-editor/`) has 3 tabs: Assets, Entities, Scene. The Assets and Entities tabs are functional and well-tested. The Scene tab has been attempted twice and failed — the mode-switching UX (Ground/Decor/Walls/Positions/Routes/Select as sub-tabs) is confusing and non-functional.

**Decision: freeze the current Scene tab code and rewrite the entire editor as a unified, canvas-first workspace.**

The new editor is called **Sajou Scene Builder**.

## Design Philosophy

The canvas is the product. Everything else serves the canvas.

Inspired by: Figma (floating panels, contextual UI), Excalidraw (simplicity, canvas-first), LDtk (level editor with tile placement), Blender (dockable panels, workspace flexibility).

Anti-patterns to avoid:
- Tab switching that loses visual context
- Empty columns that waste screen space
- Mode switching that requires mental model changes
- Separating related workflows into different views

## Architecture

One full-screen workspace. No tabs. No page navigation. Everything is a **panel** that floats over the canvas.

```
┌──────────────────────────────────────────────────────────┐
│  [☰]  Sajou Scene Builder              [Import] [Export] │
│                                                          │
│  ┌──┐                                                    │
│  │V │  ┌──────────────┐                                  │
│  │B │  │              │                                  │
│  │O │  │ Asset Palette│         CANVAS (PixiJS)          │
│  │P │  │  (floating)  │                                  │
│  │R │  │              │                   ┌────────────┐ │
│  ├──┤  └──────────────┘                   │ Inspector  │ │
│  │📦│                                     │ (floating) │ │
│  │⚙ │                                     └────────────┘ │
│  └──┘                                                    │
│                                    ┌───────────────────┐ │
│                                    │ Layers  (floating)│ │
│                                    └───────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Canvas (PixiJS)

Full-screen, behind all panels. This is where the scene is built.

- **Zoom**: mouse wheel, centered on cursor. Display zoom level (e.g. "100%") in bottom-left.
- **Pan**: middle-click drag, or Space + left-click drag.
- **Grid**: toggleable overlay (shortcut G). Configurable cell size: 16 / 32 / 64 px. Subtle lines, should not dominate.
- **Background**: default dark gray (#1a1a2e or similar). Configurable via Background tool.

### Toolbar (left edge, vertical, fixed)

A thin vertical bar (~40px wide) pinned to the left edge. Two sections separated by a divider line.

**Top section — Canvas tools:**

| Icon | Name | Shortcut | Behavior |
|------|------|----------|----------|
| ↖ | Select | V | Click to select elements. Drag to move. Rubber-band for multi-select. |
| 🖼 | Background | B | Opens a small popover: color picker OR click an asset to tile it. |
| 📦 | Place | O | Opens the Asset Palette panel. Click asset, then click canvas to place. |
| 📍 | Position | P | Click canvas to place a named marker. |
| ➡ | Route | R | Click position A, then position B to create a route. |

**Bottom section — Panels:**

| Icon | Name | Shortcut | Behavior |
|------|------|----------|----------|
| 🗂 | Assets | A | Toggle the Asset Manager panel (import, browse, categorize). |
| 📐 | Entities | E | Toggle the Entity Editor panel (states, spritesheet explorer, preview). |
| 🔧 | Settings | -- | Scene dimensions, grid size, export settings. |

Active tool is highlighted. Active panels have a dot indicator.

### Asset Palette (floating panel)

Opens when Place tool (O) is active, or toggled independently.

- **Position**: floating, draggable by header, remembers position.
- **Size**: ~250px wide, resizable vertically. Compact.
- **Content**: grid of asset thumbnails from imported assets.
- **Search**: filter field at top.
- **Categories**: filter chips (from categories defined in asset manager). "All" by default.
- **Interaction**: click an asset → it becomes the "active brush". Cursor changes to crosshair. Click on canvas → sprite is placed at that position. Click another asset → changes the brush. Press Escape → deactivates brush.
- **Info on hover**: tooltip showing filename, dimensions (WxH px), file size.
- **Grid snap**: when grid is enabled, placed assets snap to grid cells.

### Asset Manager (floating panel)

The full asset management interface (currently the Assets tab).

- **Import**: drag & drop folders, or file picker button.
- **Browse**: tree view or grid view (toggle). Thumbnails for all images.
- **Categories**: create categories, assign assets to categories (multi-select + dropdown).
- **Search**: filter by name.
- **Detail**: click an asset → see full info (filename, path, dimensions, file size, format, category).
- This panel is independent of the Place tool. It's for asset management/organization.

### Entity Editor (floating panel)

The full entity configuration interface (currently the Entities tab).

- **Entity list**: left sidebar within the panel. Add/rename/delete entities.
- **State config**: type (static/spritesheet), asset binding (click asset in palette or drag from asset manager), parameters.
- **Spritesheet Explorer**: appears when a multi-row spritesheet is selected. Row selection, frame range, animated preview per row.
- **Preview**: live animation preview of the selected state.
- **This is existing code** — it works. Repackage it as a floating panel, don't rewrite the logic.

### Inspector (floating panel, contextual)

Appears when an element is selected on canvas. Shows properties of the selected element.

**For a placed object (decoration):**
- Asset name + thumbnail
- Position: X, Y (editable number fields)
- Scale: uniform slider or W/H
- Rotation: angle slider (0-360°)
- Layer: dropdown (background / midground / foreground)
- Opacity: slider (0-100%)
- Flip H / Flip V toggles

**For a position marker:**
- Name (editable text field)
- Position: X, Y
- Color: color picker
- Entity binding: optional dropdown to associate a default entity

**For a route:**
- Name (editable text field)  
- From → To (position names, read-only)
- Style: solid / dashed
- Color

**For background config:**
- Type: solid color / tiled asset
- Color picker (if solid)
- Asset selector (if tiled)

### Layers Panel (floating panel)

Toggleable (shortcut L). Shows all elements organized by type.

```
▼ Background
  🖼 grass-tile (tiled)
▼ Objects (12)
  📦 tree-01  [👁] [🔒]
  📦 desk-03  [👁] [🔒]
  ...
▼ Positions (4)
  📍 spawnPoint
  📍 managerDesk
  📍 serverRoom
  📍 entrance
▼ Routes (2)
  ➡ entrance → managerDesk
  ➡ managerDesk → serverRoom
```

- **Click**: selects the element on canvas (and in inspector).
- **👁 Eye**: toggle visibility.
- **🔒 Lock**: toggle lock (locked elements can't be moved/deleted).
- **Drag**: reorder elements within their group (changes z-order for objects).
- **Group headers**: click to collapse/expand.

## Interactions

### Placing objects

1. Select Place tool (O) or click an asset in the palette.
2. Cursor becomes crosshair with a ghost preview of the asset.
3. Click on canvas → asset is placed at that position.
4. Can keep clicking to place multiple copies (stamp mode).
5. Press Escape or switch tool to stop placing.
6. Placed objects are immediately selectable with Select tool (V).

### Selecting and editing

1. Select tool (V) is the default.
2. Click an element → selected (blue outline). Inspector opens with properties.
3. Drag selected element → moves it. Snaps to grid if grid is enabled.
4. Delete key → removes selected element.
5. Ctrl+C / Ctrl+V → duplicate with 20px offset.
6. Ctrl+Z / Ctrl+Shift+Z → undo/redo (all actions).
7. Click empty canvas → deselect.
8. Drag on empty canvas → rubber-band selection rectangle.

### Background

1. Select Background tool (B).
2. A small popover appears near the toolbar:
   - Color picker (default: solid color)
   - "Use tile" toggle → shows a mini asset grid to pick a tile
3. Selecting a color or tile immediately updates the canvas background.
4. The background covers the entire scene dimensions.

### Positions

1. Select Position tool (P).
2. Click on canvas → a marker appears (colored circle + name label).
3. Default name is auto-incremented: "position-1", "position-2", etc.
4. Select a marker → rename in Inspector.
5. Drag to reposition.

### Routes

1. Select Route tool (R).
2. Click on a position marker → it highlights as "start".
3. Click on another position marker → a dashed line is drawn between them. Route created.
4. Press Escape to cancel if only start is selected.
5. Routes are visual connections — they appear as dashed lines on canvas.

## Data Model

### Scene State (in memory)

```typescript
interface SceneState {
  dimensions: { width: number; height: number };
  background: {
    type: 'solid' | 'tiled';
    color?: string;       // hex color for solid
    assetPath?: string;   // asset path for tiled
  };
  objects: SceneObject[];
  positions: ScenePosition[];
  routes: SceneRoute[];
}

interface SceneObject {
  id: string;
  assetPath: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;    // degrees
  layer: 'background' | 'midground' | 'foreground';
  opacity: number;     // 0-1
  flipH: boolean;
  flipV: boolean;
  locked: boolean;
  visible: boolean;
}

interface ScenePosition {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  entityBinding?: string;  // optional entity ID
}

interface SceneRoute {
  id: string;
  name: string;
  from: string;   // position ID
  to: string;     // position ID
  style: 'solid' | 'dashed';
  color: string;
}
```

### Export Format (scene-layout.json)

```json
{
  "$schema": "sajou-scene-layout-v1",
  "dimensions": { "width": 960, "height": 640 },
  "background": { "type": "tiled", "asset": "terrain/grass-tile.png" },
  "objects": [
    {
      "asset": "decor/tree-01.png",
      "x": 120, "y": 340,
      "scaleX": 1, "scaleY": 1,
      "rotation": 0,
      "layer": "background",
      "opacity": 1,
      "flipH": false, "flipV": false
    }
  ],
  "positions": [
    { "name": "spawnPoint", "x": 50, "y": 300, "color": "#4CAF50" },
    { "name": "managerDesk", "x": 400, "y": 200, "color": "#2196F3" }
  ],
  "routes": [
    { "name": "main-path", "from": "spawnPoint", "to": "managerDesk", "style": "dashed", "color": "#ffffff" }
  ]
}
```

## File Structure

```
tools/scene-builder/
├── index.html              # Single page, minimal markup
├── vite.config.ts
├── tsconfig.json
├── package.json
├── src/
│   ├── main.ts             # Entry point, init workspace
│   ├── types.ts            # All TypeScript interfaces
│   │
│   ├── workspace/
│   │   ├── workspace.ts    # Root layout manager
│   │   ├── toolbar.ts      # Left toolbar (tools + panel toggles)
│   │   ├── header.ts       # Top bar (title, import/export)
│   │   └── panel.ts        # Generic floating panel (draggable, resizable, closeable)
│   │
│   ├── canvas/
│   │   ├── canvas.ts       # PixiJS Application, zoom, pan, grid
│   │   ├── renderer.ts     # State → PixiJS sync (objects, positions, routes, bg)
│   │   ├── selection.ts    # Selection overlay, rubber-band, handles
│   │   └── ghost.ts        # Ghost preview when placing objects
│   │
│   ├── tools/
│   │   ├── select.ts       # Select tool logic
│   │   ├── background.ts   # Background tool (popover)
│   │   ├── place.ts        # Place object tool
│   │   ├── position.ts     # Position marker tool
│   │   └── route.ts        # Route drawing tool
│   │
│   ├── panels/
│   │   ├── asset-palette.ts    # Compact asset grid for placing
│   │   ├── asset-manager.ts    # Full asset management (import, browse, categorize)
│   │   ├── entity-editor.ts    # Entity config (states, spritesheet explorer, preview)
│   │   ├── inspector.ts        # Property editor for selected element
│   │   └── layers.ts           # Layer list with visibility/lock
│   │
│   ├── state/
│   │   ├── scene-state.ts      # Scene data (objects, positions, routes, bg)
│   │   ├── editor-state.ts     # UI state (active tool, selected elements, panel positions)
│   │   ├── asset-store.ts      # Imported assets (files, thumbnails, categories)
│   │   ├── entity-store.ts     # Entity configurations
│   │   └── undo.ts             # Undo/redo stack (command pattern)
│   │
│   ├── io/
│   │   ├── importer.ts     # Import zip / folders / JSON configs
│   │   └── exporter.ts     # Export zip (scene-layout.json + entity-visuals.json + assets)
│   │
│   └── styles.css          # All styles, dark theme
```

## Reuse from Existing Code

The following modules from `tools/entity-editor/` should be **ported** (adapted, not copy-pasted blindly) into the new structure:

| Existing file | New location | What to keep |
|---|---|---|
| `src/assets/assets-tab.ts` | `panels/asset-manager.ts` + `panels/asset-palette.ts` | Grid view, search, category filter, import logic, thumbnail generation |
| `src/entities/entity-list.ts` | `panels/entity-editor.ts` | Entity CRUD |
| `src/entities/entity-config.ts` | `panels/entity-editor.ts` | State config forms |
| `src/entities/state-config.ts` | `panels/entity-editor.ts` | Spritesheet parameter UI, asset binding |
| `src/entities/spritesheet-explorer.ts` | `panels/entity-editor.ts` | Row detection, animated previews, click-to-select |
| `src/entities/preview-renderer.ts` | `panels/entity-editor.ts` | PixiJS animation preview |
| `src/app-state.ts` | `state/` split | Asset store, entity store data structures |
| `src/exporter.ts` | `io/exporter.ts` | Zip generation, JSON serialization |
| `src/importer.ts` | `io/importer.ts` | Zip parsing, backward compat |
| `src/scene/scene-canvas.ts` | `canvas/canvas.ts` | PixiJS init, zoom, pan |
| `src/scene/undo-manager.ts` | `state/undo.ts` | Command pattern |

**Do NOT reuse:** scene mode files (ground-mode.ts, decor-mode.ts, wall-mode.ts, select-mode.ts, position-mode.ts, route-mode.ts), scene-toolbar.ts, property-panel.ts, scene-renderer.ts. These are the failed implementations.

## Tech Stack

- **Vite** for dev server and build
- **TypeScript** strict mode, no `any`
- **PixiJS** for canvas rendering (sprites, graphics, text)
- **JSZip** for export/import
- **HTML/CSS** for all UI panels (no framework). `position: absolute` for floating panels, native drag for panel movement.
- **No React, No Vue, No UI library.** Vanilla TS + DOM manipulation.

## Visual Style

- Dark theme consistent with existing editor
- Background: #0d1117 (GitHub dark)
- Panel backgrounds: #161b22 with subtle border #30363d
- Accent color: #E8A851 (Sajou Ember)
- Text: #e6edf3
- Toolbar: slightly lighter than background, icon-based
- Selected elements: #58a6ff outline
- Grid lines: #21262d (very subtle)
- Panels have slight drop shadow for depth
- Rounded corners (4px) on panels

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| B | Background tool |
| O | Place tool |
| P | Position tool |
| R | Route tool |
| A | Toggle Asset Manager panel |
| E | Toggle Entity Editor panel |
| L | Toggle Layers panel |
| G | Toggle grid |
| Delete / Backspace | Delete selected elements |
| Ctrl+C | Copy selection |
| Ctrl+V | Paste |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+A | Select all |
| Escape | Deactivate tool / deselect / close popover |
| Space + drag | Pan canvas |
| Mouse wheel | Zoom |
| + / - | Zoom in/out |
| Ctrl+0 | Reset zoom to 100% |
| Ctrl+S | Quick save (download scene-layout.json) |

## Implementation Order

Phase 1: **Workspace shell**
- Canvas (PixiJS, zoom, pan, grid)
- Toolbar (tool buttons, panel toggles)
- Header (title, import/export buttons)
- Generic floating panel component
- State management skeleton

Phase 2: **Core tools**
- Select tool (click, drag, multi-select, delete, copy/paste)
- Place tool + Asset Palette panel (browse assets, click to place, ghost preview)
- Background tool (color picker, tile selection)
- Inspector panel (contextual properties)
- Undo/redo

Phase 3: **Positions & Routes**
- Position tool (place markers, name them)
- Route tool (connect positions)
- Layers panel

Phase 4: **Port existing panels**
- Asset Manager (full import/browse/categorize from existing code)
- Entity Editor (states, spritesheet explorer, preview from existing code)

Phase 5: **Export/Import**
- Export zip (scene-layout.json + entity-visuals.json + assets)
- Import zip (load previous exports)
- Quick save (Ctrl+S)

## Success Criteria

The Scene Builder is done when:

1. You can import a folder of assets (e.g. Tiny Swords or LimeZu Modern Office)
2. You can place sprites freely on the canvas to build a scene
3. You can define position markers and routes between them
4. You can configure entity animations using the spritesheet explorer
5. You can export a complete theme package (zip) that the Sajou runtime can load
6. All interactions feel responsive and intuitive — no mode confusion, no dead clicks, no empty panels
7. `tsc --noEmit` passes clean

## Notes for AI Agents

- **NEVER attempt to display large images.** Use `ls`, `file`, `identify` for dimensions.
- **Test every interaction.** After implementing a tool, verify it works by describing the expected behavior and checking the code paths.
- **Floating panels are HTML divs** with `position: absolute`, draggable by their header bar. Not PixiJS UI. The canvas is PixiJS; everything else is DOM.
- **Start with Phase 1.** Get the workspace shell running before adding tools.
- **Port, don't copy-paste.** The existing code has good logic but wrong structure. Extract the logic, adapt it to the new panel architecture.
- **The Generic Panel component is critical.** Get it right first — draggable, resizable, closeable, with header and content area. Every panel uses it.
