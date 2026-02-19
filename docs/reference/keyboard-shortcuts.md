# Keyboard Shortcuts

Source of truth: `tools/scene-builder/src/workspace/toolbar.ts`, `tools/scene-builder/src/workspace/header.ts`, `tools/scene-builder/src/state/undo.ts`, `tools/scene-builder/src/canvas/canvas.ts`

All shortcuts are ignored when focus is in INPUT or TEXTAREA elements.

---

## Global

| Key | Action |
|---|---|
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + Y` | Redo (alternative) |
| `Ctrl/Cmd + R` | Toggle Run Mode |
| `Ctrl/Cmd + S` | Quick Export (Save as ZIP) |
| `Ctrl/Cmd + N` | New Scene (confirm dialog) |
| `Ctrl/Cmd + 0` | Zoom to 100% |
| `Ctrl/Cmd + 1` | Fit to View |
| `+` / `=` | Zoom In |
| `-` | Zoom Out |
| `Space` (hold) | Pan Mode (drag to pan) |

---

## Tool Selection

| Key | Tool |
|---|---|
| `V` | Select |
| `H` | Hand (pan) |
| `B` | Background |
| `O` | Place |
| `P` | Position |
| `R` | Route |
| `J` | Light |
| `K` | Particle |

---

## Panels

| Key | Panel |
|---|---|
| `A` | Assets |
| `E` | Entity Editor |
| `L` | Layers |

---

## Pipeline

| Key | Node |
|---|---|
| `1` | Signal |
| `2` | Choreographer |
| `3` | Visual (Stage) |
| `4` | Shader |
| `5` | Sketches |

---

## View

| Key | Action |
|---|---|
| `F` | Toggle Full-Window Preview (auto-activates run mode + hand tool on Visual) |
| `I` | Toggle Isometric / Top-Down |
| `G` | Toggle Grid |
| `?` | Toggle Help Bar |

---

## Tool-Specific

These keys work when the corresponding tool is active:

| Key | Action |
|---|---|
| `Delete` / `Backspace` | Delete selected element(s) -- works in Select, Position, Route, Light, and Particle tools |
| `Escape` | Deselect / Cancel -- works in Select, Place, Position, Route, Light, and Particle tools. Also exits full-window preview mode. |

### Route Tool specifics
- `Delete` / `Backspace` while hovering a point handle: delete that point (minimum 2 enforced)
- `Delete` / `Backspace` with route selected: delete entire route
- `Escape`: cancel in-progress creation, or deselect
- `Shift + Click` on a handle: toggle sharp/smooth corner style
- `Double-click` on segment: insert a new point

---

## Preview

| Key | Action |
|---|---|
| `Escape` | Close Preview |

---

## Pan Methods

Three ways to pan the canvas:
1. `Space` + drag (any tool)
2. Middle mouse button + drag (any tool)
3. Left drag with Hand tool (`H`)

---

## Key Files

- `tools/scene-builder/src/workspace/toolbar.ts` -- tool/panel/view/zoom shortcuts
- `tools/scene-builder/src/workspace/header.ts` -- Ctrl+R, Ctrl+S, Ctrl+N shortcuts
- `tools/scene-builder/src/state/undo.ts` -- Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y
- `tools/scene-builder/src/canvas/canvas.ts` -- Space key pan mode
- `tools/scene-builder/src/tools/select-tool.ts` -- Delete/Escape for Select
- `tools/scene-builder/src/tools/place-tool.ts` -- Escape for Place
- `tools/scene-builder/src/tools/position-tool.ts` -- Delete/Escape for Position
- `tools/scene-builder/src/tools/route-tool.ts` -- Delete/Escape for Route
- `tools/scene-builder/src/tools/light-tool.ts` -- Delete/Escape for Light
- `tools/scene-builder/src/tools/particle-tool.ts` -- Delete/Escape for Particle
- `tools/scene-builder/src/preview/preview-scene.ts` -- Escape for Preview
