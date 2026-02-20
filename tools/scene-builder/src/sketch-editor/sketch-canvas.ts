/**
 * Sketch preview canvas.
 *
 * Routes between p5.js and Three.js runtimes based on the sketch mode.
 * Lifecycle: runSketch(), stopSketch(), setParam().
 */

import p5 from "p5";
import { getEditorState, subscribeEditor } from "../state/editor-state.js";
import { getSketchState, subscribeSketch } from "./sketch-state.js";
import { isFullWindow, getFullWindowElement, onFullWindowChange } from "../utils/fullscreen.js";
import {
  initThreejsCanvas,
  runThreejsScript,
  stopThreejsScript,
  setThreejsParam,
  isThreejsRunning,
} from "./threejs-canvas.js";
import type { SketchMode } from "./sketch-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of running a sketch. */
export interface RunResult {
  /** Whether the sketch started successfully. */
  success: boolean;
  /** Error message (empty on success). */
  error: string;
}

/** Listener for run result changes. */
type RunListener = (result: RunResult) => void;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let p5Instance: p5 | null = null;
let container: HTMLElement | null = null;
let sajouBridge: Record<string, unknown> = {};
let startTime = 0;
let runListeners: RunListener[] = [];
let lastRunSketchId: string | null = null;
let lastRunMode: SketchMode = "p5";
let resizeObserver: ResizeObserver | null = null;
let threejsInitialized = false;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/** Initialize the p5 preview in the given container element. */
export function initSketchCanvas(el: HTMLElement): void {
  container = el;

  // Resize p5 canvas when container changes size (e.g. fullscreen enter/exit)
  resizeObserver = new ResizeObserver(() => {
    if (p5Instance && container) {
      p5Instance.resizeCanvas(container.clientWidth, container.clientHeight);
    }
  });
  resizeObserver.observe(el);

  subscribeEditor(syncLoop);
  subscribeSketch(syncLoop);
  onFullWindowChange(() => syncLoop());
  syncLoop();
}

// ---------------------------------------------------------------------------
// Sketch execution
// ---------------------------------------------------------------------------

/**
 * Run a sketch from source code.
 * Routes to p5 or Three.js runtime based on mode.
 */
export function runSketch(source: string, params: Record<string, unknown>, mode: SketchMode = "p5"): RunResult {
  stopSketch();

  if (!container) {
    return { success: false, error: "Container not initialized" };
  }

  lastRunMode = mode;

  if (mode === "threejs") {
    if (!threejsInitialized) {
      initThreejsCanvas(container);
      threejsInitialized = true;
    }
    const r = runThreejsScript(source, params);
    const result: RunResult = { success: r.success, error: r.error };
    notifyRunListeners(result);
    return result;
  }

  // p5 mode
  const w = container.clientWidth || 400;
  const h = container.clientHeight || 300;

  sajouBridge = {
    ...params,
    _width: w,
    _height: h,
    _time: 0,
    _mouse: { x: 0, y: 0 },
  };

  startTime = performance.now();

  try {
    const sketchFn = createSketchFn(source, sajouBridge);
    p5Instance = new p5(sketchFn, container);
    const result: RunResult = { success: true, error: "" };
    notifyRunListeners(result);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const result: RunResult = { success: false, error: message };
    notifyRunListeners(result);
    return result;
  }
}

/** Stop the currently running sketch (whichever runtime is active). */
export function stopSketch(): void {
  if (p5Instance) {
    p5Instance.remove();
    p5Instance = null;
  }
  if (isThreejsRunning()) {
    stopThreejsScript();
  }
}

/** Set a single param value on the running instance (no re-run needed). */
export function setParam(name: string, value: unknown): void {
  if (lastRunMode === "threejs") {
    setThreejsParam(name, value);
  } else {
    sajouBridge[name] = value;
  }
}

/** Check if a sketch is currently running (either runtime). */
export function isRunning(): boolean {
  return p5Instance !== null || isThreejsRunning();
}

// ---------------------------------------------------------------------------
// Run result subscriptions
// ---------------------------------------------------------------------------

/** Subscribe to run result changes. Returns unsubscribe function. */
export function onRunResult(fn: RunListener): () => void {
  runListeners.push(fn);
  return () => {
    const idx = runListeners.indexOf(fn);
    if (idx >= 0) runListeners.splice(idx, 1);
  };
}

function notifyRunListeners(result: RunResult): void {
  for (const fn of runListeners) fn(result);
}

// ---------------------------------------------------------------------------
// Sketch factory
// ---------------------------------------------------------------------------

/**
 * Create a p5 sketch function (instance mode) from user source code.
 * The user code receives `p` with `p.sajou` as the param bridge.
 */
function createSketchFn(source: string, bridge: Record<string, unknown>): (p: p5) => void {
  return (p: p5) => {
    // Inject sajou param bridge
    (p as unknown as Record<string, unknown>)["sajou"] = bridge;

    // Execute user code with p5 instance in scope
    try {
      const fn = new Function("p", source);
      fn(p);
    } catch (err: unknown) {
      console.error("[p5-canvas] Sketch execution error:", err);
      throw err;
    }
  };
}

// ---------------------------------------------------------------------------
// Loop sync
// ---------------------------------------------------------------------------

/** Start/stop sketch based on pipeline visibility and playing state. */
function syncLoop(): void {
  const { pipelineLayout } = getEditorState();
  const { playing, sketches, selectedSketchId } = getSketchState();
  const p5El = document.getElementById("p5-node-content");
  const isFS = isFullWindow() && getFullWindowElement() === p5El;
  const shouldRun = (pipelineLayout.extended.includes("p5") || isFS) && playing;
  const anyRunning = p5Instance !== null || isThreejsRunning();

  // Re-run if sketch selection changed while running
  const sketchChanged = selectedSketchId !== lastRunSketchId;
  const sketch = sketches.find((s) => s.id === selectedSketchId);
  const mode: SketchMode = sketch?.mode ?? "p5";
  const modeChanged = mode !== lastRunMode;

  if (shouldRun && (!anyRunning || sketchChanged || modeChanged)) {
    if (sketch) {
      lastRunSketchId = selectedSketchId;
      const params: Record<string, unknown> = {};
      for (const param of sketch.params) {
        params[param.name] = param.value;
      }
      runSketch(sketch.source, params, mode);
    }
  } else if (!shouldRun && anyRunning) {
    stopSketch();
    lastRunSketchId = null;
  }
}

// ---------------------------------------------------------------------------
// Dispose
// ---------------------------------------------------------------------------

/** Dispose of all resources. */
export function disposeSketchCanvas(): void {
  stopSketch();
  resizeObserver?.disconnect();
  resizeObserver = null;
  runListeners = [];
  container = null;
  threejsInitialized = false;
}
