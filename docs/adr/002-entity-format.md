# ADR-002: Declarative Entity Format

## Status

Proposed

## Date

2026-02-07

## Context

Sajou themes declare their available entities (peon, building, pigeon, particle burst, etc.) in a JSON manifest. The choreographer references these entities by ID when executing actions like `spawn`, `move`, `destroy`.

The entity format must accommodate a wide range of visual complexity:

| Level | Example | Rendering |
|-------|---------|-----------|
| Static sprite | A building icon, a flag | Single image (PNG, SVG) |
| Animated spritesheet | A walking peon, a flying pigeon | Frame-based animation from atlas |
| Skeletal 2D | A character with articulated limbs | Spine / DragonBones-style |
| 3D model | A fortress, a dragon | glTF with skeletal animations |
| Particle system | Explosion, gold coins shower | Emitter with rules |
| Procedural/shader | A magical beam, a portal | Custom shader program |

The format must be:
1. **Declarative** — JSON that an AI can read and generate
2. **Extensible** — new visual types added without breaking existing themes
3. **Renderer-agnostic** — the schema doesn't know if the theme uses PixiJS, Three.js, or Canvas2D
4. **Self-documenting** — descriptions on every field for LLM comprehension

## Options Considered

### Option A: Flat Discriminated Object

Every entity is a flat JSON object with a `renderType` discriminator. All fields for all types live at the same level, with conditional requirements.

```json
{
  "id": "peon",
  "renderType": "spritesheet",
  "source": "peon-sheet.png",
  "frameWidth": 64,
  "frameHeight": 64,
  "animations": {
    "idle": { "frames": [0], "fps": 1 },
    "walk": { "frames": [0, 1, 2, 3], "fps": 12 }
  },
  "anchor": [0.5, 1.0],
  "scale": 1.0
}
```

**Pros:**
- Simple to read and write
- Easy JSON Schema with `if/then` on `renderType`
- Flat structure is LLM-friendly

**Cons:**
- Gets bloated as more render types are added
- Fields become ambiguous (`source` means different things for sprite vs 3D)
- Hard to compose — no separation of concerns
- A particle system and a sprite share the same namespace

### Option B: Layered Format with Visual Type Nesting

Separate the identity/placement layer from the visual representation layer. The `visual` object is a discriminated union with its own schema per type.

```json
{
  "id": "peon",
  "tags": ["unit", "worker"],
  "defaults": {
    "scale": 1.0,
    "anchor": [0.5, 1.0],
    "zIndex": 10
  },
  "visual": {
    "type": "spritesheet",
    "source": "entities/peon-sheet.png",
    "frameWidth": 64,
    "frameHeight": 64,
    "animations": {
      "idle": { "frames": [0], "fps": 1 },
      "walk": { "frames": [0, 1, 2, 3], "fps": 12, "loop": true },
      "die": { "frames": [4, 5, 6, 7], "fps": 8, "loop": false }
    }
  },
  "sounds": {
    "spawn": "sfx/peon-ready.ogg",
    "die": "sfx/peon-death.ogg"
  }
}
```

A 3D entity uses the same envelope but different visual:

```json
{
  "id": "fortress",
  "tags": ["building", "structure"],
  "defaults": {
    "scale": 2.0,
    "anchor": [0.5, 0.5],
    "zIndex": 5
  },
  "visual": {
    "type": "model3d",
    "source": "models/fortress.glb",
    "animations": {
      "idle": { "clip": "idle_loop" },
      "build": { "clip": "construction", "loop": false },
      "destroy": { "clip": "collapse", "loop": false }
    }
  },
  "sounds": {
    "spawn": "sfx/building-complete.ogg",
    "destroy": "sfx/building-collapse.ogg"
  }
}
```

**Pros:**
- Clean separation between identity (id, tags, defaults) and rendering (visual)
- Each visual type has its own focused schema — no field pollution
- Easy to add new visual types (`"type": "particle"`, `"type": "shader"`)
- Tags enable the choreographer to target entity groups (`"entity": "tag:worker"`)
- Sounds are separate from visuals, composable independently

**Cons:**
- Slightly deeper nesting
- Two-level schema validation (envelope + visual type)

### Option C: ECS-Style Component Bags

Each entity is an ID plus a bag of named components. Maximum composability.

```json
{
  "id": "peon",
  "components": {
    "sprite": {
      "source": "peon-sheet.png",
      "frameWidth": 64,
      "frameHeight": 64
    },
    "animator": {
      "animations": {
        "walk": { "frames": [0, 1, 2, 3], "fps": 12 }
      }
    },
    "audio": {
      "spawn": "sfx/peon-ready.ogg"
    },
    "collider": {
      "shape": "circle",
      "radius": 16
    }
  }
}
```

**Pros:**
- Maximum flexibility — mix any components
- Familiar to game developers (ECS pattern)
- Easy to add capabilities without changing existing components

**Cons:**
- Over-engineered for V1 — we don't need collision, physics, AI components
- Harder for an AI to generate — must know which components are required
- No clear validation path — any component combination is "valid"
- The choreographer needs to understand component composition
- Premature abstraction when we don't know all the component types yet

## Decision

**Option B: Layered format with visual type nesting.**

It strikes the right balance between simplicity and extensibility:

1. The **envelope** (`id`, `tags`, `defaults`, `sounds`) is shared by all entities and understood by the choreographer without knowing the visual details.

2. The **visual** is a discriminated union (`visual.type`) where each variant has its own tightly-defined schema. The theme renderer dispatches on `visual.type` to pick the right rendering strategy.

3. The **sounds** map is separate from visuals because sound playback is a choreographer primitive (`playSound`), not a renderer concern.

### V1 Visual Types

| Type | Use Case | Key Fields |
|------|----------|------------|
| `sprite` | Static image | `source` |
| `spritesheet` | Frame-based animation | `source`, `frameWidth`, `frameHeight`, `animations` |
| `model3d` | 3D model with skeletal animation | `source` (glTF/glb), `animations` |
| `particle` | Particle effects | `emitter` config |

Additional types (`spine2d`, `shader`, `lottie`) can be added in V2+ without breaking the envelope schema.

### Entity Reference in Choreographies

The choreographer references entities by:
- **ID**: `"entity": "peon"` — exact match
- **Tag**: `"entity": "tag:worker"` — matches any entity with that tag
- **Instance**: `"entity": "instance:peon-42"` — a specific spawned instance

This is resolved at runtime by the theme, which knows its entity catalog.

### Animation State Contract

Every entity, regardless of visual type, exposes a uniform animation interface to the choreographer:

```
animations: Record<string, AnimationClip>
```

Where `AnimationClip` is defined differently per visual type (frame range for spritesheets, clip name for 3D models), but the choreographer only needs the animation name (e.g., `"walk"`, `"idle"`, `"die"`). The theme renderer handles type-specific playback.

## Consequences

### Positive
- Themes can mix visual types freely (2D sprites + 3D buildings in same scene)
- JSON Schema validation is clean — envelope validates first, then `visual` based on type
- AI can generate entity definitions by following the schema for a specific visual type
- Adding new visual types is additive — doesn't break existing definitions
- Tags allow abstract choreography rules ("flash all units" without listing each one)

### Negative
- Theme renderers must implement a dispatcher for each visual type they support
- A theme that only supports 2D will fail if given a `model3d` entity — must declare capabilities

### Mitigations
- Themes declare supported visual types in their manifest (`capabilities.visualTypes: ["sprite", "spritesheet"]`)
- Schema validation can reject unsupported entity types at load time
- Start with `sprite` and `spritesheet` for the Citadel theme V1, add `model3d` when needed

## References

- ADR-001: Signal Protocol Design
- SAJOU-MANIFESTO.md: Entity format discussion
- CLAUDE.md: Open Questions section on entity format
