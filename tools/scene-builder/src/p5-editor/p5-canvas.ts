/**
 * p5.js preview canvas.
 *
 * Manages a p5 instance (instance mode) for sketch preview.
 * Injects sajou params bridge and auto-injects _width, _height, _time, _mouse.
 * Lifecycle: runSketch(), stopSketch(), setParam().
 */

import p5 from "p5";
import { getEditorState, subscribeEditor } from "../state/editor-state.js";
import { getP5State, subscribeP5 } from "./p5-state.js";
import { isFullWindow, getFullWindowElement, onFullWindowChange } from "../utils/fullscreen.js";

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
let resizeObserver: ResizeObserver | null = null;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/** Initialize the p5 preview in the given container element. */
export function initP5Canvas(el: HTMLElement): void {
  container = el;

  // Resize p5 canvas when container changes size (e.g. fullscreen enter/exit)
  resizeObserver = new ResizeObserver(() => {
    if (p5Instance && container) {
      p5Instance.resizeCanvas(container.clientWidth, container.clientHeight);
    }
  });
  resizeObserver.observe(el);

  subscribeEditor(syncLoop);
  subscribeP5(syncLoop);
  onFullWindowChange(() => syncLoop());
  syncLoop();
}

// ---------------------------------------------------------------------------
// Sketch execution
// ---------------------------------------------------------------------------

/**
 * Run a sketch from source code.
 * Destroys any previous instance and creates a new one.
 */
export function runSketch(source: string, params: Record<string, unknown>): RunResult {
  stopSketch();

  if (!container) {
    return { success: false, error: "Container not initialized" };
  }

  const w = container.clientWidth || 400;
  const h = container.clientHeight || 300;

  // Build sajou bridge with auto-injected values
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

/** Stop the currently running sketch. */
export function stopSketch(): void {
  if (p5Instance) {
    p5Instance.remove();
    p5Instance = null;
  }
}

/** Set a single param value on the running instance (no re-run needed). */
export function setParam(name: string, value: unknown): void {
  sajouBridge[name] = value;
}

/** Check if a sketch is currently running. */
export function isRunning(): boolean {
  return p5Instance !== null;
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

/** Start/stop the p5 instance based on pipeline visibility and playing state. */
function syncLoop(): void {
  const { pipelineLayout } = getEditorState();
  const { playing, sketches, selectedSketchId } = getP5State();
  const p5El = document.getElementById("p5-node-content");
  const isFS = isFullWindow() && getFullWindowElement() === p5El;
  const shouldRun = (pipelineLayout.extended.includes("p5") || isFS) && playing;

  // Re-run if sketch selection changed while running
  const sketchChanged = selectedSketchId !== lastRunSketchId;

  if (shouldRun && (!p5Instance || sketchChanged)) {
    const sketch = sketches.find((s) => s.id === selectedSketchId);
    if (sketch) {
      lastRunSketchId = selectedSketchId;
      // Build params from sketch state
      const params: Record<string, unknown> = {};
      for (const param of sketch.params) {
        params[param.name] = param.value;
      }
      runSketch(sketch.source, params);
    }
  } else if (!shouldRun && p5Instance) {
    stopSketch();
    lastRunSketchId = null;
  }
}

// ---------------------------------------------------------------------------
// Dispose
// ---------------------------------------------------------------------------

/** Dispose of all resources. */
export function disposeP5Canvas(): void {
  stopSketch();
  resizeObserver?.disconnect();
  resizeObserver = null;
  runListeners = [];
  container = null;
}
