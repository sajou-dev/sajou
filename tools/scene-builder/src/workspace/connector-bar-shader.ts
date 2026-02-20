/**
 * Shader connector bar — visual → shader rail.
 *
 * Mounts uniform badges inside the rail separator (#rail-visual-shader).
 * Each badge represents a user-defined uniform from the selected shader.
 *
 * Wired section (top): uniforms that have a choreo→shader wire.
 * Unwired section (bottom): uniforms without a wire.
 *
 * Auto-injected uniforms (iTime, iResolution, etc.) are excluded.
 */

import {
  getShaderState,
  subscribeShaders,
} from "../shader-editor/shader-state.js";
import { AUTO_UNIFORMS } from "../shader-editor/shader-defaults.js";
import { subscribeWiring } from "../state/wiring-state.js";
import { getShaderBindings } from "../state/wiring-queries.js";
import type { ShaderUniformDef } from "../shader-editor/shader-types.js";

// ---------------------------------------------------------------------------
// Dot color by GLSL type
// ---------------------------------------------------------------------------

const UNIFORM_TYPE_COLORS: Record<string, string> = {
  float: "#E8A851",   // amber
  vec2:  "#2DD4BF",   // teal
  vec3:  "#2DD4BF",
  vec4:  "#2DD4BF",
  bool:  "#6E6E8A",   // grey
  int:   "#60A5FA",   // blue
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** Wired uniforms (above). */
let wiredEl: HTMLElement | null = null;
/** Unwired uniforms (below). */
let unwiredEl: HTMLElement | null = null;
let initialized = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Initialize the shader connector bar inside the visual→shader rail. */
export function initConnectorBarShader(): void {
  if (initialized) return;
  initialized = true;

  const rail = document.getElementById("rail-visual-shader");
  if (!rail) return;

  const badgesContainer = rail.querySelector(".pl-rail-badges");

  // Wired section — above badges
  wiredEl = document.createElement("div");
  wiredEl.className = "pl-rail-sources";

  // Unwired section — below badges
  unwiredEl = document.createElement("div");
  unwiredEl.className = "pl-rail-sources pl-rail-sources--inactive";

  if (badgesContainer) {
    rail.insertBefore(wiredEl, badgesContainer);
    if (badgesContainer.nextSibling) {
      rail.insertBefore(unwiredEl, badgesContainer.nextSibling);
    } else {
      rail.appendChild(unwiredEl);
    }
  } else {
    rail.appendChild(wiredEl);
    rail.appendChild(unwiredEl);
  }

  subscribeShaders(render);
  subscribeWiring(render);
  render();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  if (!wiredEl || !unwiredEl) return;

  const { shaders, selectedShaderId } = getShaderState();
  const shader = shaders.find((s) => s.id === selectedShaderId);

  // No selected shader → hide both sections
  if (!shader) {
    wiredEl.innerHTML = "";
    wiredEl.style.display = "none";
    unwiredEl.innerHTML = "";
    unwiredEl.style.display = "none";
    return;
  }

  // Filter out auto-injected uniforms
  const userUniforms = shader.uniforms.filter((u) => !AUTO_UNIFORMS.has(u.name));

  // Build set of wired uniform keys (format: shaderId:uniformName)
  const shaderBindings = getShaderBindings();
  const wiredIds = new Set(shaderBindings.map((w) => w.toId));

  const wiredUniforms: ShaderUniformDef[] = [];
  const unwiredUniforms: ShaderUniformDef[] = [];

  for (const u of userUniforms) {
    const wireId = `${shader.id}:${u.name}`;
    if (wiredIds.has(wireId)) {
      wiredUniforms.push(u);
    } else {
      unwiredUniforms.push(u);
    }
  }

  // Wired (above, active)
  wiredEl.innerHTML = "";
  wiredEl.style.display = wiredUniforms.length === 0 ? "none" : "";
  for (const u of wiredUniforms) {
    wiredEl.appendChild(createUniformBadge(shader.id, u, true));
  }

  // Unwired (below)
  unwiredEl.innerHTML = "";
  unwiredEl.style.display = unwiredUniforms.length === 0 ? "none" : "";
  for (const u of unwiredUniforms) {
    unwiredEl.appendChild(createUniformBadge(shader.id, u, false));
  }
}

// ---------------------------------------------------------------------------
// Badge creation
// ---------------------------------------------------------------------------

/** Create a uniform badge element. */
function createUniformBadge(
  shaderId: string,
  uniform: ShaderUniformDef,
  wired: boolean,
): HTMLElement {
  const badge = document.createElement("div");
  badge.className = "pl-rail-badge";

  // Data attributes for the drag-connect system
  badge.dataset.wireZone = "shader";
  badge.dataset.wireId = `${shaderId}:${uniform.name}`;

  if (wired) {
    badge.classList.add("pl-rail-badge--active");
  } else {
    badge.classList.add("pl-rail-badge--unbound");
  }

  // Dot colored by GLSL type
  const dot = document.createElement("span");
  dot.className = "pl-rail-badge-dot";
  dot.style.background = UNIFORM_TYPE_COLORS[uniform.type] ?? "#6E6E8A";
  badge.appendChild(dot);

  // Label
  const label = document.createElement("span");
  label.className = "pl-rail-badge-label";
  label.textContent = uniform.name;
  badge.appendChild(label);

  badge.title = `${uniform.name} (${uniform.type})${wired ? " — wired" : " — drop choreo action here"}`;

  return badge;
}
