/**
 * Shader editor state store.
 *
 * Module-state pattern (same as scene-state, choreography-state, etc.).
 * Holds shader definitions, selection, and playback state.
 */

import type { ShaderEditorState, ShaderDef } from "./shader-types.js";

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

function createDefault(): ShaderEditorState {
  return {
    shaders: [],
    selectedShaderId: null,
    activeMode: "glsl",
    playing: true,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Listener = () => void;

let state: ShaderEditorState = createDefault();
const listeners: Listener[] = [];

/** Get current shader editor state. */
export function getShaderState(): ShaderEditorState {
  return state;
}

/** Replace the entire shader state and notify listeners. */
export function setShaderState(next: ShaderEditorState): void {
  state = next;
  notify();
}

/** Partially update shader state (shallow merge) and notify. */
export function updateShaderState(partial: Partial<ShaderEditorState>): void {
  state = { ...state, ...partial };
  notify();
}

/** Reset to defaults. */
export function resetShaderState(): void {
  state = createDefault();
  notify();
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Add a new shader definition. Returns the added shader. */
export function addShader(shader: ShaderDef): ShaderDef {
  state = {
    ...state,
    shaders: [...state.shaders, shader],
    selectedShaderId: shader.id,
  };
  notify();
  return shader;
}

/** Update an existing shader by ID (shallow merge). */
export function updateShader(id: string, partial: Partial<ShaderDef>): void {
  state = {
    ...state,
    shaders: state.shaders.map((s) => (s.id === id ? { ...s, ...partial } : s)),
  };
  notify();
}

/** Remove a shader by ID. Clears selection if it was selected. */
export function removeShader(id: string): void {
  const newShaders = state.shaders.filter((s) => s.id !== id);
  state = {
    ...state,
    shaders: newShaders,
    selectedShaderId: state.selectedShaderId === id ? null : state.selectedShaderId,
  };
  notify();
}

/** Select a shader by ID. */
export function selectShader(id: string | null): void {
  if (state.selectedShaderId === id) return;
  state = { ...state, selectedShaderId: id };
  notify();
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/** Subscribe to shader state changes. Returns unsubscribe function. */
export function subscribeShaders(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function notify(): void {
  for (const fn of listeners) fn();
}
