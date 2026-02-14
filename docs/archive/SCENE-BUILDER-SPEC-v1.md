# Sajou Scene Builder — Specification V2

## Context

The current theme editor (`tools/entity-editor/`) has 3 tabs: Assets, Entities, Scene. The Assets and Entities tabs are functional and well-tested. The Scene tab has been attempted twice and failed — the mode-switching UX (Ground/Decor/Walls/Positions/Routes/Select as sub-tabs) is confusing and non-functional.

**Decision: freeze the current Scene tab code and rewrite the entire editor as a unified, canvas-first workspace.**

The new editor is called **sajou Scene Builder**.

## Purpose

The Scene Builder is the **visual authoring tool for sajou themes**. Its output is a theme package that the sajou runtime can load and animate. Concretely, it produces:

- A **ThemeManifest** (aligned with `@sajou/theme-api`) containing:
  - Scene layout (dimensions, named positions, routes)
  - Entity definitions (identity, visual states, defaults)
  - Asset manifest (base path, preload list)
  - Theme metadata (id, name, version, capabilities)
- A **ZIP archive** bundling the manifest JSON, entity-visuals JSON, scene-layout JSON, and all referenced asset files.

The Scene Builder is NOT a generic image editor. It is an **entity-centric scene editor** — you place and configure **entities** (defined by visual states), not raw images. Assets are imported as source material; entities are what appear in the scene.

## Design Philosophy

The canvas is the product. Everything else serves the canvas.

Inspired by: Figma (floating panels, contextual UI), Excalidraw (simplicity, canvas-first), LDtk (level editor with tile placement), Blender (dockable panels, workspace flexibility).

Anti-patterns to avoid:
- Tab switching that loses visual context
- Empty columns that waste screen space
- Mode switching that requires mental model changes
- Separating related workflows into different views
- Treating the editor as a generic pixel canvas (it builds sajou scenes, not images)

## Architecture

One full-screen workspace. No tabs. No page navigation. Everything is a **panel** that floats over the canvas.

```
┌──────────────────────────────────────────────────────────┐
│  [logo]  sajou Scene Builder              [Import] [Export]│
│                                                          │
│  ┌──┐                                                    │
│  │V │  ┌──────────────┐                                  │
│  │H │  │              │                                  │
│  │B │  │ Entity       │         CANVAS (PixiJS)          │
│  │O │  │ Palette      │                                  │
│  │P │  │  (floating)  │                   ┌────────────┐ │
│  │R │  │              │                   │ Entity     │ │
│  ├──┤  └──────────────┘                   │ Inspector  │ │
│  │📦│                                     │ (floating) │ │
│  │🔧│                                     └────────────┘ │
│  └──┘                                                    │
│                                    ┌───────────────────┐ │
│                                    │ Layers  (floating)│ │
│   [- 100% +]                       └───────────────────┘ │
│   [▶ Preview]                                            │
└──────────────────────────────────────────────────────────┘
```

### Canvas (PixiJS)

Full-screen, behind all panels. This is where the scene is built.

- **Zoom**: mouse wheel, centered on cursor. Zoom bar in bottom-left with +/- buttons, percentage display, and preset menu (25% / 50% / 100% / 200% / Fit).
- **Pan**: middle-click drag, Space + left-click drag, or Hand tool (H).
- **Grid**: toggleable overlay (shortcut G). Configurable cell size: 16 / 32 / 64 px. Subtle lines, should not dominate.
- **Scene boundary**: the scene area (960x640 by default) is rendered with a distinct fill (brand surface) against the darker void (brand bg), with a visible border. This makes it clear where the scene ends.
- **Cursor feedback**: cursor changes per active tool — default (Select), grab/grabbing (Hand), crosshair (Place, Position, Route), default (Background). Space+drag always shows grab/grabbing regardless of tool.
- **Background**: configurable via Background tool. Solid color or tiled asset.
- **Animated entities**: GIF and spritesheet-based entities animate in real-time on the canvas. Not static thumbnails.

### Toolbar (left edge, vertical, fixed)

A thin vertical bar (~40px wide) pinned to the left edge. Two sections separated by a divider line. Lucide Icons for all buttons (per brand guidelines).

**Top section — Canvas tools:**

| Icon | Name | Shortcut | Behavior |
|------|------|----------|----------|
| mouse-pointer | Select | V | Click to select elements. Drag to move. Rubber-band for multi-select. |
| hand | Hand | H | Click-drag to pan the canvas. Equivalent to Space+drag but as a dedicated tool. |
| image | Background | B | Opens a small popover: color picker OR click an asset to tile it. |
| stamp | Place | O | Opens the Entity Palette panel. Click entity, then click canvas to place. |
| map-pin | Position | P | Click canvas to place a named position marker. |
| route | Route | R | Click position A, then position B to create a route. |

**Bottom section — Panels:**

| Icon | Name | Shortcut | Behavior |
|------|------|----------|----------|
| folder-open | Assets | A | Toggle the Asset Manager panel (import, browse, categorize). |
| box | Entities | E | Toggle the Entity Editor panel (define entities, visual states, spritesheet explorer). |
| layers | Layers | L | Toggle the Layers panel. |
| settings | Settings | -- | Scene dimensions, grid size, theme metadata, export settings. |

Active tool is highlighted (accent color). Active panels have a dot indicator below the icon.

### Entity Palette (floating panel)

Opens when Place tool (O) is active, or toggled independently.

- **Position**: floating, draggable by header, remembers position.
- **Size**: ~250px wide, resizable vertically. Compact.
- **Content**: grid of entity thumbnails. Each shows the entity's idle state visual with its `displayWidth × displayHeight`. GIFs and spritesheets show animated previews.
- **Search**: filter field at top.
- **Categories**: filter by entity tags (from entity definitions). "All" by default.
- **Interaction**: click an entity → it becomes the "active brush". Cursor changes to crosshair. Click on canvas → entity instance is placed at that position. Click another entity → changes the brush. Press Escape → deactivates brush.
- **Info on hover**: tooltip showing entity ID, display size, number of states, visual type.
- **Grid snap**: when grid is enabled, placed entities snap to grid cells.

**Important**: the palette shows **entities** (from entity-store), not raw assets. An entity is an asset that has been configured with visual states, display dimensions, and a fallback color. Raw assets appear in the Asset Manager; entities appear in the Entity Palette.

### Asset Manager (floating panel)

The full asset management interface. This is where raw files are imported and organized before they become entity visuals.

- **Import**: drag & drop files/folders, or file picker button. Supports PNG, SVG, WebP, GIF, JPEG.
- **GIF support**: animated GIFs are imported as-is. Frame count and dimensions are detected. GIF thumbnails show the first frame with an animation badge.
- **Browse**: grid view with thumbnails. Tree view optional.
- **Categories**: create categories, assign assets to categories (multi-select + dropdown). Categories derive from folder structure on import.
- **Search**: filter by name.
- **Detail**: click an asset → see full info (filename, path, dimensions, file size, format, category, frame count for GIFs/spritesheets).
- This panel is independent of the Place tool. It's for asset management/organization.

### Entity Editor (floating panel)

The entity definition interface. This is where assets are transformed into entities with visual states.

- **Entity list**: left sidebar within the panel. Add/rename/delete entities.
- **State config**: each entity has named visual states (idle, walk, attack...). Each state has:
  - Type: `static` (single image), `spritesheet` (animated), or `gif` (animated GIF)
  - Asset binding: click an asset in the Asset Manager or drag it
  - For static: optional sourceRect crop
  - For spritesheet: frameWidth, frameHeight, frameCount, frameRow, frameStart, fps, loop
  - For GIF: fps override, loop toggle
- **Display properties**: displayWidth, displayHeight, fallbackColor (shared across all states).
- **Entity defaults**: scale, anchor point, zIndex, opacity (maps to `EntityDefaults` in theme-api).
- **Tags**: free-text tags for entity grouping (e.g., "unit", "building", "decoration").
- **Spritesheet Explorer**: appears when a spritesheet asset is selected. Row detection, frame range selection, animated preview per row.
- **Preview**: live animation preview of the selected state within the panel.
- **This is existing code from entity-editor** — port the logic, repackage as a floating panel. Don't rewrite from scratch.

### Entity Inspector (floating panel, contextual)

Opens when an element is selected on canvas. This IS the entity editor in contextual mode — it shows and edits properties of the selected entity instance.

**For a placed entity:**
- Entity ID + animated thumbnail (current visual state)
- Instance name (editable, auto-generated default)
- Position: X, Y (editable number fields)
- Scale: uniform slider
- Rotation: angle slider (0-360°)
- Layer: dropdown (background / midground / foreground)
- Opacity: slider (0-100%)
- Flip H / Flip V toggles
- Visual state: dropdown to switch between entity's defined states (idle, walk, etc.)
- "Edit Entity" button → opens the Entity Editor panel focused on this entity's definition

**For a position marker:**
- Name (editable text field, semantic name used by choreographies)
- Position: X, Y
- Color: color picker (visual only, for editor readability)
- Entity binding: optional dropdown to associate a default entity (e.g., "this position spawns a peon")
- Type hint: dropdown (spawn / waypoint / destination / generic)

**For a route:**
- Name (editable text field)
- From → To (position names, read-only)
- Style: solid / dashed
- Color
- Bidirectional toggle (A→B only, or A↔B)

**For background config:**
- Type: solid color / tiled asset
- Color picker (if solid)
- Asset selector (if tiled)

### Layers Panel (floating panel)

Toggleable (shortcut L). Shows all elements organized by type.

```
▼ Background
  [tile] grass-tile (tiled)
▼ Entities (12)
  [box] peon-01      [eye] [lock]
  [box] tree-03      [eye] [lock]
  ...
▼ Positions (4)
  [pin] spawnPoint
  [pin] forge
  [pin] oracle
  [pin] entrance
▼ Routes (2)
  [route] entrance → forge
  [route] forge → oracle
```

- **Click**: selects the element on canvas (and in inspector).
- **Eye icon**: toggle visibility.
- **Lock icon**: toggle lock (locked elements can't be moved/deleted).
- **Drag**: reorder elements within their group (changes z-order for entities).
- **Group headers**: click to collapse/expand. Count in parentheses.

### Settings Panel (floating panel)

Scene-wide configuration.

- **Theme metadata**: id, name, version, description (for the exported ThemeManifest).
- **Scene dimensions**: width × height (default 960×640).
- **Grid**: size (16/32/64), snap toggle.
- **Capabilities**: checkboxes for visualTypes, sound, perspective (maps to ThemeCapabilities).
- **Asset base path**: the base path for all asset references in the export.

## Interactions

### Placing entities

1. Select Place tool (O) or click an entity in the Entity Palette.
2. Cursor becomes crosshair with a **ghost preview** of the entity (semi-transparent, follows cursor). If the entity has animation, the ghost animates.
3. Click on canvas → entity instance is placed at that position. A new `PlacedEntity` is added to the scene-state.
4. Can keep clicking to place multiple instances (**stamp mode**).
5. Press Escape or switch tool to stop placing.
6. Placed entities are immediately selectable with Select tool (V).

### Selecting and editing

1. Select tool (V) is the default.
2. Click an element → selected (accent outline). Inspector opens with properties.
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
4. Select a marker → rename in Inspector. Give it a semantic name (e.g., "forge", "spawnPoint").
5. Drag to reposition.
6. Positions are semantic — they map to `ThemeLayout.positions` in the exported manifest. Choreographies reference positions by name.

### Routes

1. Select Route tool (R).
2. Click on a position marker → it highlights as "start".
3. Click on another position marker → a line is drawn between them. Route created.
4. Press Escape to cancel if only start is selected.
5. Routes are semantic paths that entities can follow. In the runtime, a choreography `move` action can reference a route to animate an entity along the path between two positions.
6. Routes appear as dashed/solid lines on canvas with directional indicators.

### Preview mode

1. Click the **▶ Preview** button (bottom-left, near zoom bar).
2. The canvas enters preview mode: the editing overlay hides, entities animate in their idle states.
3. Entities at positions bound to an entity type are shown at their bound positions.
4. Optional: a mini signal emitter sends test signals (task_dispatch, tool_call) and the preview animates entities along routes using basic choreography (move from position A to B).
5. Click **■ Stop** to exit preview and return to editing.

## Data Model

### Core principle: entity-centric

The scene contains **placed entities**, not raw assets. Every element on the canvas is either:
- A `PlacedEntity` (an instance of a defined entity at a specific position)
- A `ScenePosition` (a semantic marker for choreographies)
- A `SceneRoute` (a path between two positions)
- A background (solid color or tiled asset)

### Scene State (in memory)

```typescript
interface SceneState {
  dimensions: { width: number; height: number };
  background: {
    type: 'solid' | 'tiled';
    color?: string;
    assetPath?: string;
  };
  entities: PlacedEntity[];     // was "objects"
  positions: ScenePosition[];
  routes: SceneRoute[];
}

interface PlacedEntity {
  id: string;                   // unique instance ID (e.g., "peon-01")
  entityId: string;             // reference to entity definition in entity-store
  x: number;
  y: number;
  scale: number;                // uniform scale (entity defaults can be overridden)
  rotation: number;             // degrees
  layer: 'background' | 'midground' | 'foreground';
  opacity: number;              // 0-1
  flipH: boolean;
  flipV: boolean;
  locked: boolean;
  visible: boolean;
  activeState: string;          // which visual state to display (e.g., "idle")
}

interface ScenePosition {
  id: string;
  name: string;                 // semantic name used by choreographies
  x: number;
  y: number;
  color: string;                // editor visual only
  entityBinding?: string;       // optional entity ID — "this position spawns this entity"
  typeHint: 'spawn' | 'waypoint' | 'destination' | 'generic';
}

interface SceneRoute {
  id: string;
  name: string;
  from: string;                 // position ID
  to: string;                   // position ID
  style: 'solid' | 'dashed';
  color: string;
  bidirectional: boolean;       // A→B only, or A↔B
}
```

### Entity Definition (in entity-store)

Aligned with `@sajou/theme-api` `EntityDefinition`:

```typescript
interface EntityEntry {
  id: string;
  tags: string[];
  displayWidth: number;
  displayHeight: number;
  fallbackColor: string;
  defaults: {
    scale?: number;
    anchor?: [number, number];
    zIndex?: number;
    opacity?: number;
  };
  visual: EntityVisual;         // discriminated union: sprite | spritesheet | gif
  sounds?: Record<string, string>;
}
```

Visual types:

```typescript
// Static image
interface SpriteVisual {
  type: 'sprite';
  source: string;               // asset path
  sourceRect?: { x: number; y: number; w: number; h: number };
}

// Animated spritesheet
interface SpritesheetVisual {
  type: 'spritesheet';
  source: string;               // asset path
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, {
    frames: number[];
    fps: number;
    loop?: boolean;
  }>;
}

// Animated GIF
interface GifVisual {
  type: 'gif';
  source: string;               // asset path to GIF file
  fps?: number;                 // override GIF's native timing
  loop?: boolean;
}

type EntityVisual = SpriteVisual | SpritesheetVisual | GifVisual;
```

### Export Format

The Scene Builder exports a **ZIP archive** containing:

#### 1. `theme-manifest.json` — The ThemeManifest

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "description": "A custom sajou theme",
  "capabilities": {
    "visualTypes": ["sprite", "spritesheet"],
    "sound": false,
    "perspective": false
  },
  "entities": {
    "peon": {
      "id": "peon",
      "tags": ["unit", "worker"],
      "defaults": { "scale": 1.0, "anchor": [0.5, 1.0], "zIndex": 10 },
      "visual": {
        "type": "spritesheet",
        "source": "entities/peon-sheet.png",
        "frameWidth": 64,
        "frameHeight": 64,
        "animations": {
          "idle": { "frames": [0], "fps": 1 },
          "walk": { "frames": [0, 1, 2, 3], "fps": 12, "loop": true }
        }
      }
    },
    "tree": {
      "id": "tree",
      "tags": ["decoration"],
      "defaults": { "scale": 1.0, "anchor": [0.5, 1.0] },
      "visual": {
        "type": "sprite",
        "source": "decor/tree-01.png"
      }
    }
  },
  "layout": {
    "sceneWidth": 960,
    "sceneHeight": 640,
    "positions": {
      "spawnPoint": { "x": 50, "y": 300 },
      "forge": { "x": 400, "y": 200 },
      "oracle": { "x": 700, "y": 100 }
    }
  },
  "assets": {
    "basePath": "./assets",
    "preload": [
      "entities/peon-sheet.png",
      "decor/tree-01.png",
      "terrain/grass-tile.png"
    ]
  }
}
```

#### 2. `scene-layout.json` — Scene decoration and placement

```json
{
  "$schema": "sajou-scene-layout-v1",
  "dimensions": { "width": 960, "height": 640 },
  "background": { "type": "tiled", "asset": "terrain/grass-tile.png" },
  "entities": [
    {
      "entityId": "tree",
      "instanceId": "tree-01",
      "x": 120, "y": 340,
      "scale": 1, "rotation": 0,
      "layer": "background",
      "opacity": 1,
      "flipH": false, "flipV": false,
      "activeState": "idle"
    },
    {
      "entityId": "peon",
      "instanceId": "peon-01",
      "x": 50, "y": 300,
      "scale": 1, "rotation": 0,
      "layer": "midground",
      "opacity": 1,
      "flipH": false, "flipV": false,
      "activeState": "idle"
    }
  ],
  "positions": [
    { "name": "spawnPoint", "x": 50, "y": 300, "typeHint": "spawn", "entityBinding": "peon" },
    { "name": "forge", "x": 400, "y": 200, "typeHint": "destination" },
    { "name": "oracle", "x": 700, "y": 100, "typeHint": "destination" }
  ],
  "routes": [
    { "name": "main-path", "from": "spawnPoint", "to": "forge", "style": "dashed", "bidirectional": false },
    { "name": "forge-oracle", "from": "forge", "to": "oracle", "style": "solid", "bidirectional": true }
  ]
}
```

#### 3. `entity-visuals.json` — Legacy/simplified entity visual config

Retained for backward compatibility with the existing entity-editor export format:

```json
{
  "entities": {
    "peon": {
      "displayWidth": 64,
      "displayHeight": 64,
      "fallbackColor": "#4488ff",
      "states": {
        "idle": { "type": "static", "asset": "entities/peon-sheet.png", "sourceRect": { "x": 0, "y": 0, "w": 64, "h": 64 } },
        "walk": { "type": "spritesheet", "asset": "entities/peon-sheet.png", "frameWidth": 64, "frameHeight": 64, "frameCount": 4, "frameRow": 0, "frameStart": 0, "fps": 12, "loop": true }
      }
    }
  }
}
```

#### 4. `assets/` — All referenced asset files

Every image/GIF/spritesheet referenced by entities or background, organized by their import path.

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
│   │   ├── renderer.ts     # State → PixiJS sync (entities, positions, routes, bg)
│   │   ├── selection.ts    # Selection overlay, rubber-band, handles
│   │   └── ghost.ts        # Ghost preview when placing entities
│   │
│   ├── tools/
│   │   ├── select.ts       # Select tool logic
│   │   ├── background.ts   # Background tool (popover)
│   │   ├── place.ts        # Place entity tool
│   │   ├── position.ts     # Position marker tool
│   │   └── route.ts        # Route drawing tool
│   │
│   ├── panels/
│   │   ├── entity-palette.ts   # Entity grid for placing (was asset-palette)
│   │   ├── asset-manager.ts    # Full asset management (import, browse, categorize)
│   │   ├── entity-editor.ts    # Entity definition (visual states, spritesheet explorer, preview)
│   │   ├── inspector.ts        # Entity inspector for selected element
│   │   ├── layers.ts           # Layer list with visibility/lock
│   │   └── settings.ts         # Theme metadata, scene config
│   │
│   ├── state/
│   │   ├── scene-state.ts      # Scene data (entities, positions, routes, bg)
│   │   ├── editor-state.ts     # UI state (active tool, selected elements, panel positions)
│   │   ├── asset-store.ts      # Imported assets (files, thumbnails, categories)
│   │   ├── entity-store.ts     # Entity definitions (visual configs)
│   │   └── undo.ts             # Undo/redo stack (command pattern)
│   │
│   ├── io/
│   │   ├── importer.ts     # Import zip / folders / JSON configs
│   │   └── exporter.ts     # Export zip (theme-manifest + scene-layout + entity-visuals + assets)
│   │
│   ├── preview/
│   │   └── preview-mode.ts # Preview playback with simulated signals
│   │
│   └── styles.css          # All styles, Ember brand theme
```

## Reuse from Existing Code

The following modules from `tools/entity-editor/` should be **ported** (adapted, not copy-pasted blindly) into the new structure:

| Existing file | New location | What to keep |
|---|---|---|
| `src/assets/assets-tab.ts` | `panels/asset-manager.ts` + `panels/entity-palette.ts` | Grid view, search, category filter, import logic, thumbnail generation |
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
- **PixiJS** for canvas rendering (sprites, animated sprites, graphics, text)
- **JSZip** for export/import
- **HTML/CSS** for all UI panels (no framework). `position: absolute` for floating panels, native drag for panel movement.
- **No React, No Vue, No UI library.** Vanilla TS + DOM manipulation.

## Visual Style

Aligned with `docs/brand/sajou-brand_dev-kit_001/SAJOU-BRAND.md` (Ember theme):

- Background (void): `#07070C` (--color-bg)
- Surface: `#0E0E16` (--color-surface)
- Elevated: `#14141F` (--color-elevated)
- Accent: `#E8A851` (--color-accent), light `#F0C06A`, dim `#A07232`
- Text: `#E8E8F0`, muted `#6E6E8A`, dim `#3A3A52`
- Border: `#1E1E2E`, hover `#2E2E44`
- Selection: `#58a6ff` outline
- Typography: Sora (display), JetBrains Mono (code/labels), DM Sans (body)
- Border radius scale: 4/6/8/10px (sm/md/lg/xl)
- Icons: Lucide (inline SVG, stroke="currentColor")
- sajou logomark in header (from brand kit SVG)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| H | Hand tool (pan) |
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
| Ctrl+Y | Redo (alternative) |
| Ctrl+A | Select all |
| Escape | Deactivate tool / deselect / close popover |
| Space + drag | Pan canvas (temporary, regardless of active tool) |
| Mouse wheel | Zoom (centered on cursor) |
| + / = | Zoom in (step) |
| - | Zoom out (step) |
| Ctrl+0 | Reset zoom to 100% |
| Ctrl+1 | Fit scene to viewport |
| Ctrl+S | Quick save (download theme package ZIP) |

## Implementation Order

Phase 1: **Workspace shell** *(done)*
- Canvas (PixiJS, zoom, pan, grid, scene boundary rectangle)
- Toolbar (tool buttons including Hand tool, panel toggles, Lucide icons)
- Header (sajou logomark, title, import/export buttons)
- Generic floating panel component (draggable, resizable, closeable)
- Zoom bar (±, percentage display, preset menu: 25/50/100/200/Fit)
- Cursor feedback per active tool
- Hand tool (H) for dedicated view panning
- Keyboard shortcuts (all tools, panels, grid, zoom ±, Ctrl+0, Ctrl+1)
- State management skeleton (scene-state, editor-state, asset-store, entity-store, undo)

Phase 2: **Asset import + Entity definition + Place tool + Scene renderer**
- Asset import (drag & drop files/folders, file picker) into asset-store. GIF support.
- Entity Editor panel (define entities from imported assets: visual states, spritesheet explorer, display dimensions, tags, defaults)
- Entity Palette panel (grid of defined entities with animated thumbnails, search, tag filter)
- Scene renderer (scene-state → PixiJS sync: placed entities with animation, positions, routes, background)
- Place tool (select entity from palette, animated ghost preview, click to place, stamp mode)
- Background tool (color picker popover, tile selection)
- Select tool (click, drag, multi-select, rubber-band, delete, copy/paste)
- Entity Inspector panel (contextual editor for selected element: position, scale, rotation, visual state, layer)
- Undo/redo wired to all scene-mutating actions

Phase 3: **Positions, Routes & Layers**
- Position tool (place semantic markers, name them, type hints, entity binding)
- Route tool (connect positions, bidirectional toggle)
- Layers panel (visibility, lock, z-order reorder)
- Settings panel (theme metadata, scene dimensions, capabilities)

Phase 4: **Export/Import**
- Export ZIP (theme-manifest.json + scene-layout.json + entity-visuals.json + assets/)
- Import ZIP (load previous exports, backward compat with entity-editor format)
- Quick save (Ctrl+S)

Phase 5: **Preview mode**
- Preview button in bottom bar (next to zoom controls)
- Enters playback mode: hides editing UI, entities animate at their idle states
- Optional signal emitter integration: send test signals, animate entities along routes
- Stop button to return to editing

Phase 6: **Port existing panels (refinement)**
- Asset Manager: full import/browse/categorize ported from existing entity-editor code
- Entity Editor: full spritesheet explorer, preview renderer ported from existing code
- Polish: drag & drop between panels, keyboard navigation within panels

## Alignment with @sajou packages

The Scene Builder's output must be consumable by the sajou runtime. The key contracts:

| Scene Builder concept | @sajou/theme-api type | Notes |
|---|---|---|
| Theme metadata (id, name, version...) | `ThemeManifest` | Top-level manifest identity |
| Entity definitions | `EntityDefinition` | id, tags, defaults, visual (discriminated union), sounds |
| Entity visual types | `EntityVisual` (SpriteVisual, SpritesheetVisual...) | Scene Builder adds GifVisual for editor convenience; export converts to spritesheet or sprite for runtime |
| Named positions | `ThemeLayout.positions` | Map of name → {x, y} |
| Scene dimensions | `ThemeLayout.sceneWidth/sceneHeight` | From scene-state.dimensions |
| Asset references | `AssetManifest` | basePath + preload list |
| Capabilities | `ThemeCapabilities` | visualTypes, sound, perspective |

**GIF handling at export**: the runtime (`@sajou/theme-api`) does not define a `gif` visual type. At export time, GIF entities are either:
1. Converted to spritesheet format (frames extracted, saved as PNG strip), or
2. Kept as-is with a `sprite` type (first frame) and a note that the runtime should handle GIF playback.

The Scene Builder is the primary authoring tool. The exported ThemeManifest is what `ThemeContract.manifest` returns when the theme is loaded.

## Success Criteria

The Scene Builder is done when:

1. You can import a folder of assets (PNG, SVG, GIF, spritesheets)
2. You can define entities with visual states (static, animated, GIF)
3. You can place entity instances on the canvas with animated preview
4. You can define semantic positions and routes between them
5. You can preview the scene with entities animating at their positions
6. You can export a ThemeManifest-compatible ZIP that the sajou runtime can load
7. All interactions feel responsive and intuitive — no mode confusion, no dead clicks, no empty panels
8. `tsc --noEmit` passes clean

## Notes for AI Agents

- **NEVER attempt to display large images.** Use `ls`, `file`, `identify` for dimensions.
- **Test every interaction.** After implementing a tool, verify it works by describing the expected behavior and checking the code paths.
- **Floating panels are HTML divs** with `position: absolute`, draggable by their header bar. Not PixiJS UI. The canvas is PixiJS; everything else is DOM.
- **Entity-centric, not asset-centric.** The palette shows entities, not raw files. Assets are source material; entities are what lives in the scene.
- **Port, don't copy-paste.** The existing entity-editor code has good logic but wrong structure. Extract the logic, adapt it to the new panel architecture.
- **The Generic Panel component is critical.** Get it right first — draggable, resizable, closeable, with header and content area. Every panel uses it.
- **Respect the brand.** All colors, fonts, icons, border-radius must follow `SAJOU-BRAND.md`. The Ember palette is the source of truth.
- **The export format is the contract.** The ThemeManifest JSON must be valid input for `@sajou/theme-api`. Test the output structure against the interfaces.
