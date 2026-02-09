# Scene Builder — Phase 2 Spec Draft

> **Scope**: Position tool, Route tool (with waypoints & curves).
> **Status**: Draft V2 — updated after feedback.
> **Pre-requisites**: Phase 1 complete (canvas, select, hand, background, place, layers, inspector, entity editor, asset manager, scene renderer).

---

## Context: What Positions & Routes Are For

The Scene Builder is not just a sprite editor. It's a **choreography authoring tool**. The scene it produces feeds the sajou runtime, where:

- **Signals** arrive (e.g. `task_dispatch`, `tool_call`, `error`)
- The **Choreographer** interprets them into actions (e.g. `"move peon to forge"`)
- The **Theme** renders those actions visually

Positions and routes are the **spatial vocabulary** of choreographies:

```
Signal: task_dispatch
  → Choreography: spawn peon at "spawnPoint", move along route "spawnToForge"
  → Runtime: peon appears at (100, 300), walks the path to (320, 480)
```

**Positions** = named locations where things happen ("forge", "oracle", "spawnPoint").
**Routes** = paths entities follow to get between positions. Not straight lines — real navigation through a scene (corners, curves, corridors).

Without these, the choreographer has nothing to reference. The scene is just a pretty picture with no semantic structure.

---

## Place Tool vs Position Tool — Clarification

These are **different concepts**, and their overlap in the toolbar was confusing. Here's the distinction:

| | Place Tool (O) | Position Tool (P) |
|---|---|---|
| **Creates** | Entity instances (sprites on the canvas) | Semantic position markers |
| **Purpose** | Visual composition (decor, characters) | Choreography semantics (where things happen) |
| **Runtime impact** | Static scenery (trees, buildings, background art) | Dynamic — referenced by choreographies |
| **Analogy** | Placing furniture in a room | Marking "the stage", "the exit", "the entrance" |

**Decision**: Remove Place tool (O) from the main toolbar. Entity placement already works via:
- Drag & drop from Asset Manager
- "Origin" / "Center" buttons in Asset Manager detail
- Entity Palette click (which activates Place mode)

The Place tool remains in the codebase as the handler for Entity Palette placement, but loses its toolbar button. The freed-up toolbar slot simplifies the tool set:

```
V  Select
H  Hand
B  Background (Scene)
P  Position
R  Route
```

---

## Architecture Recap

### Stores (4 independent pub/sub)

| Store | Data | Mutated by |
|-------|------|------------|
| `scene-state` | `SceneState` (dimensions, background, layers, entities, **positions**, **routes**) | Undo commands |
| `editor-state` | `EditorState` (activeTool, selectedIds, panels, grid, snap, activeLayer) | Direct setters |
| `entity-store` | Entity definitions | `setEntity()` / `removeEntity()` |
| `asset-store` | Imported asset files | `addAssets()` / `selectAsset()` |

### Canvas layers (PixiJS containers, z-ordered)

```
ground      → background fill rect
objects     → placed entities (sorted by layerOrder * 10000 + entityZ)
positions   → position markers        ← Phase 2
routes      → route paths + waypoints  ← Phase 2
selection   → selection overlay (all tools share this)
```

### Tool handler pattern

```typescript
CanvasToolHandler { onMouseDown?, onMouseMove?, onMouseUp? }
```

Swapped via `setToolHandler()` when `activeTool` changes. All state mutations go through `executeCommand(cmd: UndoableCommand)`.

---

## 0. Semantic Entities (Actors)

### 0.1 The Problem

Entities placed on the canvas (trees, buildings, doors) are currently static decor. But some decor needs to **react to choreographies** — a door opens when a peon walks through, a torch lights up, a flag rises.

These entities are not characters that move between positions. They are **reactive decor** — they stay in place but change visual state in response to choreography actions (`setState`, `animate`, `destroy`).

### 0.2 Solution: `semanticId` on PlacedEntity

A single optional field on `PlacedEntity` makes any placed entity **choreography-addressable**:

```typescript
interface PlacedEntity {
  // ... existing fields ...

  /**
   * Optional semantic identifier for choreographies.
   * When set, this entity becomes an "actor" — choreographies can target it
   * by this name (e.g. setState "door-kitchen" → "open").
   * Must be unique across all placed entities. Undefined = passive decor.
   */
  semanticId?: string;
}
```

### 0.3 Passive Decor vs Actors

| | Passive Decor | Actor |
|---|---|---|
| **Example** | Tree, wall, ground texture | Door, torch, flag, lever |
| **`semanticId`** | `undefined` | `"door-kitchen"`, `"torch-01"` |
| **Referenced by choreographies** | No | Yes (`setState`, `animate`, `destroy`) |
| **Changes state at runtime** | No | Yes (choreographer can change `activeState`) |
| **Visual hint in editor** | Normal sprite | Small ◆ badge on sprite corner |

### 0.4 Choreography Example

```
Signal: task_dispatch → peon walks from kitchen to forge

Sequence:
  1. setState "door-kitchen" → "opening"     ← door plays open animation
  2. wait 500ms
  3. setState "door-kitchen" → "open"        ← door stays open
  4. move "peon" via "kitchenToForge"         ← peon walks through
  5. setState "door-kitchen" → "closing"     ← door closes behind
  6. wait 500ms
  7. setState "door-kitchen" → "closed"
```

### 0.5 Inspector Integration

When an entity is selected, the inspector shows a new field:

```
Instance:    door-kitchen-a3f2x  (read-only, auto-generated)
Entity:      door                (read-only, entity definition)
Semantic ID: [door-kitchen    ]  (optional, editable, must be unique)
```

When `semanticId` is set, a small diamond badge appears on the entity's sprite in the canvas to visually distinguish actors from passive decor.

### 0.6 Implementation

- Add `semanticId?: string` to `PlacedEntity` in `types.ts`
- Add "Semantic ID" field in `inspector-panel.ts` entity inspector
- Validate uniqueness on change (revert if duplicate)
- Render actor badge in `scene-renderer.ts` (small ◆ at top-right corner of entity)
- Undo integration for semanticId changes

---

## 1. Position Tool (P)

### 1.1 What a Position Is

A **named semantic location** on the scene. Choreographies reference positions by name:

```json
{ "action": "move", "entity": "peon", "to": "forge", "via": "spawnToForge" }
```

The position is not an entity. It has no sprite, no animation. It's a coordinate with a name and metadata. Its visual representation (diamond marker + label) is **editor-only** — it does not appear in the exported runtime scene.

### 1.2 Types

Already defined in `types.ts`:

```typescript
type PositionTypeHint = "spawn" | "waypoint" | "destination" | "generic";

interface ScenePosition {
  id: string;
  name: string;            // semantic name used by choreographies
  x: number;
  y: number;
  color: string;           // editor-only visual
  entityBinding?: string;  // "this position spawns this entity type"
  typeHint: PositionTypeHint;
}
```

**`typeHint` semantics:**
- `spawn` — entities appear here (choreography `spawn` action targets this position)
- `destination` — entities travel to here (choreography `move` action targets this)
- `waypoint` — intermediate point, not directly referenced by choreographies but used as a route anchor
- `generic` — no specific semantic, available for custom choreographies

**`entityBinding`** — ties a position to an entity type. A `spawn` position with `entityBinding: "peon"` means "when a choreography says `spawn at spawnPoint`, create a peon." This is the bridge between the scene layout and the choreography data.

### 1.3 Interactions

#### Creating a position

1. Activate Position tool (P).
2. Click on canvas → creates a `ScenePosition` at click coordinates (grid-snapped).
3. Defaults:
   - `id`: `pos-${Date.now().toString(36)}`
   - `name`: `"position-N"` (auto-increment)
   - `color`: cycle through palette (§1.6)
   - `typeHint`: `"generic"`
   - `entityBinding`: undefined
4. Position is immediately selected, inspector opens with position fields.

#### Selecting

- **Position tool active**: click a marker to select. Ctrl/Cmd+Click for multi-select. Click empty to deselect.
- **Other tools active**: positions are NOT selectable (avoids accidents). They appear as ghosts.

#### Moving

- Click-drag a selected position marker. Grid snap + center snap + guide lines apply.
- Connected routes update live (their endpoints follow).
- All moves via undo.

#### Deleting

- Select position(s), press Delete/Backspace.
- **Cascade**: routes that reference deleted positions are also removed.
- **Compound undo**: undoing restores both positions and their routes.

### 1.4 Inspector Fields (Position mode)

| Field | Type | Notes |
|-------|------|-------|
| ID | read-only | `pos-xxxx` |
| Name | text input | Semantic name for choreographies. Unique across positions. |
| X | number | Scene pixels. Undo on change. |
| Y | number | Scene pixels. Undo on change. |
| Type | dropdown | `spawn` / `waypoint` / `destination` / `generic` |
| Color | color picker | Editor visual only. |
| Entity Binding | dropdown | All entity IDs from store + "None". Visible for all types, most meaningful for `spawn`. |

### 1.5 Canvas Rendering

Rendered in `layers.positions` container.

**Marker**: Diamond shape (rotated square), 12×12 scene px, filled `position.color`, 1px darker stroke.

**Label**: Position name above the marker. JetBrains Mono 10px. Semi-transparent dark pill background. Text color: `position.color`.

**Type badge**: Small letter in corner of diamond: **S** (spawn), **W** (waypoint), **D** (destination), nothing (generic).

**States**:
- Default: 12×12, normal stroke
- Hover: 14×14, subtle glow
- Selected: 16×16, blue stroke (#58a6ff), blue label background

**Ghost mode**: When Position tool is NOT active, markers render at 40% opacity. Positions are always visible when Position tool is active.

### 1.6 Color Palette

Auto-cycling through 8 distinct colors:

```typescript
const POSITION_COLORS = [
  "#E8A851",  // amber (brand accent)
  "#58a6ff",  // blue
  "#7ee787",  // green
  "#f778ba",  // pink
  "#d2a8ff",  // purple
  "#ffa657",  // orange
  "#79c0ff",  // light blue
  "#ff7b72",  // red
];
```

---

## 2. Route Tool (R)

### 2.1 What a Route Is

A **navigable path** between two positions. When a choreography says `"move peon to forge"`, the runtime needs to know *how* the peon gets there — not just the destination, but the path it follows.

A straight line between two points is unrealistic for most scenes. An entity navigating a citadel scene needs to:
- Walk around buildings
- Follow corridors
- Turn corners (right angles for indoor, curves for outdoor)
- Navigate between obstacles

**A route is a polyline with waypoints**, optionally smoothed into curves.

### 2.2 Types — Updated

The current `SceneRoute` type is too simple (just `from`/`to`). It needs **waypoints** for real navigation paths:

```typescript
/** A waypoint along a route path. */
interface RouteWaypoint {
  /** Position in scene coordinates. */
  x: number;
  y: number;
  /**
   * Corner style at this waypoint.
   * - "sharp": hard angle (right-angle turn, corridor corner)
   * - "smooth": Bezier curve through this point (natural outdoor path)
   */
  cornerStyle: "sharp" | "smooth";
  /**
   * Curve tension for "smooth" corners. 0 = straight, 1 = maximum curve.
   * Ignored for "sharp" corners. Default: 0.5
   */
  tension?: number;
}

/** A route connecting two positions via a path. */
interface SceneRoute {
  id: string;
  name: string;
  /** Position ID of the start. */
  from: string;
  /** Position ID of the end. */
  to: string;
  /**
   * Intermediate waypoints between `from` and `to`.
   * The full path is: from → waypoints[0] → waypoints[1] → ... → to
   * Empty array = straight line (no intermediate points).
   */
  waypoints: RouteWaypoint[];
  style: "solid" | "dashed";
  color: string;
  bidirectional: boolean;
}
```

**The full path geometry** is: `[fromPosition] → waypoints[0] → waypoints[1] → ... → [toPosition]`.

An empty `waypoints` array = straight line (simple case).

### 2.3 How Path Geometry Works

#### Sharp corners (corridor/indoor navigation)

```
  ◆ spawn ─────────┐
                    │    ← right-angle turn (waypoint cornerStyle: "sharp")
                    │
                    └─────── ◆ forge
```

The path follows straight segments connected at 90° (or any angle) at each waypoint. No smoothing. Good for indoor scenes, grid-based layouts, structured environments.

#### Smooth curves (outdoor/natural navigation)

```
  ◆ spawn ─────╮
                 ╰──────╮
                         ╰──── ◆ forge
```

At each "smooth" waypoint, a Catmull-Rom or cubic Bezier curve passes through the point. The `tension` parameter controls how tight the curve is. Good for outdoor paths, roads, organic movement.

#### Mixed

A single route can mix sharp and smooth waypoints:

```
  ◆ spawn ── sharp ┐
                    │
              smooth ╰──── ◆ forge
```

### 2.4 Interactions

#### Creating a route

1. Activate Route tool (R).
2. **Click on a position marker** → locks "from". The position highlights with a pulse.
3. **Click on empty canvas** → adds a waypoint at that point. A line segment appears from the previous point.
4. **Click on another position marker** → completes the route with that as "to". Done.
5. **Escape** → cancels route creation, removes any waypoints added.
6. **Right-click / double-click on last waypoint** → undo the last waypoint added.

The creation flow is: **click position → click, click, click (waypoints) → click position**.

This gives the designer full control over the path geometry during creation.

#### Default values

- `id`: `route-${Date.now().toString(36)}`
- `name`: `"fromName → toName"` (auto-generated, editable)
- `waypoints`: collected during creation
- All waypoints default to `cornerStyle: "sharp"` (can be changed in inspector)
- `style`: `"solid"`
- `color`: `"#555555"`
- `bidirectional`: `false`

#### Visual feedback during creation

- "From" position: pulsing highlight (amber glow).
- Placed waypoints: small circles connected by line segments.
- Preview line: dashed line from last point to cursor.
- Valid target position hover: green glow.
- Same-position hover: red (can't self-route).
- Duplicate route hover: orange warning.

#### Selecting a route

- **Route tool active**: click on a route line/curve to select it. Line thickens + blue highlight.
- Ctrl/Cmd+Click for multi-select.
- Click empty to deselect.

#### Editing waypoints (selected route)

When a route is selected:
- Its waypoints appear as **draggable circles** (8px, white fill, 1px stroke).
- **Drag a waypoint** → move it. Grid snap applies. Live path update.
- **Double-click a waypoint** → toggle cornerStyle (sharp ↔ smooth).
- **Click on the path between two waypoints** → insert a new waypoint at that position.
- **Right-click or Alt+click a waypoint** → delete it.
- All edits via undo.

#### Deleting a route

- Select, press Delete/Backspace. Undo command.

### 2.5 Inspector Fields (Route mode)

| Field | Type | Notes |
|-------|------|-------|
| ID | read-only | `route-xxxx` |
| Name | text input | Default: `"fromName → toName"` |
| From | read-only + link | Position name. Click to select/highlight that position. |
| To | read-only + link | Position name. Click to select/highlight that position. |
| Waypoints | count | "N waypoints" — informational |
| Style | toggle pills | `solid` / `dashed` |
| Color | color picker | Path line color |
| Bidirectional | checkbox | If true, arrowheads on both ends |

**Per-waypoint editing** happens directly on the canvas (drag, double-click to toggle corner style), not in the inspector. The inspector shows route-level properties only.

### 2.6 Canvas Rendering

Rendered in `layers.routes` container.

#### Path rendering

1. Build point array: `[fromPos, ...waypoints, toPos]`
2. For each segment between consecutive points:
   - If both endpoints are `sharp` (or are positions, not waypoints): draw a straight `lineTo`.
   - If either endpoint is `smooth`: draw a Catmull-Rom curve segment through the point, using `tension` to control curvature.
3. Apply `style` (solid or dashed) and `color`.

**Line width**: 2px (scene pixels). **Opacity**: 80%.

#### Arrowhead

- At the "to" end: filled triangle, 8×6 scene px, oriented along the last path segment direction.
- If `bidirectional`: arrowhead at "from" end too, oriented along the first segment.

#### Waypoint handles (when route is selected)

- Small circles at each waypoint position. 8px diameter, white fill, 1px stroke.
- Sharp waypoints: square handles. Smooth waypoints: round handles. Visual distinction.

#### Ghost mode

When Route tool is NOT active, routes render at 30% opacity. Full opacity when Route tool is active.

#### Hit testing

For each segment of the polyline/curve, compute point-to-segment distance. Threshold: 6 scene pixels. For curved segments, approximate with 8-16 line segments for hit testing.

### 2.7 Path Interpolation at Runtime (export context)

When the scene is exported, routes carry their waypoints. The runtime interpolates entity movement along the path:

```json
{
  "routes": {
    "spawnToForge": {
      "from": "spawnPoint",
      "to": "forge",
      "waypoints": [
        { "x": 200, "y": 300, "cornerStyle": "sharp" },
        { "x": 200, "y": 450, "cornerStyle": "smooth", "tension": 0.5 },
        { "x": 300, "y": 480, "cornerStyle": "sharp" }
      ],
      "bidirectional": false
    }
  }
}
```

The choreographer runtime walks the path at a given speed, interpolating between segments. For smooth corners, it follows the Catmull-Rom curve. For sharp corners, it makes an instant direction change.

---

## 3. Cross-Cutting Concerns

### 3.1 Selection Model

Positions and routes use **separate selection arrays** from entities:

```typescript
// Added to EditorState:
selectedPositionIds: string[];
selectedRouteIds: string[];
```

New helpers in `editor-state.ts`:
- `setPositionSelection(ids: string[])`
- `setRouteSelection(ids: string[])`

**Isolation**: each tool manages its own selection namespace. When switching tools, other selections are preserved but visually inactive.

### 3.2 Inspector — Context-Aware Rendering

The inspector detects what's selected and renders the appropriate fields:

```
selectedIds.length > 0          → Entity Inspector (current behavior)
selectedPositionIds.length > 0  → Position Inspector
selectedRouteIds.length > 0     → Route Inspector
nothing selected                → empty / hint text
```

Implementation: `render()` in `inspector-panel.ts` dispatches to sub-renderers:
- `renderEntityInspector(placed, def)` — existing
- `renderPositionInspector(position)` — new
- `renderRouteInspector(route)` — new

### 3.3 Scene Renderer Extensions

New render functions in `scene-renderer.ts`:

| Function | Layer | Tracks |
|----------|-------|--------|
| `renderPositions()` | `layers.positions` | `positionGraphics: Map<string, Container>` |
| `renderRoutes()` | `layers.routes` | `routeGraphics: Map<string, Container>` |
| `renderPositionSelection()` | `layers.selection` | inline |
| `renderRouteSelection()` | `layers.selection` | inline |

All follow the existing diff-based pattern: remove orphans → add/update → apply transforms.

### 3.4 Cascade Deletion

Position deletion cascades to routes:
- Find all routes where `route.from === posId` or `route.to === posId`
- Create a **compound undo command** that removes the position AND all affected routes
- Undo restores everything atomically

### 3.5 Shared Utilities — Extraction

Currently duplicated across tools:

| Utility | Currently in | Extract to |
|---------|-------------|------------|
| `snap(value)` | select-tool, place-tool | `src/tools/snap.ts` |
| `showGuideLines()` / `hideGuideLines()` | select-tool | `src/tools/guide-lines.ts` |
| `snapToCenter(x, y)` | select-tool | `src/tools/guide-lines.ts` |

Position tool and route tool will use these shared utilities.

### 3.6 Type Changes

```typescript
// types.ts — modifications:

// UPDATED: PlacedEntity — add semanticId
interface PlacedEntity {
  // ... existing fields ...
  semanticId?: string;           // NEW — choreography-addressable name
}

// NEW: RouteWaypoint
interface RouteWaypoint {
  x: number;
  y: number;
  cornerStyle: "sharp" | "smooth";
  tension?: number;
}

// UPDATED: SceneRoute — add waypoints field
interface SceneRoute {
  id: string;
  name: string;
  from: string;
  to: string;
  waypoints: RouteWaypoint[];     // NEW
  style: "solid" | "dashed";
  color: string;
  bidirectional: boolean;
}

// UPDATED: EditorState — add selection arrays
interface EditorState {
  // ... existing fields ...
  selectedPositionIds: string[];  // NEW
  selectedRouteIds: string[];     // NEW
}

// UPDATED: ToolId — remove "place" from toolbar (keep in code)
// Place tool handler still exists, activated by Entity Palette click.
// But it's no longer a primary toolbar tool.
```

### 3.7 Keyboard Shortcuts

| Key | Context | Action |
|-----|---------|--------|
| P | Global | Switch to Position tool |
| R | Global | Switch to Route tool |
| Delete | Position tool | Delete selected positions + cascade routes |
| Delete | Route tool | Delete selected routes |
| Escape | Position tool | Deselect positions |
| Escape | Route tool | Cancel route creation / deselect routes |

---

## 4. Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `src/types.ts` | **Modify** | Add `RouteWaypoint`. Add `waypoints` to `SceneRoute`. Add selection arrays to `EditorState`. |
| `src/state/editor-state.ts` | **Modify** | Add `selectedPositionIds`, `selectedRouteIds`, setters, defaults. |
| `src/tools/snap.ts` | **Create** | Extract shared `snap()` function. |
| `src/tools/guide-lines.ts` | **Create** | Extract shared guide lines + center snap. |
| `src/tools/select-tool.ts` | **Modify** | Import from shared snap/guide-lines modules. |
| `src/tools/place-tool.ts` | **Modify** | Import from shared snap module. |
| `src/tools/position-tool.ts` | **Create** | Position tool: create, select, drag, delete. |
| `src/tools/route-tool.ts` | **Create** | Route tool: create with waypoints, select, edit path, delete. |
| `src/canvas/scene-renderer.ts` | **Modify** | Add `renderPositions()`, `renderRoutes()`, selection overlays. |
| `src/panels/inspector-panel.ts` | **Modify** | Context-aware: entity / position / route inspector sub-renderers. |
| `src/workspace/workspace.ts` | **Modify** | Wire position & route tools in tool switching. |
| `src/workspace/toolbar.ts` | **Modify** | Remove Place (O) from TOOLS array. |

---

## 5. Implementation Order

### Step 0 — Semantic entities (actors)
- Add `semanticId?: string` to `PlacedEntity` in `types.ts`
- Add "Semantic ID" field in inspector entity view
- Validate uniqueness, undo integration
- Render actor badge (◆) on entities with semanticId in scene-renderer

### Step 1 — Types & state
- Update `types.ts` (RouteWaypoint, SceneRoute.waypoints, EditorState selections)
- Update `editor-state.ts` (new selection arrays + setters)
- Update `scene-state.ts` defaults (empty arrays)

### Step 2 — Shared utilities
- Create `snap.ts`, `guide-lines.ts`
- Refactor `select-tool.ts` and `place-tool.ts` to import from shared modules

### Step 3 — Position tool
- `position-tool.ts`: create on click, select on click, drag to move
- Keyboard: Delete (cascade), Escape (deselect)
- Wire in `workspace.ts`

### Step 4 — Position rendering
- `renderPositions()` in scene-renderer: diamond markers + labels
- Position selection overlay (blue highlight)
- Ghost mode (40% opacity when not active)

### Step 5 — Position inspector
- Inspector context detection → `renderPositionInspector()`
- Fields: name, x, y, type, color, entity binding
- Undo integration

### Step 6 — Route tool (creation flow)
- `route-tool.ts`: click position → click waypoints → click position
- Preview line during creation
- Waypoint placement with visual feedback

### Step 7 — Route rendering
- `renderRoutes()`: polyline + Catmull-Rom curves + arrowheads
- Sharp/smooth waypoint rendering
- Ghost mode (30% opacity)

### Step 8 — Route tool (editing)
- Select route → show waypoint handles
- Drag handles, insert/delete waypoints, toggle corner style
- Hit testing on path segments

### Step 9 — Route inspector
- `renderRouteInspector()`: name, from, to, style, color, bidirectional
- Undo integration

### Step 10 — Cascade & cleanup
- Position deletion cascades routes (compound undo)
- Remove Place (O) from toolbar
- Final cross-tool integration

---

## 6. Export Format (future reference)

```json
{
  "layout": {
    "positions": {
      "forge": {
        "x": 320, "y": 480,
        "typeHint": "destination"
      },
      "spawnPoint": {
        "x": 100, "y": 300,
        "typeHint": "spawn",
        "entityBinding": "peon"
      }
    },
    "routes": {
      "spawnToForge": {
        "from": "spawnPoint",
        "to": "forge",
        "waypoints": [
          { "x": 100, "y": 400, "cornerStyle": "sharp" },
          { "x": 250, "y": 400, "cornerStyle": "smooth", "tension": 0.4 },
          { "x": 320, "y": 460, "cornerStyle": "sharp" }
        ],
        "bidirectional": false
      }
    }
  }
}
```

The runtime choreographer walks the path point by point, interpolating entity position at a given speed. Sharp corners = instant direction change. Smooth corners = curve interpolation.
