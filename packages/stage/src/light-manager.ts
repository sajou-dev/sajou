/**
 * Lighting manager for the Stage scene.
 *
 * Provides ambient + directional (global sun) lighting, plus dynamic
 * point lights (torches, fires) with optional flicker.
 */

import * as THREE from "three";

/** Configuration for the global lighting setup. */
export interface LightConfig {
  /** Compass angle of the directional light in degrees. Default: 45. */
  readonly globalAngle?: number;
  /** Elevation angle in degrees. Default: 60. */
  readonly globalElevation?: number;
  /** Directional light color. Default: 0xffffff. */
  readonly globalColor?: number;
  /** Directional light intensity. Default: 1.0. */
  readonly globalIntensity?: number;
  /** Ambient light intensity. Default: 0.3. */
  readonly ambientIntensity?: number;
}

/** Properties for updating a point light. */
export interface PointLightUpdate {
  readonly color?: string;
  readonly intensity?: number;
  readonly radius?: number;
  readonly enabled?: boolean;
}

/** Manages all lights in the Stage scene. */
export class LightManager {
  private readonly scene: THREE.Scene;
  private readonly ambient: THREE.AmbientLight;
  private readonly directional: THREE.DirectionalLight;
  private readonly pointLights = new Map<string, THREE.PointLight>();

  constructor(scene: THREE.Scene, config: LightConfig = {}) {
    this.scene = scene;

    const {
      globalAngle = 45,
      globalElevation = 60,
      globalColor = 0xffffff,
      globalIntensity = 1.0,
      ambientIntensity = 0.3,
    } = config;

    this.ambient = new THREE.AmbientLight(0xffffff, ambientIntensity);
    scene.add(this.ambient);

    this.directional = new THREE.DirectionalLight(globalColor, globalIntensity);
    const aRad = (globalAngle * Math.PI) / 180;
    const eRad = (globalElevation * Math.PI) / 180;
    const dist = 20;
    this.directional.position.set(
      Math.sin(aRad) * Math.cos(eRad) * dist,
      Math.sin(eRad) * dist,
      Math.cos(aRad) * Math.cos(eRad) * dist,
    );
    scene.add(this.directional);
  }

  /** Add a point light (torch, fire, lamp). */
  addPointLight(
    id: string,
    x: number,
    z: number,
    color: number,
    intensity: number,
    distance: number,
  ): void {
    this.removePointLight(id);

    const light = new THREE.PointLight(color, intensity, distance);
    light.position.set(x, 1.5, z);
    light.userData["baseIntensity"] = intensity;
    this.scene.add(light);
    this.pointLights.set(id, light);
  }

  /** Update point light properties. */
  updatePointLight(id: string, props: PointLightUpdate): void {
    const light = this.pointLights.get(id);
    if (!light) return;

    if (props.color !== undefined) light.color.set(props.color);
    if (props.intensity !== undefined) {
      light.intensity = props.intensity;
      light.userData["baseIntensity"] = props.intensity;
    }
    if (props.radius !== undefined) light.distance = props.radius;
    if (props.enabled !== undefined) light.visible = props.enabled;
  }

  /** Remove a point light. */
  removePointLight(id: string): void {
    const light = this.pointLights.get(id);
    if (!light) return;

    this.scene.remove(light);
    light.dispose();
    this.pointLights.delete(id);
  }

  /** Dispose all lights and clean up. */
  dispose(): void {
    this.scene.remove(this.ambient);
    this.ambient.dispose();
    this.scene.remove(this.directional);
    this.directional.dispose();

    for (const id of [...this.pointLights.keys()]) {
      this.removePointLight(id);
    }
  }
}
