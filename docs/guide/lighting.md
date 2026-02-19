# Lighting

The scene-builder includes a Three.js lighting system with ambient, directional, and point lights. Lights affect all entity meshes in the scene and can flicker with configurable sine wave modulation.

## Light types

| Type | Description |
|---|---|
| **Ambient** | Global fill light — uniform intensity across the scene |
| **Directional** | Sun-like light with angle and elevation controls |
| **Point** | Positional lights placed on the scene (unlimited count) |

Ambient and directional lights are scene-wide (configured in the lighting panel). Point lights are placed individually on the canvas.

## Light tool

Press <kbd>J</kbd> to activate the Light tool.

- **Click** on the canvas to create a new point light at that position
- **Click** on an existing light to select it
- **Drag** a selected light to move it
- **Delete** / **Backspace** to delete the selected light

All light operations are undo-aware.

## Lighting panel

The lighting panel appears when the Light tool is active. It provides controls for all three light types.

### Ambient light
- **Intensity** slider (0–1)
- **Color** picker

### Directional light
- **Intensity** slider (0–1)
- **Color** picker
- **Angle dial** — Canvas2D rendered dial for horizontal direction (0–360°)
- **Elevation dial** — Canvas2D rendered dial for vertical angle (0–90°)

### Point lights (per-light)
- **Intensity** slider (0–3)
- **Color** picker
- **Range** slider — how far the light reaches
- **Flicker** toggle + controls:
  - **Fast frequency** — primary oscillation speed
  - **Slow frequency** — secondary modulation speed
  - **Amplitude** — flicker depth (0–1)

## Flicker

Flicker uses a double sine wave modulation: a fast oscillation multiplied by a slow one. This produces organic-looking light variation — campfires, torches, electrical sparks.

```
intensity = base × (1 - amplitude × sin(fastFreq × t) × sin(slowFreq × t))
```

The flicker is computed per-frame in the render loop and applied directly to the Three.js `PointLight.intensity`.

## Export / import

Lighting state is part of the scene JSON:

```json
{
  "lighting": {
    "ambient": { "color": "#ffffff", "intensity": 0.3 },
    "directional": { "color": "#ffffff", "intensity": 0.8, "angle": 45, "elevation": 60 },
    "sources": [
      { "id": "...", "x": 200, "y": 150, "color": "#ff8800", "intensity": 1.5, "range": 300, "flicker": { "enabled": true, "fastFreq": 8, "slowFreq": 2, "amplitude": 0.3 } }
    ]
  }
}
```

## Key files

| File | Role |
|---|---|
| `canvas/light-renderer.ts` | Three.js light sync (init/sync/tick/dispose) |
| `tools/light-tool.ts` | Click create, select, drag, delete |
| `workspace/lighting-panel.ts` | Canvas2D dials, color pickers, flicker controls |
