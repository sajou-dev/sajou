# Scene Format Reference

Source of truth: `tools/scene-builder/src/io/export-scene.ts` and `tools/scene-builder/src/types.ts`

---

## ZIP Structure

```
scene-export.zip
├── scene.json           (required)
├── entities.json        (required)
├── choreographies.json  (optional)
├── shaders.json         (optional)
└── assets/
    ├── sprites/         (static images)
    ├── spritesheets/    (animated spritesheets)
    └── gifs/            (animated GIFs)
```

Only assets actually referenced by entity visuals are included. Asset paths in `entities.json` are rewritten to ZIP-relative paths. Filename collisions are resolved by appending a numeric suffix.

---

## scene.json

Version: `1`

```typescript
interface SceneExportJson {
  version: 1;
  dimensions: SceneDimensions;
  background: SceneBackground;
  layers: SceneLayer[];
  entities: PlacedEntity[];
  positions: ScenePosition[];
  routes: SceneRoute[];
  zoneTypes: ZoneTypeDef[];
  zoneGrid: ZoneGrid;
  lighting: LightingState;
  particles: ParticleEmitterState[];
}
```

### dimensions
```typescript
{ width: number; height: number }
```

### background
```typescript
{ color: string }  // CSS hex, rendered underneath all layers
```

### layers
Ordered Z-groups. Content is placed on layers. Higher `order` renders on top.
```typescript
{
  id: string;
  name: string;
  order: number;
  visible: boolean;
  locked: boolean;
}
```

### entities (placed instances)
Each placed entity references an entity definition by `entityId`.
```typescript
{
  id: string;           // instance ID ("peon-01")
  entityId: string;     // definition ID ("peon")
  x: number;
  y: number;
  scale: number;
  rotation: number;     // degrees
  layerId: string;
  zIndex: number;       // within layer
  opacity: number;      // 0-1
  flipH: boolean;
  flipV: boolean;
  locked: boolean;
  visible: boolean;
}
```

### positions
Semantic position markers referenced by choreographies.
```typescript
{
  id: string;
  name: string;          // used by choreographies ("forge", "spawnPoint")
  x: number;
  y: number;
  color: string;         // editor-only
  entityBinding?: string;
  typeHint: "spawn" | "waypoint" | "destination" | "generic";
}
```

### routes
Freeform vector paths that entities follow during choreographed animations. Minimum 2 points.
```typescript
{
  id: string;
  name: string;
  points: RoutePoint[];  // { x, y, cornerStyle: "sharp"|"smooth", tension?, name? }
  style: "solid" | "dashed";
  color: string;
  bidirectional: boolean;
  fromPositionId?: string;
  toPositionId?: string;
}
```

### zoneTypes
Semantic zone type definitions for grid painting.
```typescript
{
  id: string;
  name: string;
  description: string;  // for LLM/MCP context
  color: string;
  capacity: number;
}
```

### zoneGrid
Painted zone grid. Flat row-major array.
```typescript
{
  cellSize: number;           // pixels per cell
  cols: number;
  rows: number;
  cells: (string | null)[];   // zone type ID or null
}
```

### lighting
```typescript
{
  ambient: { intensity: number; color: string };
  directional: {
    enabled: boolean;
    angle: number;      // compass degrees (0=N, 90=E)
    elevation: number;  // degrees above horizon
    color: string;
    intensity: number;
  };
  sources: LightSourceState[];  // point lights
}
```

Each point light source:
```typescript
{
  id: string;
  x: number;
  y: number;
  color: string;
  intensity: number;
  radius: number;
  flicker?: { speed: number; amount: number };
}
```

### particles
```typescript
{
  id: string;
  x: number;
  y: number;
  sprite: string;           // asset path ("" = default circle)
  type: "radial" | "directional";
  count: number;
  lifetime: [number, number];
  velocity: { x: [number, number]; y: [number, number] };
  direction: { x: number; y: number };
  speed: [number, number];
  colorOverLife: string[];   // hex gradient stops
  size: [number, number];    // [start, end] in scene pixels
  glow: boolean;
}
```

---

## entities.json

Version: `1`

```typescript
{
  version: 1;
  entities: Record<string, EntityEntry>;
}
```

Each `EntityEntry`:
```typescript
{
  id: string;
  tags: string[];
  displayWidth: number;
  displayHeight: number;
  fallbackColor: string;
  defaults: EntityDefaults;
  visual: EntityVisual;       // discriminated union on visual.type
  sounds?: Record<string, string>;
}
```

### Entity visual types

**sprite** -- static image:
```typescript
{ type: "sprite"; source: string; sourceRect?: { x, y, w, h } }
```

**spritesheet** -- animated frames:
```typescript
{
  type: "spritesheet";
  source: string;
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, { frames: number[]; fps: number; loop?: boolean }>;
}
```

**gif** -- animated GIF:
```typescript
{ type: "gif"; source: string; fps?: number; loop?: boolean }
```

### Entity defaults
```typescript
{
  scale?: number;
  anchor?: [number, number];   // normalized, [0.5, 1.0] = bottom-center
  zIndex?: number;
  opacity?: number;
  flat?: boolean;              // lies flat on ground in isometric view
}
```

---

## choreographies.json

Version: `1`

```typescript
{
  version: 1;
  choreographies: ChoreographyDef[];
  wires: WireConnection[];
  bindings: EntityBinding[];
}
```

**Note:** signal-to-signal-type wires (`fromZone === "signal"`) are excluded on export because signal sources are session-ephemeral.

---

## shaders.json

Version: `1`. Only included when shaders exist.

```typescript
{
  version: 1;
  shaders: ShaderDef[];
}
```

Each `ShaderDef`:
```typescript
{
  id: string;
  name: string;
  mode: "glsl";
  vertexSource: string;
  fragmentSource: string;
  uniforms: ShaderUniformDef[];
  objects: ShaderObjectDef[];
  passes: number;            // 1 = single-pass, 2+ = ping-pong feedback
  bufferResolution: number;  // 0 = match canvas
}
```

---

## Key Files

- `tools/scene-builder/src/io/export-scene.ts` -- export logic
- `tools/scene-builder/src/io/import-scene.ts` -- import logic
- `tools/scene-builder/src/types.ts` -- all type definitions
