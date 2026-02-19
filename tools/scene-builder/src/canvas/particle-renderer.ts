/**
 * Particle renderer module.
 *
 * Manages Three.js particle systems (THREE.Points + BufferGeometry)
 * from SceneState.particles. Subscribes to state changes and diffs
 * the emitter list to add/update/remove particle systems.
 *
 * CPU simulation: each particle has age, lifetime, position, velocity.
 * Each tick advances the simulation and updates buffer attributes.
 */

import * as THREE from "three";
import { getSceneState, subscribeScene } from "../state/scene-state.js";
import { getThreeScene } from "./canvas.js";
import type { ParticleEmitterState } from "../types.js";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** A single particle in the simulation. */
interface Particle {
  age: number;
  lifetime: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
}

/** Runtime state for a single particle emitter. */
interface ParticleSystemRuntime {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  particles: Particle[];
  positionAttr: THREE.Float32BufferAttribute;
  colorAttr: THREE.Float32BufferAttribute;
  sizeAttr: THREE.Float32BufferAttribute;
  config: ParticleEmitterState;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** Map of ParticleEmitterState.id -> runtime. */
const systems = new Map<string, ParticleSystemRuntime>();

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Parse hex "#RRGGBB" to [r, g, b] in 0-1 range. */
function parseColor(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map((c) => c / 255) as [number, number, number];
}

/** Lerp between two color arrays. */
function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Sample a color from a gradient defined by hex stops, at position t (0-1). */
function sampleGradient(stops: string[], t: number): [number, number, number] {
  if (stops.length === 0) return [1, 1, 1];
  if (stops.length === 1) return parseColor(stops[0]!);

  const clamped = Math.max(0, Math.min(1, t));
  const segmentCount = stops.length - 1;
  const rawIdx = clamped * segmentCount;
  const idx = Math.min(Math.floor(rawIdx), segmentCount - 1);
  const frac = rawIdx - idx;

  return lerpColor(parseColor(stops[idx]!), parseColor(stops[idx + 1]!), frac);
}

// ---------------------------------------------------------------------------
// Particle spawn
// ---------------------------------------------------------------------------

/** Random float in [min, max]. */
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Spawn/respawn a particle at the emitter origin with random velocity. */
function spawnParticle(config: ParticleEmitterState): Particle {
  const lifetime = randRange(config.lifetime[0], config.lifetime[1]);

  let vx: number;
  let vz: number;

  if (config.type === "radial") {
    vx = randRange(config.velocity.x[0], config.velocity.x[1]);
    vz = randRange(config.velocity.y[0], config.velocity.y[1]);
  } else {
    // Directional: direction vector + spread (~17 deg = ~0.3 rad)
    const len = Math.hypot(config.direction.x, config.direction.y);
    const baseAngle = len > 0
      ? Math.atan2(config.direction.y, config.direction.x)
      : 0;
    const spread = (17 * Math.PI) / 180;
    const angle = baseAngle + (Math.random() - 0.5) * 2 * spread;
    const speed = randRange(config.speed[0], config.speed[1]);
    vx = Math.cos(angle) * speed;
    vz = Math.sin(angle) * speed;
  }

  return { age: 0, lifetime, x: 0, z: 0, vx, vz };
}

// ---------------------------------------------------------------------------
// System creation
// ---------------------------------------------------------------------------

/** Create a particle system runtime for an emitter config. */
function createSystem(config: ParticleEmitterState): ParticleSystemRuntime {
  const count = config.count;

  const positionArr = new Float32Array(count * 3);
  const colorArr = new Float32Array(count * 3);
  const sizeArr = new Float32Array(count);

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.Float32BufferAttribute(positionArr, 3);
  const colorAttr = new THREE.Float32BufferAttribute(colorArr, 3);
  const sizeAttr = new THREE.Float32BufferAttribute(sizeArr, 1);

  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);
  geometry.setAttribute("size", sizeAttr);

  const material = new THREE.PointsMaterial({
    size: config.size[0],
    vertexColors: true,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: config.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    sizeAttenuation: false,
  });

  const points = new THREE.Points(geometry, material);
  // Place at emitter position, Y=0.5 (above ground plane)
  points.position.set(config.x, 0.5, config.y);
  // Force particles to render after all entity meshes.
  // Without this, isometric back-to-front transparent sorting draws
  // particles first (Y=0.5 is "farther" from camera) then floor tiles over them.
  points.renderOrder = 1000;

  // Initialize particles with random ages for immediate visual spread
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const p = spawnParticle(config);
    // Spread initial ages so particles don't all spawn at once
    p.age = Math.random() * p.lifetime;
    p.x = p.vx * p.age;
    p.z = p.vz * p.age;
    particles.push(p);
  }

  const runtime: ParticleSystemRuntime = {
    points,
    geometry,
    material,
    particles,
    positionAttr,
    colorAttr,
    sizeAttr,
    config,
  };

  // Initial buffer update
  updateBuffers(runtime);

  return runtime;
}

/** Write particle data to GPU buffers. */
function updateBuffers(runtime: ParticleSystemRuntime): void {
  const { particles, positionAttr, colorAttr, sizeAttr, config } = runtime;
  const posArr = positionAttr.array as Float32Array;
  const colArr = colorAttr.array as Float32Array;
  const szArr = sizeAttr.array as Float32Array;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!;
    const t = p.lifetime > 0 ? p.age / p.lifetime : 1;

    // Position (local to emitter)
    posArr[i * 3] = p.x;
    posArr[i * 3 + 1] = 0;
    posArr[i * 3 + 2] = p.z;

    // Color from gradient
    const [r, g, b] = sampleGradient(config.colorOverLife, t);
    colArr[i * 3] = r;
    colArr[i * 3 + 1] = g;
    colArr[i * 3 + 2] = b;

    // Size: lerp from size[0] to size[1], fade out
    const sizeLerp = config.size[0] + (config.size[1] - config.size[0]) * t;
    const fadeOut = 1 - t;
    szArr[i] = sizeLerp * fadeOut;
  }

  positionAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
  sizeAttr.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/** Full diff: sync particle systems from SceneState.particles. */
function syncParticles(): void {
  const scene = getThreeScene();
  if (!scene) return;

  const { particles } = getSceneState();
  const currentIds = new Set(particles.map((p) => p.id));

  // Remove systems no longer in state
  for (const [id, runtime] of systems) {
    if (!currentIds.has(id)) {
      scene.remove(runtime.points);
      runtime.geometry.dispose();
      runtime.material.dispose();
      systems.delete(id);
    }
  }

  // Add/update systems
  for (const emitter of particles) {
    let runtime = systems.get(emitter.id);

    if (!runtime) {
      runtime = createSystem(emitter);
      scene.add(runtime.points);
      systems.set(emitter.id, runtime);
    } else {
      // Update position
      runtime.points.position.set(emitter.x, 0.5, emitter.y);

      // Update blending
      runtime.material.blending = emitter.glow ? THREE.AdditiveBlending : THREE.NormalBlending;
      runtime.material.needsUpdate = true;

      // If count changed, rebuild the system
      if (runtime.config.count !== emitter.count) {
        scene.remove(runtime.points);
        runtime.geometry.dispose();
        runtime.material.dispose();
        runtime = createSystem(emitter);
        scene.add(runtime.points);
        systems.set(emitter.id, runtime);
      }

      runtime.config = emitter;
    }
  }
}

// ---------------------------------------------------------------------------
// Tick (simulation)
// ---------------------------------------------------------------------------

/**
 * Advance all particle simulations by dt seconds.
 * Called each frame from the render loop.
 */
export function tickParticles(dt: number): void {
  for (const [, runtime] of systems) {
    const { particles, config } = runtime;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!;
      p.age += dt;

      if (p.age >= p.lifetime) {
        // Respawn
        const fresh = spawnParticle(config);
        particles[i] = fresh;
        continue;
      }

      // Move
      p.x += p.vx * dt;
      p.z += p.vz * dt;
    }

    updateBuffers(runtime);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Initialize the particle renderer. Creates initial systems and subscribes to state. */
export function initParticleRenderer(): void {
  syncParticles();
  subscribeScene(syncParticles);
}

/** Dispose all particle systems and unsubscribe. */
export function disposeParticleRenderer(): void {
  const scene = getThreeScene();

  for (const [, runtime] of systems) {
    if (scene) scene.remove(runtime.points);
    runtime.geometry.dispose();
    runtime.material.dispose();
  }
  systems.clear();
}
