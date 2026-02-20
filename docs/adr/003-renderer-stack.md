# ADR-003: Renderer Stack for the Citadel Theme

**Status:** Proposed
**Date:** 2026-02-07
**Author:** theme/renderer agent

## Context

The Citadel theme (`@sajou/theme-citadel`) needs a rendering stack to implement the `ThemeRenderer` interface from `@sajou/theme-api`. The renderer must draw a WC3-inspired medieval village scene: animated sprites (peons, pigeons), buildings, particle effects (gold coins, explosions), beams, text, and a top-down/isometric layout.

Per CLAUDE.md, themes choose their own rendering stack — the choice lives entirely in `@sajou/theme-citadel` and has zero impact on `@sajou/core`. However, the choice has long-term implications:

1. **V1 needs are 2D-centric:** spritesheets, particles, beams, text — all on an 800×600 scene
2. **V2+ may need 3D:** the entity format (ADR-002) anticipates `model3d` (glTF) entities
3. **The manifesto mentions WC3** — an isometric/top-down aesthetic, not full 3D perspective
4. **Performance matters** — multiple concurrent choreographies with animated entities, particles, and sound
5. **Developer experience** — Sajou is a learning project; the stack should be approachable

### Current Entity Definitions

The Citadel theme declares 6 entities using two visual types:

| Entity | Visual Type | Notes |
|--------|------------|-------|
| peon | `spritesheet` | 64×64, 4 animations (idle, walk, work, die) |
| pigeon | `spritesheet` | 32×32, 2 animations (fly, land) |
| forge | `spritesheet` | 96×96, 2 animations (idle, active) |
| oracle | `spritesheet` | 128×128, 3 animations (idle, thinking, active) |
| gold-coins | `particle` | 20 particles, coin sprite |
| explosion | `particle` | 40 particles, spark sprite |

All V1 entities are 2D. No `model3d` or `shader` entities yet.

### ThemeRenderer Primitives to Implement

From `@sajou/theme-api`, the renderer must support: `init`, `dispose`, `tick`, `spawnEntity`, `destroyEntity`, `move`, `fly`, `flash`, `pulse`, `drawBeam`, `typeText`, `playSound`, `setAnimation`.

---

## Options Considered

### Option A: PixiJS (2D WebGL/WebGPU)

PixiJS is a 2D rendering engine built for sprite-heavy interactive graphics. It renders via WebGL (with experimental WebGPU in v8).

**Bundle size:** ~195 kB min+gzip (v8.15, full package). Tree-shakeable — a selective import can be significantly smaller.

**Spritesheet/animated sprites:** Native. `AnimatedSprite` + `Spritesheet` classes are first-party. Load a spritesheet JSON, create `new AnimatedSprite(sheet.animations['walk'])`, set `animationSpeed`, call `play()`. This maps directly to our `spritesheet` visual type.

**Isometric support:** No built-in isometric camera. The `pixi-projection` plugin provides one but is **not compatible with v8** as of February 2026. However, for a top-down village scene (not true isometric with depth sorting), PixiJS's z-index ordering + flat 2D coordinates are sufficient. True isometric can be achieved manually with coordinate transforms.

**Particle systems:** `ParticleContainer` is built-in and highly optimized (1M particles at 60fps in v8). However, a *particle emitter* (lifecycle, velocity, color ramp) requires a third-party library. The official `@pixi/particle-emitter` is **not v8-compatible**; community forks exist (`@spd789562/particle-emitter`, `custom-pixi-particles`).

**glTF / 3D models:** Not supported natively. `Pixi3D` adds glTF loading but is **not v8-compatible**. PixiJS v8 does support sharing WebGL context with Three.js for hybrid 2D+3D scenes.

**Text rendering:** Built-in `Text`, `BitmapText`, and `HTMLText` classes. Typewriter effect requires manual letter-by-letter rendering (trivial with `tick`).

**WebGPU:** Shipped in v8, but the default was switched back to WebGL due to browser inconsistencies. Not production-ready.

**Learning curve:** Low for 2D developers. Concepts are sprites, containers, textures — no cameras, lights, or materials. Extensive documentation and examples.

### Option B: Three.js (3D with OrthographicCamera)

Three.js is a 3D rendering engine. For a 2D/isometric scene, it's used with an `OrthographicCamera` and `MeshBasicMaterial` (no lighting required).

**Bundle size:** ~182 kB min+gzip (core). GLTFLoader, OrbitControls, and other addons add to this. Effective bundle for our use case: ~200–220 kB.

**Spritesheet/animated sprites:** No built-in support. Requires manual UV manipulation (`texture.repeat`, `texture.offset`) or third-party libraries (`three-sprites`, `InstancedSpriteMesh`). Significantly more boilerplate than PixiJS for frame-based animation.

**Isometric support:** Built-in via `OrthographicCamera`. Well-documented, straightforward. True isometric with depth sorting comes naturally from the 3D scene graph.

**Particle systems:** `Points` + `PointsMaterial` for basic particles. Advanced effects (velocity, lifetime, color ramp) require custom shader code or third-party libraries (`three-nebula`). More effort than PixiJS for the particle effects we need.

**glTF / 3D models:** Excellent. `GLTFLoader` is mature, production-ready, supports full glTF 2.0 spec + 17+ extensions, skeletal animations, morph targets. This is Three.js's strongest advantage.

**Text rendering:** Basic. `Sprite` + canvas texture, or `CSS2DRenderer` overlay. No built-in text layout engine. Libraries like `troika-three-text` add SDF text. More work than PixiJS.

**WebGPU:** `WebGPURenderer` is production-ready since r171 (Sept 2025). Auto-fallback to WebGL 2. Mature.

**Learning curve:** Medium-high. Even for a "2D" scene, developers must understand: scene graph, camera types, geometry + material system, render loop, coordinate space (3D even if Z is unused). `MeshBasicMaterial` avoids lighting, but the conceptual overhead remains.

### Option C: Canvas 2D (native browser API)

The browser's `CanvasRenderingContext2D` — no library, no dependencies.

**Bundle size:** 0 kB. It's a browser API.

**Spritesheet/animated sprites:** Manual. `drawImage(sheet, sx, sy, sw, sh, dx, dy, dw, dh)` + frame counter. Achievable but tedious: must write sprite clipping, animation timing, anchor points, scaling, all from scratch.

**Isometric support:** Manual coordinate transforms. No scene graph, no z-index management — must implement painter's algorithm (back-to-front sorting) manually.

**Particle systems:** Fully manual. Draw circles/sprites in a loop with velocity/lifetime logic. Performance degrades with particle count because Canvas 2D is CPU-bound (no GPU batching).

**glTF / 3D models:** Not supported. Canvas 2D is strictly 2D rasterization. Would require a separate renderer entirely.

**Text rendering:** Built-in (`fillText`, `measureText`). Best text rendering of all three options — native font rasterization, no texture atlas needed. But no SDF, no rich text layout.

**WebGPU:** Not applicable.

**Learning curve:** Very low for the API itself. Very high for building a scene engine on top — you're writing everything: sprite manager, animation system, scene graph, z-sorting, hit testing, asset loading.

**Performance:** CPU-bound. No GPU batching. Suitable for simple scenes (<50 sprites). Degrades with more entities, more particles, more simultaneous animations. The Citadel theme at peak (multiple peons, pigeons, particles from concurrent choreographies) could stress a Canvas 2D renderer.

---

## Comparison Matrix

| Criterion | PixiJS (v8) | Three.js | Canvas 2D |
|-----------|:-----------:|:--------:|:---------:|
| **Bundle size** | ~195 kB | ~200 kB+ | 0 kB |
| **Animated spritesheets** | Native | Manual/lib | Manual |
| **Isometric layout** | Manual transforms | Built-in camera | Manual transforms |
| **Particle effects** | Container native, emitter via lib | Manual/shader | Manual, CPU-bound |
| **glTF / 3D models** | Not supported (v8) | Excellent | Not supported |
| **Text rendering** | Good (built-in) | Weak (needs lib) | Best (native) |
| **WebGPU** | Experimental | Production-ready | N/A |
| **GPU acceleration** | Yes (WebGL) | Yes (WebGL/WebGPU) | No |
| **Learning curve (2D scene)** | Low | Medium-high | Low API, high engine |
| **Ecosystem/community** | Large (2D games) | Largest (3D web) | N/A |
| **Build-your-own effort** | Low | Medium | Very high |

### Weighted Scoring

Weights reflect V1 priorities: V1 is 2D-first, but must not paint us into a corner for V2 3D.

| Criterion | Weight | PixiJS | Three.js | Canvas 2D |
|-----------|--------|--------|----------|-----------|
| Animated spritesheets (V1 core) | 25% | 10 | 4 | 3 |
| Particle effects (V1 core) | 15% | 7 | 5 | 3 |
| Isometric layout (V1) | 10% | 7 | 9 | 4 |
| Performance (V1) | 15% | 9 | 9 | 4 |
| glTF/3D future (V2) | 15% | 3 | 10 | 1 |
| Bundle size | 5% | 7 | 6 | 10 |
| Learning curve | 10% | 9 | 5 | 6 |
| Text rendering | 5% | 8 | 4 | 10 |
| **Weighted total** | | **7.45** | **6.35** | **3.85** |

---

## Decision

**Recommended: PixiJS (v8) for V1, with a structured migration path to hybrid PixiJS+Three.js for V2 3D.**

### Rationale

**PixiJS wins V1 decisively.** The Citadel theme's V1 needs are overwhelmingly 2D: spritesheet animation, particle effects, beams, text. PixiJS provides native primitives for all of these. A `ThemeRenderer` implementation in PixiJS maps almost 1:1 to PixiJS API calls:

| ThemeRenderer method | PixiJS implementation |
|---------------------|----------------------|
| `spawnEntity` | `new AnimatedSprite(sheet.animations[...])`, add to `Container` |
| `destroyEntity` | `container.removeChild(sprite); sprite.destroy()` |
| `move` / `fly` | Tween `sprite.x`, `sprite.y` per tick (progress from choreographer) |
| `flash` / `pulse` | `ColorMatrixFilter` or tint overlay + alpha animation |
| `drawBeam` | `Graphics.moveTo().lineTo()` with animated dash offset |
| `typeText` | `Text` with substring slice per tick |
| `playSound` | `howler.js` or Web Audio API (separate from renderer) |
| `setAnimation` | `animatedSprite.textures = sheet.animations[name]; play()` |
| `tick` | Update all active tweens, call `app.renderer.render(stage)` |

With Three.js, every one of these would require more boilerplate — especially spritesheet animation and text.

**Three.js's 3D strength isn't needed yet.** The Citadel manifest declares `perspective: false` and only `sprite`/`spritesheet`/`particle` visual types. Using Three.js for V1 means paying the 3D conceptual tax (scene, camera, materials, geometry) for a purely 2D scene.

**The 3D migration path exists.** When V2 needs `model3d` entities:

1. **Hybrid approach:** PixiJS v8 can share a WebGL context with Three.js. The 2D layer (sprites, UI, particles) stays in PixiJS; a Three.js scene renders 3D models behind or alongside. This is officially documented by PixiJS.

2. **Full migration:** If the scene becomes predominantly 3D, the theme can be rewritten with Three.js. Since the renderer is isolated behind `ThemeRenderer`, this is a theme-internal change — zero impact on `@sajou/core` or other packages.

3. **New theme:** A `@sajou/theme-citadel-3d` could coexist alongside the 2D version. Different themes can use different stacks — this is by design.

### Why not Canvas 2D?

Zero bundle size is appealing, but the engineering cost is prohibitive. We'd be writing a sprite engine, animation system, scene graph, and particle system from scratch. The Citadel theme needs GPU-accelerated rendering for smooth concurrent animations — Canvas 2D is CPU-bound and will struggle.

### Why not Three.js for V1?

Three.js is the right tool when the scene is 3D-first. The Citadel theme is 2D-first. Using Three.js for spritesheet animation is like using a CNC machine to cut paper — it works, but a pair of scissors is faster, simpler, and gets a better result.

---

## Implementation Notes

### V1 Dependencies for `@sajou/theme-citadel`

```json
{
  "dependencies": {
    "pixi.js": "^8.15.0"
  }
}
```

These live only in the theme's `package.json` — `@sajou/core` remains zero-dependency.

### Particle Emitter Strategy

Since the official `@pixi/particle-emitter` is not v8-compatible, two options:

1. **Use a community fork** (`custom-pixi-particles` or `@spd789562/particle-emitter`) — faster to ship, risk of maintenance gaps
2. **Write a minimal emitter** (~100 lines) using PixiJS's `ParticleContainer` — lifetime, velocity, color lerp, gravity. Our particle entities have simple configs (maxParticles, lifetime, rate, speed, scale, color ramp). A custom emitter avoids the dependency.

**Recommendation:** Option 2. The particle configs in our entity definitions are simple enough that a custom emitter on top of `ParticleContainer` is both smaller and more maintainable than a third-party dependency.

### Isometric Layout

The Citadel layout uses fixed named positions (oracle, forgeLeft, center, etc.) at absolute pixel coordinates. No camera rotation, no true isometric projection needed in V1. PixiJS's `Container` with z-index sorting handles this directly. If V2 adds camera panning/zooming, PixiJS's `Container` transforms support this.

---

## Consequences

### Positive
- Fast path to a working V1 renderer — PixiJS primitives align closely with ThemeRenderer methods
- Low learning curve for new contributors
- Small, focused dependency (one library for 2D rendering)
- GPU-accelerated rendering handles concurrent choreographies smoothly
- Clear V2 migration path via hybrid PixiJS+Three.js or full Three.js theme

### Negative
- No native glTF/3D support — V2 3D entities will require hybrid rendering or a new theme
- PixiJS v8 ecosystem is still maturing (some v7 plugins not yet ported)
- Particle emitter needs custom code or a community fork

### Mitigations
- The `ThemeRenderer` abstraction insulates all other packages from the rendering stack choice
- The hybrid PixiJS+Three.js approach is documented and officially supported
- A custom particle emitter for our simple configs is ~100 lines and avoids ecosystem risk

---

## References

- ADR-001: Signal Protocol Design
- ADR-002: Choreographer Runtime Design
- ADR-002: Declarative Entity Format
- SAJOU-MANIFESTO.md: theme rendering vision
- `packages/theme-api/src/renderer.ts`: ThemeRenderer interface
- `packages/theme-citadel/src/citadel-manifest.ts`: capabilities and entity catalog
- [PixiJS v8 documentation](https://pixijs.com/8.x/guides)
- [Three.js documentation](https://threejs.org/docs/)
- [PixiJS + Three.js hybrid rendering](https://pixijs.com/8.x/guides/third-party/mixing-three-and-pixi)
