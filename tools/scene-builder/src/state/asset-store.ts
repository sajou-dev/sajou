/**
 * Asset store.
 *
 * Holds imported asset files, categories, and browsing state.
 */

import type { AssetFile } from "../types.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AssetStoreState {
  assets: AssetFile[];
  categories: string[];
  selectedAssetPath: string | null;
  categoryFilter: string | null;
}

type Listener = () => void;

let state: AssetStoreState = {
  assets: [],
  categories: [],
  selectedAssetPath: null,
  categoryFilter: null,
};

const listeners: Listener[] = [];

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

/** Get the full asset store state. */
export function getAssetStore(): AssetStoreState {
  return state;
}

/** Get all assets, optionally filtered by current category. */
export function getFilteredAssets(): AssetFile[] {
  if (!state.categoryFilter) return state.assets;
  return state.assets.filter((a) => a.category === state.categoryFilter);
}

/** Find an asset by its path. */
export function getAssetByPath(path: string): AssetFile | undefined {
  return state.assets.find((a) => a.path === path);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Add assets to the store (deduplicates by path). */
export function addAssets(files: AssetFile[]): void {
  const existing = new Set(state.assets.map((a) => a.path));
  const newAssets = files.filter((f) => !existing.has(f.path));
  state = { ...state, assets: [...state.assets, ...newAssets] };
  notify();
}

/** Set the selected asset path. */
export function selectAsset(path: string | null): void {
  state = { ...state, selectedAssetPath: path };
  notify();
}

/** Set the category filter. */
export function setCategoryFilter(category: string | null): void {
  state = { ...state, categoryFilter: category };
  notify();
}

/** Add a category if it doesn't exist. */
export function addCategory(name: string): void {
  if (state.categories.includes(name)) return;
  state = { ...state, categories: [...state.categories, name] };
  notify();
}

/** Clear all assets. Revokes all object URLs to free memory. */
export function resetAssets(): void {
  for (const asset of state.assets) {
    URL.revokeObjectURL(asset.objectUrl);
  }
  state = {
    assets: [],
    categories: [],
    selectedAssetPath: null,
    categoryFilter: null,
  };
  notify();
}

/** Subscribe to asset store changes. Returns unsubscribe function. */
export function subscribeAssets(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notify(): void {
  for (const fn of listeners) fn();
}
