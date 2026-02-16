/**
 * Light renderer module.
 *
 * Manages Three.js lights (ambient, directional, point) from SceneState.lighting.
 * Subscribes to state changes and diffs the light list to add/update/remove.
 * Provides flicker animation for point lights via a double sine wave.
 */

import * as THREE from "three";
import { getSceneState, subscribeScene } from "../state/scene-state.js";
import { getThreeScene } from "./canvas.js";
import type { LightSourceState } from "../types.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let ambientLight: THREE.AmbientLight | null = null;
let directionalLight: THREE.DirectionalLight | null = null;

/** Map of LightSourceState.id → Three.js PointLight. */
const pointLights = new Map<string, THREE.PointLight>();

/** Base intensities for flicker calculation (before flicker modulation). */
const baseIntensities = new Map<string, number>();

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/** Full diff: sync Three.js lights from SceneState.lighting. */
function syncLights(): void {
  const scene = getThreeScene();
  if (!scene) return;

  const { lighting } = getSceneState();

  // --- Ambient ---
  if (!ambientLight) {
    ambientLight = new THREE.AmbientLight(lighting.ambient.color, lighting.ambient.intensity);
    scene.add(ambientLight);
  } else {
    ambientLight.color.set(lighting.ambient.color);
    ambientLight.intensity = lighting.ambient.intensity;
  }

  // --- Directional ---
  if (lighting.directional.enabled) {
    if (!directionalLight) {
      directionalLight = new THREE.DirectionalLight(lighting.directional.color, lighting.directional.intensity);
      scene.add(directionalLight);
    }

    directionalLight.color.set(lighting.directional.color);
    directionalLight.intensity = lighting.directional.intensity;
    directionalLight.visible = true;

    // Position from angle/elevation, distance 20 from center
    const { dimensions } = getSceneState();
    const cx = dimensions.width / 2;
    const cz = dimensions.height / 2;
    const dist = 20;
    const angleRad = (lighting.directional.angle * Math.PI) / 180;
    const elevRad = (lighting.directional.elevation * Math.PI) / 180;

    const horizDist = dist * Math.cos(elevRad);
    const dx = Math.sin(angleRad) * horizDist;
    const dz = -Math.cos(angleRad) * horizDist;
    const dy = dist * Math.sin(elevRad);

    directionalLight.position.set(cx + dx, dy, cz + dz);
    directionalLight.target.position.set(cx, 0, cz);

    // Ensure target is added to scene (Three.js requirement)
    if (!directionalLight.target.parent) {
      scene.add(directionalLight.target);
    }
  } else if (directionalLight) {
    directionalLight.visible = false;
  }

  // --- Point lights (diff) ---
  const currentIds = new Set(lighting.sources.map((s) => s.id));

  // Remove lights no longer in state
  for (const [id, light] of pointLights) {
    if (!currentIds.has(id)) {
      scene.remove(light);
      light.dispose();
      pointLights.delete(id);
      baseIntensities.delete(id);
    }
  }

  // Add/update point lights
  for (const source of lighting.sources) {
    let light = pointLights.get(source.id);

    if (!light) {
      light = new THREE.PointLight(source.color, source.intensity, source.radius);
      scene.add(light);
      pointLights.set(source.id, light);
    }

    light.color.set(source.color);
    light.intensity = source.intensity;
    light.distance = source.radius;

    // Position: scene (x, y) → world (x, 1.5, z)
    light.position.set(source.x, 1.5, source.y);

    baseIntensities.set(source.id, source.intensity);
  }
}

// ---------------------------------------------------------------------------
// Flicker animation
// ---------------------------------------------------------------------------

/** Whether any lights have flicker enabled. */
export function hasFlickerLights(): boolean {
  const { lighting } = getSceneState();
  return lighting.sources.some((s) => s.flicker && s.flicker.amount > 0 && s.flicker.speed > 0);
}

/**
 * Animate point light intensities with flicker effect.
 * Uses a double sine wave for organic flame-like variation.
 *
 * @param now - Current time in milliseconds (performance.now()).
 */
export function tickFlicker(now: number): void {
  const { lighting } = getSceneState();

  for (const source of lighting.sources) {
    if (!source.flicker || source.flicker.amount <= 0 || source.flicker.speed <= 0) continue;

    const light = pointLights.get(source.id);
    const base = baseIntensities.get(source.id);
    if (!light || base === undefined) continue;

    const t = now / 1000;
    const { speed, amount } = source.flicker;

    // Double sine wave for organic variation
    const wave1 = Math.sin(t * speed * 2 * Math.PI);
    const wave2 = Math.sin(t * speed * 1.7 * Math.PI + 0.5);
    const combined = (wave1 * 0.6 + wave2 * 0.4); // range [-1, 1]

    light.intensity = base * (1 + combined * amount);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Initialize the light renderer. Creates initial lights and subscribes to state. */
export function initLightRenderer(): void {
  syncLights();
  subscribeScene(syncLights);
}

/** Dispose all lights and unsubscribe. */
export function disposeLightRenderer(): void {
  const scene = getThreeScene();

  if (ambientLight && scene) {
    scene.remove(ambientLight);
    ambientLight.dispose();
  }
  ambientLight = null;

  if (directionalLight && scene) {
    scene.remove(directionalLight);
    scene.remove(directionalLight.target);
    directionalLight.dispose();
  }
  directionalLight = null;

  for (const [, light] of pointLights) {
    if (scene) scene.remove(light);
    light.dispose();
  }
  pointLights.clear();
  baseIntensities.clear();
}
