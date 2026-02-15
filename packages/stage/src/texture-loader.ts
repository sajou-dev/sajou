/**
 * Texture loader for the Stage.
 *
 * Loads textures from blob URLs (scene-builder asset store) or HTTP URLs.
 * Uses NearestFilter for pixel-art fidelity. Caches loaded textures
 * by asset path for reuse across entity spawns.
 */

import * as THREE from "three";

/** Cached texture entry. */
interface CacheEntry {
  readonly texture: THREE.Texture;
  readonly width: number;
  readonly height: number;
}

/** Texture cache keyed by asset path. */
const cache = new Map<string, CacheEntry>();

/**
 * Load and cache a texture from a URL (blob or HTTP).
 *
 * Uses HTMLImageElement → THREE.Texture with NearestFilter for
 * pixel-art crispness. The texture is flipped on Y to match
 * Three.js UV conventions.
 *
 * @param assetPath  Cache key (asset path from entity store).
 * @param url  The URL to load (blob URL or HTTP).
 * @returns The loaded texture, or null on failure.
 */
export async function loadTexture(
  assetPath: string,
  url: string,
): Promise<THREE.Texture | null> {
  const cached = cache.get(assetPath);
  if (cached) return cached.texture;

  try {
    const img = await loadImage(url);
    const texture = new THREE.Texture(img);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    cache.set(assetPath, {
      texture,
      width: img.naturalWidth,
      height: img.naturalHeight,
    });

    return texture;
  } catch {
    return null;
  }
}

/**
 * Get a cached texture by asset path.
 * Returns null if not yet loaded.
 */
export function getCachedTexture(assetPath: string): THREE.Texture | null {
  return cache.get(assetPath)?.texture ?? null;
}

/**
 * Get cached texture dimensions.
 * Returns null if not yet loaded.
 */
export function getCachedTextureSize(
  assetPath: string,
): { width: number; height: number } | null {
  const entry = cache.get(assetPath);
  if (!entry) return null;
  return { width: entry.width, height: entry.height };
}

/** Clear the texture cache and dispose all textures. */
export function clearTextureCache(): void {
  for (const entry of cache.values()) {
    entry.texture.dispose();
  }
  cache.clear();
}

/** Load an HTMLImageElement from a URL. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}
