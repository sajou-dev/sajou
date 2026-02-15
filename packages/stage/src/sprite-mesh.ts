/**
 * Sprite mesh factory for the Stage.
 *
 * Creates upright PlaneGeometry meshes with MeshStandardMaterial
 * for rendering textured sprites. Supports normal maps for dynamic
 * lighting on 2D sprites.
 *
 * The mesh is a vertical plane (facing the camera via billboard angle)
 * with its bottom edge at y=0 so it sits on the ground plane.
 */

import * as THREE from "three";

/** Options for creating a sprite mesh. */
export interface SpriteMeshOptions {
  /** Width in world units. */
  readonly width: number;
  /** Height in world units. */
  readonly height: number;
  /** Diffuse texture (the sprite image). */
  readonly map: THREE.Texture;
  /** Optional normal map for lighting effects. */
  readonly normalMap?: THREE.Texture;
  /** Billboard Y-axis rotation angle (from computeBillboardAngle). 0 = no billboard. */
  readonly billboardAngle?: number;
}

/**
 * Create a sprite mesh: vertical plane with MeshStandardMaterial.
 *
 * The plane's pivot is at the bottom center, so the sprite stands
 * on the ground. Material is double-sided and transparent for alpha.
 */
export function createSpriteMesh(options: SpriteMeshOptions): THREE.Mesh {
  const { width, height, map, normalMap, billboardAngle = 0 } = options;

  const geometry = new THREE.PlaneGeometry(width, height);
  // Shift geometry up so pivot is at bottom center
  geometry.translate(0, height / 2, 0);

  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.01,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.y = billboardAngle;

  return mesh;
}

/**
 * Update the UV coordinates of a sprite mesh to show a specific
 * frame from a spritesheet.
 *
 * @param mesh  The sprite mesh to update.
 * @param frameX  Frame X position in pixels.
 * @param frameY  Frame Y position in pixels.
 * @param frameW  Frame width in pixels.
 * @param frameH  Frame height in pixels.
 * @param texW  Total texture width in pixels.
 * @param texH  Total texture height in pixels.
 */
export function setUVFrame(
  mesh: THREE.Mesh,
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
  texW: number,
  texH: number,
): void {
  const uv = mesh.geometry.getAttribute("uv");
  if (!uv) return;

  const u0 = frameX / texW;
  const u1 = (frameX + frameW) / texW;
  const v0 = 1 - (frameY + frameH) / texH; // Three.js UV: 0 at bottom
  const v1 = 1 - frameY / texH;

  // PlaneGeometry UVs (4 vertices): BL, BR, TL, TR
  uv.setXY(0, u0, v0); // bottom-left
  uv.setXY(1, u1, v0); // bottom-right
  uv.setXY(2, u0, v1); // top-left
  uv.setXY(3, u1, v1); // top-right
  uv.needsUpdate = true;
}
