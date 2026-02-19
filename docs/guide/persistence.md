# Persistence

The scene-builder auto-saves your work to the browser's IndexedDB and localStorage. When you reopen the page, everything is restored exactly as you left it.

## What Gets Saved

### IndexedDB (debounced 500ms)

The `sajou-scene-builder` database has 9 object stores:

| Store | Content |
|---|---|
| `scene` | Scene dimensions, background, layers, positions, routes, zones |
| `entities` | Entity definitions (sprites, spritesheets, GIFs) |
| `choreographies` | Choreography definitions, steps, timing |
| `wires` | Patch bay wire connections |
| `bindings` | Entity bindings to choreography commands |
| `timeline` | Signal timeline state |
| `shaders` | Shader definitions, sources, uniforms |
| `assets` | Image files as `ArrayBuffer` (incremental save) |
| `p5` | p5.js sketch definitions, source code, params |

**DB_VERSION history:** 1 (initial) → 2 (added `shaders` store) → 3 (added `p5` store).

Each store wraps its data in a versioned envelope `{ version: 1, data: ... }`.

### localStorage (debounced 300ms)

| Key | Content |
|---|---|
| `sajou:remote-sources` | Remote signal source configs (URL, protocol, API key, model) |
| `sajou:editor-prefs` | Panel layouts, grid settings, view mode, pipeline layout |

### Not Persisted

These are rebuilt or re-discovered on each session:

- Undo/redo stack
- Local signal sources (re-discovered via local discovery)
- Connection status (all sources start `"disconnected"`)
- Active selections
- Compositor state

## Save Flow

```
State change (any store)
    │
    ├── IndexedDB stores ──→ debounce 500ms ──→ dbPut("store", "current", { version: 1, data })
    │
    └── localStorage stores ──→ debounce 300ms ──→ localStorage.setItem(key, JSON.stringify(...))
```

Multiple rapid changes within the debounce window collapse into a single write.

On page unload (`beforeunload`), all pending debounced saves are flushed immediately.

## Restore Flow

`restoreState()` runs before the workspace is initialized:

1. Check if `scene` store has data -- if not, this is a first launch
2. Restore scene state (dimensions, background, layers, etc.)
3. Restore entity definitions
4. Restore choreography state (clear selection)
5. Restore wiring state (clear drag state)
6. Restore binding state
7. Restore signal timeline (clear selection)
8. Restore shader state (clear selection, reset `playing: true`)
9. Restore assets: `ArrayBuffer` → `File` → `URL.createObjectURL()` → `objectUrl`
10. Restore remote sources from localStorage
11. Restore editor preferences from localStorage
12. Clear undo stack (restored state has no history)

## Asset Persistence

Assets are saved incrementally -- only new paths not already in IndexedDB are written. Each asset is stored as:

```typescript
{
  name: string;         // original filename
  path: string;         // unique asset path (key)
  category: string;     // "sprites" | "spritesheets" | "gifs"
  format: AssetFormat;  // "png" | "svg" | "webp" | "gif" | "jpeg"
  buffer: ArrayBuffer;  // raw file data
  naturalWidth?: number;
  naturalHeight?: number;
  frameCount?: number;
  detectedFps?: number;
}
```

On restore, `ArrayBuffer` is reconstructed into a `File` object and a fresh `objectUrl` is created.

## Force Persist

`forcePersistAll()` bypasses debouncing and writes all stores immediately. It's called after ZIP import to ensure the imported scene is fully saved.

## Selective Import

When importing a ZIP, a dialog lets you choose which sections to load:

| Section | Stores affected |
|---|---|
| **Visual layout** | Scene state (placements, positions, routes, lighting, particles) |
| **Entities & Assets** | Entity definitions, asset files |
| **Choreographies & Wiring** | Choreography definitions, wire connections, bindings |
| **Shaders** | Shader definitions |
| **p5.js Sketches** | p5.js sketch definitions, source code, params |

Unchecked sections keep their current state. The dialog shows summary counts for each section and contextual warnings (e.g. "Visual layout without Entities may produce invisible meshes").

After import, `autoWireConnectedSources()` creates `signal -> signal-type` wires for any connected sources, so imported choreographies work immediately.

## New Scene

The "New" button (<kbd>Ctrl+N</kbd>) triggers `newScene()`:

1. Clear all IndexedDB stores (`dbClearAll()`)
2. Remove localStorage keys
3. Reset all in-memory stores to defaults
4. Clear undo stack
5. Re-discover local sources (`scanAndSyncLocal()`)

## Key Files

| File | Role |
|---|---|
| `state/persistence-db.ts` | IndexedDB wrapper (singleton connection, CRUD helpers) |
| `state/persistence.ts` | Auto-save/restore orchestrator |
| `io/import-scene.ts` | ZIP import (4-phase: pick, parse, dialog, apply) |
| `io/import-dialog.ts` | Selective import dialog UI |
| `state/auto-wire.ts` | Auto-wire connected sources on import/connect |
