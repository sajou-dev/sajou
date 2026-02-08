/**
 * Tests for the Office entity visual config validator.
 *
 * Verifies that the Office entity-visuals.json passes validation
 * and that the validator catches common configuration errors.
 */

import { describe, it, expect } from "vitest";
import { validateEntityVisuals } from "../src/renderers/validate-entity-visuals.js";
import type { EntityVisualConfig } from "@sajou/schema";

/** Helper to create a minimal valid config. */
function validConfig(): EntityVisualConfig {
  return {
    entities: {
      worker: {
        displayWidth: 48,
        displayHeight: 72,
        fallbackColor: "#4488ff",
        states: {
          idle: {
            type: "static",
            asset: "characters/worker.png",
          },
        },
      },
    },
  };
}

describe("validateEntityVisuals (Office)", () => {
  it("valid config returns no warnings", () => {
    const result = validateEntityVisuals(validConfig());
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns on missing idle state", () => {
    const config: EntityVisualConfig = {
      entities: {
        worker: {
          displayWidth: 48,
          displayHeight: 72,
          fallbackColor: "#4488ff",
          states: {
            walk: {
              type: "static",
              asset: "characters/worker-walk.png",
            },
          },
        },
      },
    };

    const result = validateEntityVisuals(config);
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes("idle"))).toBe(true);
  });

  it("validates the Office config without warnings", async () => {
    const { default: officeConfig } = await import(
      "../src/entity-visuals.json"
    );
    const result = validateEntityVisuals(officeConfig as EntityVisualConfig);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
