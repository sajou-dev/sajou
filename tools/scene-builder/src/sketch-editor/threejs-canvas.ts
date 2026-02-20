/**
 * Three.js sketch runtime for the sketch editor.
 *
 * Parallel to the p5 runtime: manages a WebGLRenderer + Scene + Camera,
 * executes user code with setup(ctx)/draw(ctx, state) API,
 * and injects the sajou params bridge.
 */

import * as THREE from "three";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context passed to user setup() and draw() functions. */
export interface ThreejsContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  sajou: Record<string, unknown>;
  THREE: typeof THREE;
}

/** Result of running a Three.js sketch. */
export interface ThreejsRunResult {
  success: boolean;
  error: string;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let container: HTMLElement | null = null;
let animFrameId = 0;
let sajouBridge: Record<string, unknown> = {};
let userState: unknown = null;
let userDrawFn: ((ctx: ThreejsContext, state: unknown) => void) | null = null;
let startTime = 0;
let lastTime = 0;
let resizeObserver: ResizeObserver | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize the Three.js runtime in a container element. */
export function initThreejsCanvas(el: HTMLElement): void {
  container = el;
}

/** Run a Three.js sketch from source code. */
export function runThreejsScript(
  source: string,
  params: Record<string, unknown>,
): ThreejsRunResult {
  stopThreejsScript();

  if (!container) {
    return { success: false, error: "Container not initialized" };
  }

  const w = container.clientWidth || 400;
  const h = container.clientHeight || 300;

  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // Create scene & camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07070c);
  camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
  camera.position.set(0, 2, 5);
  camera.lookAt(0, 0, 0);

  // Build sajou bridge
  sajouBridge = {
    ...params,
    _width: w,
    _height: h,
    _time: 0,
    _deltaTime: 0,
    _mouse: { x: 0, y: 0 },
  };

  // Build context
  const ctx: ThreejsContext = {
    scene,
    camera,
    renderer,
    sajou: sajouBridge,
    THREE,
  };

  // Parse and run user code
  try {
    const mod = parseUserCode(source);
    if (mod.setup) {
      userState = mod.setup(ctx);
    }
    userDrawFn = mod.draw ?? null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    stopThreejsScript();
    return { success: false, error: message };
  }

  // Resize observer
  resizeObserver = new ResizeObserver(() => {
    if (!renderer || !camera || !container) return;
    const rw = container.clientWidth || 400;
    const rh = container.clientHeight || 300;
    renderer.setSize(rw, rh);
    camera.aspect = rw / rh;
    camera.updateProjectionMatrix();
    sajouBridge._width = rw;
    sajouBridge._height = rh;
  });
  resizeObserver.observe(container);

  // Mouse tracking
  renderer.domElement.addEventListener("mousemove", onMouseMove);

  // Start loop
  startTime = performance.now();
  lastTime = startTime;
  animFrameId = requestAnimationFrame(tick);

  return { success: true, error: "" };
}

/** Stop the running Three.js sketch and clean up. */
export function stopThreejsScript(): void {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = 0;
  }
  resizeObserver?.disconnect();
  resizeObserver = null;
  userDrawFn = null;
  userState = null;

  if (renderer) {
    renderer.domElement.removeEventListener("mousemove", onMouseMove);
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null;
  }
  if (scene) {
    // Dispose scene objects
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    scene = null;
  }
  camera = null;
}

/** Set a single param value on the running instance. */
export function setThreejsParam(name: string, value: unknown): void {
  sajouBridge[name] = value;
}

/** Check if a Three.js sketch is currently running. */
export function isThreejsRunning(): boolean {
  return renderer !== null;
}

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

function tick(): void {
  if (!renderer || !scene || !camera) return;

  const now = performance.now();
  sajouBridge._time = (now - startTime) / 1000;
  sajouBridge._deltaTime = (now - lastTime) / 1000;
  lastTime = now;

  if (userDrawFn && scene && camera) {
    try {
      const ctx: ThreejsContext = {
        scene,
        camera,
        renderer: renderer!,
        sajou: sajouBridge,
        THREE,
      };
      userDrawFn(ctx, userState);
    } catch (err: unknown) {
      console.error("[threejs-canvas] draw() error:", err);
    }
  }

  renderer.render(scene, camera);
  animFrameId = requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Mouse tracking
// ---------------------------------------------------------------------------

function onMouseMove(e: MouseEvent): void {
  if (!renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  sajouBridge._mouse = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

// ---------------------------------------------------------------------------
// User code parsing
// ---------------------------------------------------------------------------

interface UserModule {
  setup?: (ctx: ThreejsContext) => unknown;
  draw?: (ctx: ThreejsContext, state: unknown) => void;
}

/** Parse user source into setup/draw functions. */
function parseUserCode(source: string): UserModule {
  // The user code defines setup(ctx) and draw(ctx, state) as top-level functions.
  // We wrap it so they're captured.
  const wrapped = `
    ${source}
    return {
      setup: typeof setup === 'function' ? setup : undefined,
      draw: typeof draw === 'function' ? draw : undefined,
    };
  `;
  const factory = new Function(wrapped);
  return factory() as UserModule;
}
