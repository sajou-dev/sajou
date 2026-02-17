/**
 * Standalone shader JSON export/import.
 *
 * Allows exporting and importing shader definitions independently
 * of the full scene ZIP. Useful for sharing individual shaders.
 */

import { getShaderState, addShader } from "./shader-state.js";
import type { ShaderDef } from "./shader-types.js";

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Export all shaders as a JSON file download. */
export function exportShaders(): void {
  const { shaders } = getShaderState();
  if (shaders.length === 0) return;

  const data = JSON.stringify({ version: 1, shaders }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "shaders.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Import shaders from a JSON file picker. Adds to existing shaders. */
export function importShaders(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.style.display = "none";

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(reader.result as string);
        if (typeof parsed !== "object" || parsed === null || !("shaders" in parsed)) {
          console.error("[shader-export] Invalid shaders.json format");
          return;
        }

        const imported = (parsed as { shaders: ShaderDef[] }).shaders;
        if (!Array.isArray(imported) || imported.length === 0) return;

        // Add each imported shader with a fresh ID to avoid collisions
        for (const shader of imported) {
          addShader({
            ...shader,
            id: crypto.randomUUID(),
            objects: shader.objects ?? [],
          });
        }
      } catch (err: unknown) {
        console.error("[shader-export] Failed to parse shaders.json:", err);
      }
    };
    reader.readAsText(file);

    document.body.removeChild(input);
  });

  input.addEventListener("cancel", () => {
    document.body.removeChild(input);
  });

  document.body.appendChild(input);
  input.click();
}
