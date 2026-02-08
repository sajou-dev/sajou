/**
 * Tests for the entity visual config validator.
 *
 * Verifies that the lightweight structural validator catches
 * common configuration errors and reports helpful warnings.
 */

import { describe, it, expect } from "vitest";
import { validateEntityVisuals } from "../src/renderers/validate-entity-visuals.js";
import type { EntityVisualConfig } from "@sajou/schema";

/** Helper to create a minimal valid config. */
function validConfig(): EntityVisualConfig {
  return {
    entities: {
      peon: {
        displayWidth: 64,
        displayHeight: 64,
        fallbackColor: "#4488ff",
        states: {
          idle: {
            type: "spritesheet",
            asset: "peon.png",
            frameWidth: 192,
            frameHeight: 192,
            frameCount: 6,
            fps: 10,
          },
        },
      },
    },
  };
}

describe("validateEntityVisuals", () => {
  it("valid config returns no warnings", () => {
    const result = validateEntityVisuals(validConfig());
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns on missing displayWidth", () => {
    const config = validConfig();
    // Force invalid value via cast
    (config.entities["peon"] as Record<string, unknown>)["displayWidth"] = undefined;
    const result = validateEntityVisuals(config);
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes("displayWidth"))).toBe(true);
  });

  it("warns on missing displayHeight", () => {
    const config = validConfig();
    (config.entities["peon"] as Record<string, unknown>)["displayHeight"] = -1;
    const result = validateEntityVisuals(config);
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes("displayHeight"))).toBe(true);
  });

  it("warns on invalid fallbackColor", () => {
    const config = validConfig();
    (config.entities["peon"] as Record<string, unknown>)["fallbackColor"] = "blue";
    const result = validateEntityVisuals(config);
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes("fallbackColor"))).toBe(true);
  });

  it("warns on missing idle state", () => {
    const config: EntityVisualConfig = {
      entities: {
        peon: {
          displayWidth: 64,
          displayHeight: 64,
          fallbackColor: "#4488ff",
          states: {
            run: {
              type: "spritesheet",
              asset: "peon.png",
              frameWidth: 192,
              frameHeight: 192,
              frameCount: 6,
              fps: 10,
            },
          },
        },
      },
    };

    const result = validateEntityVisuals(config);
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes("idle"))).toBe(true);
  });

  it("warns on invalid state type", () => {
    const config = validConfig();
    (config.entities["peon"]!.states["idle"] as Record<string, unknown>)["type"] = "video";
    const result = validateEntityVisuals(config);
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes("type"))).toBe(true);
  });

  it("warns on spritesheet missing frameWidth", () => {
    const config = validConfig();
    (config.entities["peon"]!.states["idle"] as Record<string, unknown>)["frameWidth"] = undefined;
    const result = validateEntityVisuals(config);
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes("frameWidth"))).toBe(true);
  });

  it("warns on spritesheet missing frameHeight", () => {
    const config = validConfig();
    (config.entities["peon"]!.states["idle"] as Record<string, unknown>)["frameHeight"] = undefined;
    const result = validateEntityVisuals(config);
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes("frameHeight"))).toBe(true);
  });

  it("warns on spritesheet missing frameCount", () => {
    const config = validConfig();
    (config.entities["peon"]!.states["idle"] as Record<string, unknown>)["frameCount"] = 0;
    const result = validateEntityVisuals(config);
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes("frameCount"))).toBe(true);
  });

  it("warns on spritesheet missing fps", () => {
    const config = validConfig();
    (config.entities["peon"]!.states["idle"] as Record<string, unknown>)["fps"] = undefined;
    const result = validateEntityVisuals(config);
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes("fps"))).toBe(true);
  });

  it("warns on empty asset path", () => {
    const config = validConfig();
    (config.entities["peon"]!.states["idle"] as Record<string, unknown>)["asset"] = "";
    const result = validateEntityVisuals(config);
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes("asset"))).toBe(true);
  });

  it("validates the Citadel config without warnings", async () => {
    const { default: citadelConfig } = await import(
      "../src/entity-visuals.json"
    );
    const result = validateEntityVisuals(citadelConfig as EntityVisualConfig);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
