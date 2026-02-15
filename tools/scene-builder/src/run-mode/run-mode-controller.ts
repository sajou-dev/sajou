/**
 * Run mode controller — lifecycle manager for live choreography execution.
 *
 * startRunMode():
 *   1. Snapshot entity transforms
 *   2. Lazy-import @sajou/core (Choreographer, BrowserClock)
 *   3. Create adapter + sink + clock + choreographer
 *   4. Convert editor definitions → runtime definitions + register
 *   5. Create binding executor (peer of choreographer for property bindings)
 *   6. Subscribe to onSignal() — dispatch to choreographer + binding executor
 *   7. Activate run mode UI
 *   8. Start spritesheet animations (idle cycles)
 *
 * stopRunMode():
 *   0. Stop spritesheet animations
 *   1. Dispose choreographer
 *   2. Dispose binding executor
 *   3. Unsubscribe signal listener
 *   4. Restore entity snapshot
 *   5. Clean up state
 */

import type {
  ChoreographyDefinition,
  ChoreographyStep,
} from "@sajou/core";
import type { ChoreographyDef, ChoreographyStepDef } from "../types.js";
import { STRUCTURAL_ACTIONS } from "../types.js";
import { getSceneState, updateSceneState } from "../state/scene-state.js";
import { getChoreographyState } from "../state/choreography-state.js";
import { getChoreoInputInfo } from "../state/wiring-queries.js";
import { onSignal } from "../views/signal-connection.js";
import {
  setRunModeActive,
  saveSnapshot,
  getSnapshot,
  clearSnapshot,
  incrementSignalsProcessed,
} from "./run-mode-state.js";
import { createRunModeSink } from "./run-mode-sink.js";
import { startAnimations, stopAnimations } from "./run-mode-animator.js";
import { createBindingExecutor, type BindingExecutor } from "./run-mode-bindings.js";
import { createPixiAdapter } from "../canvas/pixi-adapter.js";
import { getEntitySpriteById, getCachedTexture } from "../canvas/scene-renderer.js";
import type { RenderAdapter } from "../canvas/render-adapter.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** Active Choreographer instance (null when not running). */
let choreographer: import("@sajou/core").Choreographer | null = null;

/** Active BrowserClock instance (null when not running). */
let clock: import("@sajou/core").BrowserClock | null = null;

/** Active BindingExecutor instance (null when not running). */
let bindingExecutor: BindingExecutor | null = null;

/** Active RenderAdapter instance (null when not running). */
let adapter: RenderAdapter | null = null;

/** Unsubscribe function for the signal listener. */
let signalUnsub: (() => void) | null = null;

/** Guard against re-entrant start during async import. */
let starting = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Start run mode — snapshot, create choreographer, subscribe to signals. */
export async function startRunMode(): Promise<void> {
  if (choreographer || starting) return; // Already running or starting
  starting = true;

  // 1. Snapshot entity transforms
  const { entities } = getSceneState();
  saveSnapshot(entities);

  // 2. Lazy-import @sajou/core
  const core = await import("@sajou/core");

  // 3. Create adapter + sink + clock + choreographer
  adapter = createPixiAdapter(getEntitySpriteById, getCachedTexture);
  const sink = createRunModeSink(adapter);
  clock = new core.BrowserClock();
  choreographer = new core.Choreographer({ clock, sink });
  starting = false;

  // 4. Convert editor definitions → runtime definitions + register
  const { choreographies } = getChoreographyState();
  const runtimeDefs = choreographies.map((c) => convertToRuntime(c));
  choreographer.registerAll(runtimeDefs);

  // 5. Create binding executor (peer of choreographer for property bindings)
  bindingExecutor = createBindingExecutor(adapter);

  // 6. Subscribe to incoming signals
  signalUnsub = onSignal((signal) => {
    if (!choreographer) return;

    // Check which choreographies should receive this signal type
    // by looking at each choreography's effective types (wiring-driven or fallback)
    const { choreographies: choreos } = getChoreographyState();
    let matched = false;

    for (const choreo of choreos) {
      const inputInfo = getChoreoInputInfo(choreo.id);
      if (inputInfo.effectiveTypes.includes(signal.type)) {
        matched = true;
        break;
      }
    }

    if (!matched) return;

    // Dispatch signal to choreographer (steps: move, fly, flash…)
    choreographer.handleSignal(
      { type: signal.type, payload: signal.payload },
      signal.correlationId,
    );

    // Dispatch signal to binding executor (bindings: animation.state, opacity…)
    if (bindingExecutor) {
      bindingExecutor.handleSignal({
        type: signal.type,
        payload: signal.payload as Record<string, unknown>,
      });
    }

    incrementSignalsProcessed();
  });

  // 7. Activate run mode UI
  setRunModeActive(true);
  document.getElementById("workspace")?.classList.add("workspace--running");

  // 8. Start spritesheet animations (idle cycles, etc.)
  startAnimations(adapter);

  console.log(
    `[run-mode] Started — ${runtimeDefs.length} choreograph${runtimeDefs.length !== 1 ? "ies" : "y"} registered`,
  );
}

/** Stop run mode — dispose choreographer, restore snapshot. */
export function stopRunMode(): void {
  // 0. Stop spritesheet animations (restores original textures)
  stopAnimations();

  // 1. Dispose choreographer
  if (choreographer) {
    choreographer.dispose();
    choreographer = null;
  }
  if (clock) {
    clock = null;
  }

  // 2. Dispose binding executor
  if (bindingExecutor) {
    bindingExecutor.dispose();
    bindingExecutor = null;
  }

  // 3. Unsubscribe signal listener
  if (signalUnsub) {
    signalUnsub();
    signalUnsub = null;
  }

  // 4. Restore entity snapshot
  const snapshot = getSnapshot();
  if (snapshot) {
    const { entities } = getSceneState();
    const restored = entities.map((e) => {
      const snap = snapshot.find((s) => s.id === e.id);
      if (!snap) return e;
      return {
        ...e,
        x: snap.x,
        y: snap.y,
        scale: snap.scale,
        rotation: snap.rotation,
        opacity: snap.opacity,
        visible: snap.visible,
      };
    });
    updateSceneState({ entities: restored });
  }

  // 5. Clean up
  clearSnapshot();
  adapter = null;
  setRunModeActive(false);
  document.getElementById("workspace")?.classList.remove("workspace--running");

  console.log("[run-mode] Stopped — entities restored.");
}

/** Toggle run mode on/off. */
export async function toggleRunMode(): Promise<void> {
  if (choreographer) {
    stopRunMode();
  } else {
    await startRunMode();
  }
}

// ---------------------------------------------------------------------------
// Editor → Runtime conversion
// ---------------------------------------------------------------------------

/**
 * Convert an editor ChoreographyDef to a runtime ChoreographyDefinition.
 *
 * Strips editor-only fields (id, nodeX, nodeY, collapsed).
 * Flattens step params into the step object (runtime expects flat steps).
 * Converts children recursively.
 */
function convertToRuntime(editorDef: ChoreographyDef): ChoreographyDefinition {
  return {
    on: editorDef.on,
    when: editorDef.when,
    interrupts: editorDef.interrupts || undefined,
    steps: editorDef.steps.map((s) => convertStep(s, editorDef)),
  };
}

/** Convert a single editor step to a runtime step. */
function convertStep(editorStep: ChoreographyStepDef, choreo: ChoreographyDef): ChoreographyStep {
  if (STRUCTURAL_ACTIONS.includes(editorStep.action)) {
    // Structural step: parallel, onArrive, onInterrupt
    return {
      action: editorStep.action,
      steps: (editorStep.children ?? []).map((s) => convertStep(s, choreo)),
    } as ChoreographyStep;
  }

  // Action step: flatten params into the step object
  const step: Record<string, unknown> = {
    action: editorStep.action,
  };

  // Entity: explicit step value > choreography default target > omitted
  // Treat empty string as "not set" — fall through to default target
  if (editorStep.entity) {
    step["entity"] = editorStep.entity;
  } else if (choreo.defaultTargetEntityId) {
    step["entity"] = choreo.defaultTargetEntityId;
  }

  if (editorStep.target) step["target"] = editorStep.target;
  if (editorStep.delay !== undefined && editorStep.delay > 0) step["delay"] = editorStep.delay;
  if (editorStep.duration !== undefined) step["duration"] = editorStep.duration;
  if (editorStep.easing !== undefined) step["easing"] = editorStep.easing;

  // Merge params bag into the step (runtime expects flat)
  for (const [key, value] of Object.entries(editorStep.params)) {
    step[key] = value;
  }

  return step as ChoreographyStep;
}
