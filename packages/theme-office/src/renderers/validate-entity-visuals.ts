/**
 * Lightweight structural validator for entity visual configurations.
 *
 * Checks that the config has the expected shape without depending on
 * external validation libraries. Called during PixiCommandSink.init()
 * to warn about misconfigured entities before they cause silent failures.
 *
 * Does not throw — returns warnings so the renderer can fall back
 * to colored rectangles for broken entities.
 */

import type { EntityVisualConfig } from "@sajou/schema";

/** Result of validating an entity visual config. */
export interface ValidationResult {
  /** Whether all entities passed validation. */
  readonly valid: boolean;
  /** Human-readable warning messages for issues found. */
  readonly warnings: readonly string[];
}

/**
 * Validate an entity visual config for structural correctness.
 *
 * Checks:
 * - Every entity has `displayWidth`, `displayHeight`, `fallbackColor`, and `states`
 * - Every entity has at least an `"idle"` state
 * - Every state has `type` and `asset`
 * - Spritesheet states have `frameWidth`, `frameHeight`, `frameCount`, and `fps`
 *
 * @returns Validation result with warnings (empty if all valid)
 */
export function validateEntityVisuals(config: EntityVisualConfig): ValidationResult {
  const warnings: string[] = [];

  if (!config.entities || typeof config.entities !== "object") {
    return { valid: false, warnings: ["Config missing 'entities' object."] };
  }

  for (const [entityId, entry] of Object.entries(config.entities)) {
    // Check required top-level fields
    if (typeof entry.displayWidth !== "number" || entry.displayWidth <= 0) {
      warnings.push(`Entity '${entityId}': invalid or missing 'displayWidth'.`);
    }

    if (typeof entry.displayHeight !== "number" || entry.displayHeight <= 0) {
      warnings.push(`Entity '${entityId}': invalid or missing 'displayHeight'.`);
    }

    if (typeof entry.fallbackColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(entry.fallbackColor)) {
      warnings.push(`Entity '${entityId}': invalid or missing 'fallbackColor' (expected CSS hex like '#ff0000').`);
    }

    if (!entry.states || typeof entry.states !== "object") {
      warnings.push(`Entity '${entityId}': missing 'states' object.`);
      continue;
    }

    const stateNames = Object.keys(entry.states);
    if (stateNames.length === 0) {
      warnings.push(`Entity '${entityId}': 'states' must have at least one entry.`);
    }

    // Check for required idle state
    if (!entry.states["idle"]) {
      warnings.push(`Entity '${entityId}': missing required 'idle' state.`);
    }

    // Check each state
    for (const [stateName, state] of Object.entries(entry.states)) {
      if (!state.type || (state.type !== "static" && state.type !== "spritesheet")) {
        warnings.push(`Entity '${entityId}' state '${stateName}': invalid 'type' (expected 'static' or 'spritesheet').`);
      }

      if (typeof state.asset !== "string" || state.asset.length === 0) {
        warnings.push(`Entity '${entityId}' state '${stateName}': missing or empty 'asset' path.`);
      }

      if (state.type === "spritesheet") {
        if (typeof state.frameWidth !== "number" || state.frameWidth <= 0) {
          warnings.push(`Entity '${entityId}' state '${stateName}': spritesheet missing valid 'frameWidth'.`);
        }
        if (typeof state.frameHeight !== "number" || state.frameHeight <= 0) {
          warnings.push(`Entity '${entityId}' state '${stateName}': spritesheet missing valid 'frameHeight'.`);
        }
        if (typeof state.frameCount !== "number" || state.frameCount <= 0) {
          warnings.push(`Entity '${entityId}' state '${stateName}': spritesheet missing valid 'frameCount'.`);
        }
        if (typeof state.fps !== "number" || state.fps <= 0) {
          warnings.push(`Entity '${entityId}' state '${stateName}': spritesheet missing valid 'fps'.`);
        }
      }
    }
  }

  return { valid: warnings.length === 0, warnings };
}
