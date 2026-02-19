# Particles

The scene-builder includes a CPU-simulated particle system using `THREE.Points` with `BufferGeometry`. Particles support color-over-life gradients, size fade-out, glow (additive blending), and two emission modes.

## Emission modes

| Mode | Behavior |
|---|---|
| **Radial** | Particles emit in all directions from the emitter position (random velocity in vx/vz ranges) |
| **Directional** | Particles emit in a cone along a specified angle (17° spread) |

## Particle tool

Press <kbd>K</kbd> to activate the Particle tool.

- **Click** on the canvas to create a new emitter at that position (default: radial, 30 particles, orange→red glow)
- **Click** on an existing emitter to select it
- **Drag** a selected emitter to move it
- **Delete** / **Backspace** to delete the selected emitter

All particle operations are undo-aware.

## Particle panel

The particle panel appears when the Particle tool is active and an emitter is selected.

| Control | Description |
|---|---|
| **Type** | Radio: Radial / Directional |
| **Count** | Number of active particles |
| **Lifetime** | How long each particle lives (seconds) |
| **Velocity** | Emission speed |
| **Direction** | Compass dial (directional mode only) — 0°=N, 90°=E, 180°=S, 270°=W |
| **Color stops** | Multi-stop color gradient over particle lifetime |
| **Size** | Particle size (fades out toward end of life) |
| **Glow** | Toggle — enables `AdditiveBlending` for a luminous effect |

### Direction compass

The compass dial uses Canvas2D rendering. Cardinal directions map to world coordinates:

- **0° (N)** → z = -1
- **90° (E)** → x = 1
- **180° (S)** → z = 1
- **270° (W)** → x = -1

## Color-over-life

Particles interpolate through a multi-stop color gradient over their lifetime. Each stop has a position (0–1) and a color. Linear interpolation between stops produces smooth color transitions — fire (orange→red→black), magic (blue→purple→white), etc.

## Rendering

- Particles live at `Y = 0.5` in world space (above the ground plane)
- CPU simulation: each frame updates age, position, velocity for every particle
- Dead particles (age > lifetime) are respawned at the emitter position
- Size fades out linearly toward end of life
- Glow particles use `THREE.AdditiveBlending` for a luminous overlay effect

## Export / import

Particle emitters are part of the scene JSON:

```json
{
  "particles": [
    {
      "id": "...",
      "x": 300, "y": 200,
      "type": "radial",
      "count": 30,
      "lifetime": 2,
      "velocity": 50,
      "direction": 0,
      "colorStops": [
        { "position": 0, "color": "#ff8800" },
        { "position": 1, "color": "#ff0000" }
      ],
      "size": 4,
      "glow": true
    }
  ]
}
```

The `particles` field defaults to `[]` for backward compatibility with scenes created before the particle system existed.

## Preview mode

Particles animate in preview mode using the same CPU simulation loop as the editor. The simulation runs in the preview render loop without requiring run mode.

## Key files

| File | Role |
|---|---|
| `canvas/particle-renderer.ts` | THREE.Points sync (init/sync/tick/dispose) |
| `tools/particle-tool.ts` | Click create, select, drag, delete |
| `workspace/particle-panel.ts` | Type radio, sliders, compass dial, color stops |
