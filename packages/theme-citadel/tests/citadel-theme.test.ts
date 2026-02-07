/**
 * Tests for the Citadel theme.
 *
 * Verifies that the theme contract is properly implemented,
 * entities are correctly defined, and the stub renderer works.
 */

import { describe, expect, it } from "vitest";
import { citadelTheme, citadelManifest, citadelEntities } from "@sajou/theme-citadel";
import type { EntityVisualConfig } from "@sajou/schema";
import citadelEntityVisuals from "../src/entity-visuals.json";

describe("citadelManifest", () => {
  it("should have correct identity", () => {
    expect(citadelManifest.id).toBe("citadel");
    expect(citadelManifest.name).toBe("Citadelle");
    expect(citadelManifest.version).toBe("0.1.0");
  });

  it("should declare supported visual types", () => {
    expect(citadelManifest.capabilities.visualTypes).toContain("sprite");
    expect(citadelManifest.capabilities.visualTypes).toContain("spritesheet");
    expect(citadelManifest.capabilities.visualTypes).toContain("particle");
    expect(citadelManifest.capabilities.sound).toBe(true);
    expect(citadelManifest.capabilities.perspective).toBe(false);
  });

  it("should define all expected entities", () => {
    const entityIds = Object.keys(citadelManifest.entities);
    expect(entityIds).toContain("peon");
    expect(entityIds).toContain("pigeon");
    expect(entityIds).toContain("forge");
    expect(entityIds).toContain("oracle");
    expect(entityIds).toContain("gold-coins");
    expect(entityIds).toContain("explosion");
  });

  it("should define scene layout with named positions", () => {
    const positions = Object.keys(citadelManifest.layout.positions);
    expect(positions).toContain("oracle");
    expect(positions).toContain("center");
    expect(positions).toContain("spawnPoint");
    expect(citadelManifest.layout.sceneWidth).toBe(800);
    expect(citadelManifest.layout.sceneHeight).toBe(600);
  });

  it("should list assets to preload", () => {
    expect(citadelManifest.assets.preload.length).toBeGreaterThan(0);
    expect(citadelManifest.assets.basePath).toBe("./assets");
  });
});

describe("citadelEntities", () => {
  it("peon should be a spritesheet with walk/idle/work/die animations", () => {
    const peon = citadelEntities["peon"];
    expect(peon).toBeDefined();
    expect(peon?.visual.type).toBe("spritesheet");

    if (peon?.visual.type === "spritesheet") {
      const animNames = Object.keys(peon.visual.animations);
      expect(animNames).toContain("idle");
      expect(animNames).toContain("walk");
      expect(animNames).toContain("work");
      expect(animNames).toContain("die");
    }
  });

  it("peon should have worker and agent tags", () => {
    const peon = citadelEntities["peon"];
    expect(peon?.tags).toContain("worker");
    expect(peon?.tags).toContain("agent");
  });

  it("pigeon should be a spritesheet with fly animation", () => {
    const pigeon = citadelEntities["pigeon"];
    expect(pigeon).toBeDefined();
    expect(pigeon?.visual.type).toBe("spritesheet");

    if (pigeon?.visual.type === "spritesheet") {
      expect(pigeon.visual.animations["fly"]).toBeDefined();
    }
  });

  it("explosion should be a particle system", () => {
    const explosion = citadelEntities["explosion"];
    expect(explosion).toBeDefined();
    expect(explosion?.visual.type).toBe("particle");

    if (explosion?.visual.type === "particle") {
      expect(explosion.visual.emitter.maxParticles).toBeGreaterThan(0);
    }
  });

  it("gold-coins should have cost tag", () => {
    const coins = citadelEntities["gold-coins"];
    expect(coins?.tags).toContain("cost");
    expect(coins?.visual.type).toBe("particle");
  });
});

describe("citadelEntityVisuals (entity-visuals.json)", () => {
  const config = citadelEntityVisuals as EntityVisualConfig;

  it("should have entries for all 6 manifest entities", () => {
    const manifestEntityIds = Object.keys(citadelManifest.entities);
    const visualEntityIds = Object.keys(config.entities);

    for (const id of manifestEntityIds) {
      expect(visualEntityIds).toContain(id);
    }
  });

  it("every entity should have an idle state", () => {
    for (const [id, entry] of Object.entries(config.entities)) {
      expect(entry.states["idle"], `entity '${id}' missing idle state`).toBeDefined();
    }
  });

  it("every entity should have valid display dimensions", () => {
    for (const [id, entry] of Object.entries(config.entities)) {
      expect(entry.displayWidth, `${id} displayWidth`).toBeGreaterThan(0);
      expect(entry.displayHeight, `${id} displayHeight`).toBeGreaterThan(0);
    }
  });

  it("every entity should have a valid fallback color", () => {
    for (const [id, entry] of Object.entries(config.entities)) {
      expect(entry.fallbackColor, `${id} fallbackColor`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("citadelTheme (ThemeContract)", () => {
  it("should expose the manifest", () => {
    expect(citadelTheme.manifest).toBe(citadelManifest);
  });

  it("should create a renderer", () => {
    const renderer = citadelTheme.createRenderer({
      container: null,
      width: 800,
      height: 600,
    });

    expect(renderer).toBeDefined();
    expect(typeof renderer.init).toBe("function");
    expect(typeof renderer.move).toBe("function");
    expect(typeof renderer.spawnEntity).toBe("function");
  });

  it("should spawn known entities via the stub renderer", () => {
    const renderer = citadelTheme.createRenderer({
      container: null,
      width: 800,
      height: 600,
    });

    const handle = renderer.spawnEntity("peon", { x: 100, y: 200 });
    expect(handle.instanceId).toMatch(/^peon-/);
    expect(handle.definition.id).toBe("peon");
  });

  it("should throw on unknown entity", () => {
    const renderer = citadelTheme.createRenderer({
      container: null,
      width: 800,
      height: 600,
    });

    expect(() => renderer.spawnEntity("dragon", { x: 0, y: 0 })).toThrow(
      "Unknown entity: dragon",
    );
  });

  it("should support full spawn → move → destroy lifecycle", async () => {
    const renderer = citadelTheme.createRenderer({
      container: null,
      width: 800,
      height: 600,
    });

    await renderer.init();

    const handle = renderer.spawnEntity("pigeon", { x: 100, y: 100 });
    await renderer.fly(handle, { x: 500, y: 80 }, 1200, "arc");
    renderer.destroyEntity(handle);

    renderer.dispose();
  });
});
