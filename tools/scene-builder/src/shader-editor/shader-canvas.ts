/**
 * Shader preview canvas.
 *
 * Manages a dedicated Three.js WebGLRenderer for GLSL shader preview.
 * Renders a fullscreen quad with RawShaderMaterial (no Three.js prefix
 * injection — the shader source is compiled exactly as provided).
 * Auto-injects uniforms (iTime, iTimeDelta, iResolution, iMouse, iFrame)
 * via the UNIFORM_PREFIX block.
 *
 * Multi-pass ping-pong is handled by extending this module (commit 6).
 */

import * as THREE from "three";
import { UNIFORM_PREFIX, MULTIPASS_PREFIX, DEFAULT_VERTEX_SOURCE, DEFAULT_FRAGMENT_SOURCE } from "./shader-defaults.js";
import { getEditorState, subscribeEditor } from "../state/editor-state.js";
import { getShaderState, subscribeShaders } from "./shader-state.js";
import { isFullWindow, getFullWindowElement, onFullWindowChange } from "../utils/fullscreen.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of compiling a shader. */
export interface CompileResult {
  /** Whether compilation succeeded. */
  success: boolean;
  /** Error messages with line numbers (empty on success). */
  errors: CompileError[];
}

/** A single GLSL compilation error. */
export interface CompileError {
  /** 1-based line number in the user's source (after prefix adjustment). */
  line: number;
  /** Error message from the driver. */
  message: string;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;
let quad: THREE.Mesh | null = null;
let material: THREE.RawShaderMaterial | null = null;
let container: HTMLElement | null = null;
let resizeObserver: ResizeObserver | null = null;

let animFrameId = 0;
let startTime = 0;
let lastTime = 0;
let frameCount = 0;

let mouseX = 0;
let mouseY = 0;
let mouseDown = false;

/** Number of lines in the auto-injected prefix (for error line offset). */
let prefixLineCount = UNIFORM_PREFIX.split("\n").length - 1;

/** Listeners notified on compile result change. */
type CompileListener = (result: CompileResult) => void;
const compileListeners: CompileListener[] = [];

// Multi-pass state (initialized in commit 6)
let renderTargetA: THREE.WebGLRenderTarget | null = null;
let renderTargetB: THREE.WebGLRenderTarget | null = null;
let passCount = 1;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/** Initialize the shader preview renderer in the given container. */
export function initShaderCanvas(el: HTMLElement): void {
  container = el;

  renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(el.clientWidth, el.clientHeight);
  el.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const geometry = new THREE.PlaneGeometry(2, 2);

  material = new THREE.RawShaderMaterial({
    vertexShader: stripVersion(DEFAULT_VERTEX_SOURCE),
    fragmentShader: buildFragmentSource(DEFAULT_FRAGMENT_SOURCE),
    uniforms: createUniforms(),
    glslVersion: THREE.GLSL3,
  });

  quad = new THREE.Mesh(geometry, material);
  scene.add(quad);

  // Mouse tracking
  el.addEventListener("mousemove", onMouseMove);
  el.addEventListener("mousedown", () => { mouseDown = true; });
  el.addEventListener("mouseup", () => { mouseDown = false; });

  // Resize observer
  resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(el);

  // Subscribe to editor view changes to start/stop the loop
  subscribeEditor(syncLoop);
  subscribeShaders(syncLoop);
  onFullWindowChange(() => syncLoop());
  syncLoop();
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

/**
 * Strip `#version` directive from user source.
 * Three.js adds `#version 300 es` (via glslVersion = GLSL3) before its own
 * `#define` lines. A second `#version` anywhere else is a fatal GLSL error.
 */
function stripVersion(source: string): string {
  return source.replace(/^#version\s+\d+(\s+es)?\s*\n/, "");
}

/** Detect ShaderToy convention: has mainImage() but no void main(). */
const MAIN_IMAGE_RE = /void\s+mainImage\s*\(/;
const VOID_MAIN_RE = /void\s+main\s*\(/;

/** ShaderToy compatibility suffix — bridges mainImage to main. */
const SHADERTOY_SUFFIX = `
void main() {
  mainImage(fragColor, gl_FragCoord.xy);
}
`;

/** Build the final fragment source by prepending the uniform block. */
function buildFragmentSource(userFragment: string): string {
  let prefix = passCount >= 2
    ? UNIFORM_PREFIX + MULTIPASS_PREFIX
    : UNIFORM_PREFIX;

  // Strip #version — Three.js handles it via glslVersion: GLSL3
  const stripped = stripVersion(userFragment);

  const isShaderToy = MAIN_IMAGE_RE.test(stripped) && !VOID_MAIN_RE.test(stripped);

  let suffix = "";
  if (isShaderToy) {
    prefix += "out vec4 fragColor;\n";
    suffix = SHADERTOY_SUFFIX;
  }

  // Update prefix line count for error offset mapping
  prefixLineCount = prefix.split("\n").length - 1;

  return prefix + stripped + suffix;
}

/** Create the standard uniform object. */
function createUniforms(): Record<string, THREE.IUniform> {
  return {
    iTime: { value: 0.0 },
    iTimeDelta: { value: 0.0 },
    iResolution: { value: new THREE.Vector3(1, 1, 1) },
    iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
    iFrame: { value: 0 },
  };
}

/**
 * Compile new shader sources. Returns compilation result.
 * On success, the preview updates immediately.
 */
export function compile(vertexSource: string, fragmentSource: string, userUniforms?: Record<string, THREE.IUniform>): CompileResult {
  if (!renderer || !scene || !camera || !quad) {
    return { success: false, errors: [{ line: 0, message: "Renderer not initialized" }] };
  }

  const builtVertex = stripVersion(vertexSource);
  const builtFragment = buildFragmentSource(fragmentSource);

  const uniforms = createUniforms();

  // Merge user-defined uniforms
  if (userUniforms) {
    for (const [name, uniform] of Object.entries(userUniforms)) {
      uniforms[name] = uniform;
    }
  }

  // Multi-pass: add iChannel0 if passes > 1
  if (passCount >= 2 && renderTargetA) {
    uniforms["iChannel0"] = { value: renderTargetA.texture };
  }

  const prevMaterial = material;
  const newMaterial = new THREE.RawShaderMaterial({
    vertexShader: builtVertex,
    fragmentShader: builtFragment,
    uniforms,
    glslVersion: THREE.GLSL3,
  });

  // Assign to quad BEFORE compile so Three.js actually processes it
  quad.material = newMaterial;

  // Force compilation to check for errors
  renderer.compile(scene, camera);

  const gl = renderer.getContext();
  const props = renderer.properties.get(newMaterial) as { currentProgram?: { program: WebGLProgram } } | undefined;
  const program = props?.currentProgram;

  if (program) {
    const glProgram = program.program;
    if (glProgram) {
      const linked = gl.getProgramParameter(glProgram, gl.LINK_STATUS);
      if (!linked) {
        const infoLog = gl.getProgramInfoLog(glProgram) ?? "";
        const errors = parseGlslErrors(infoLog);
        const result: CompileResult = { success: false, errors };
        notifyCompileListeners(result);
        // Restore previous material
        newMaterial.dispose();
        if (prevMaterial) quad.material = prevMaterial;
        return result;
      }
    }
  }

  if (!program) {
    // Fallback: try to compile and check via raw WebGL
    const errors = tryRawCompile(gl, builtVertex, builtFragment);
    if (errors.length > 0) {
      const result: CompileResult = { success: false, errors };
      notifyCompileListeners(result);
      newMaterial.dispose();
      if (prevMaterial) quad.material = prevMaterial;
      return result;
    }
  }

  // Success — commit the new material
  if (prevMaterial) prevMaterial.dispose();
  material = newMaterial;

  // Reset ping-pong buffers on recompile
  resetRenderTargets();

  // Reset timing
  frameCount = 0;

  const result: CompileResult = { success: true, errors: [] };
  notifyCompileListeners(result);
  return result;
}

/** Try raw WebGL shader compilation to extract errors. */
function tryRawCompile(gl: WebGLRenderingContext | WebGL2RenderingContext, vertSrc: string, fragSrc: string): CompileError[] {
  const errors: CompileError[] = [];

  // Sources have #version stripped (Three.js adds it via glslVersion).
  // For raw WebGL compile we need to prepend it ourselves.
  const ver = "#version 300 es\n";

  const vs = gl.createShader(gl.VERTEX_SHADER);
  if (vs) {
    gl.shaderSource(vs, ver + vertSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(vs) ?? "";
      errors.push(...parseGlslErrors(log));
    }
    gl.deleteShader(vs);
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  if (fs) {
    gl.shaderSource(fs, ver + fragSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(fs) ?? "";
      errors.push(...parseGlslErrors(log));
    }
    gl.deleteShader(fs);
  }

  return errors;
}

/** Parse GLSL error log into structured errors with line offset correction. */
function parseGlslErrors(log: string): CompileError[] {
  const errors: CompileError[] = [];
  // Common GLSL error format: ERROR: 0:LINE: message
  const regex = /ERROR:\s*\d+:(\d+):\s*(.*)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(log)) !== null) {
    const rawLine = parseInt(match[1], 10);
    // Adjust for the injected uniform prefix
    const userLine = Math.max(1, rawLine - prefixLineCount);
    errors.push({ line: userLine, message: match[2].trim() });
  }

  // If no structured errors found, return the whole log as a single error
  if (errors.length === 0 && log.trim().length > 0) {
    errors.push({ line: 0, message: log.trim() });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Compile event subscriptions
// ---------------------------------------------------------------------------

/** Subscribe to compile result changes. */
export function onCompileResult(fn: CompileListener): () => void {
  compileListeners.push(fn);
  return () => {
    const idx = compileListeners.indexOf(fn);
    if (idx >= 0) compileListeners.splice(idx, 1);
  };
}

function notifyCompileListeners(result: CompileResult): void {
  for (const fn of compileListeners) fn(result);
}

// ---------------------------------------------------------------------------
// Uniform setters (called from uniforms panel)
// ---------------------------------------------------------------------------

/** Set a single uniform value on the current material. */
export function setUniform(name: string, value: number | boolean | number[] | THREE.Texture): void {
  if (!material) return;
  const u = material.uniforms[name];
  if (u) {
    u.value = value;
  } else {
    material.uniforms[name] = { value };
  }
}

// ---------------------------------------------------------------------------
// Multi-pass support
// ---------------------------------------------------------------------------

/** Configure multi-pass rendering. Call before compile(). */
export function setPassCount(count: number, bufferResolution?: number): void {
  passCount = Math.max(1, count);
  if (passCount >= 2) {
    initRenderTargets(bufferResolution);
  } else {
    disposeRenderTargets();
  }
}

/** Get current pass count. */
export function getPassCount(): number {
  return passCount;
}

function initRenderTargets(resolution?: number): void {
  disposeRenderTargets();

  const w = resolution || (container?.clientWidth ?? 512);
  const h = resolution || (container?.clientHeight ?? 512);

  const opts: THREE.RenderTargetOptions = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
  };

  renderTargetA = new THREE.WebGLRenderTarget(w, h, opts);
  renderTargetB = new THREE.WebGLRenderTarget(w, h, opts);
}

function disposeRenderTargets(): void {
  renderTargetA?.dispose();
  renderTargetB?.dispose();
  renderTargetA = null;
  renderTargetB = null;
}

function resetRenderTargets(): void {
  if (passCount >= 2) {
    const res = renderTargetA?.width;
    initRenderTargets(res);
  }
}

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------

function syncLoop(): void {
  const { pipelineLayout } = getEditorState();
  const { playing } = getShaderState();
  const shaderEl = document.getElementById("shader-node-content");
  const isFS = isFullWindow() && getFullWindowElement() === shaderEl;
  const shouldRun = (pipelineLayout.extended.includes("shader") || isFS) && playing;

  if (shouldRun && animFrameId === 0) {
    startTime = performance.now() / 1000;
    lastTime = startTime;
    animFrameId = requestAnimationFrame(tick);
  } else if (!shouldRun && animFrameId !== 0) {
    cancelAnimationFrame(animFrameId);
    animFrameId = 0;
  }
}

function tick(): void {
  if (!renderer || !scene || !camera || !material) {
    animFrameId = 0;
    return;
  }

  const now = performance.now() / 1000;
  const time = now - startTime;
  const delta = now - lastTime;
  lastTime = now;

  // Update auto-injected uniforms
  material.uniforms["iTime"].value = time;
  material.uniforms["iTimeDelta"].value = delta;
  material.uniforms["iFrame"].value = frameCount;

  const w = container?.clientWidth ?? 1;
  const h = container?.clientHeight ?? 1;
  material.uniforms["iResolution"].value.set(w * window.devicePixelRatio, h * window.devicePixelRatio, w / h);

  const mx = mouseX / w;
  const my = 1.0 - mouseY / h;
  material.uniforms["iMouse"].value.set(
    mx * w * window.devicePixelRatio,
    my * h * window.devicePixelRatio,
    mouseDown ? mx * w * window.devicePixelRatio : 0,
    mouseDown ? my * h * window.devicePixelRatio : 0,
  );

  // Render
  if (passCount >= 2 && renderTargetA && renderTargetB) {
    // Multi-pass: render to B using A as iChannel0, then swap
    material.uniforms["iChannel0"] = { value: renderTargetA.texture };
    renderer.setRenderTarget(renderTargetB);
    renderer.render(scene, camera);

    // Swap A ↔ B
    const tmp = renderTargetA;
    renderTargetA = renderTargetB;
    renderTargetB = tmp;

    // Final pass to screen
    renderer.setRenderTarget(null);
    material.uniforms["iChannel0"].value = renderTargetA.texture;
    renderer.render(scene, camera);
  } else {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  frameCount++;
  animFrameId = requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

function onResize(): void {
  if (!renderer || !container) return;

  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h);

  if (material) {
    material.uniforms["iResolution"].value.set(w * window.devicePixelRatio, h * window.devicePixelRatio, w / h);
  }
}

// ---------------------------------------------------------------------------
// Mouse
// ---------------------------------------------------------------------------

function onMouseMove(e: MouseEvent): void {
  if (!container) return;
  const rect = container.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
}

// ---------------------------------------------------------------------------
// Dispose
// ---------------------------------------------------------------------------

/** Dispose of all Three.js resources. */
export function disposeShaderCanvas(): void {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = 0;
  }

  resizeObserver?.disconnect();
  resizeObserver = null;

  material?.dispose();
  quad?.geometry.dispose();
  disposeRenderTargets();
  renderer?.dispose();

  if (renderer?.domElement.parentElement) {
    renderer.domElement.parentElement.removeChild(renderer.domElement);
  }

  renderer = null;
  scene = null;
  camera = null;
  quad = null;
  material = null;
  container = null;
}
