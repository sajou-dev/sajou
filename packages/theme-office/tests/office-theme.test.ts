/**
 * Tests for the Office theme.
 *
 * Verifies that the theme contract is properly implemented,
 * entities are correctly defined, and the stub renderer works.
 */

import { describe, expect, it } from "vitest";
import { officeTheme, officeManifest, officeEntities } from "@sajou/theme-office";
import type { EntityVisualConfig } from "@sajou/schema";
import officeEntityVisuals from "../src/entity-visuals.json";

describe("officeManifest", () => {
  it("should have correct identity", () => {
    expect(officeManifest.id).toBe("office");
    expect(officeManifest.name).toBe("Modern Office");
    expect(officeManifest.version).toBe("0.1.0");
  });

  it("should declare supported visual types", () => {
    expect(officeManifest.capabilities.visualTypes).toContain("sprite");
    expect(officeManifest.capabilities.visualTypes).toContain("spritesheet");
    expect(officeManifest.capabilities.visualTypes).toContain("particle");
    expect(officeManifest.capabilities.sound).toBe(true);
    expect(officeManifest.capabilities.perspective).toBe(false);
  });

  it("should define all expected entities", () => {
    const entityIds = Object.keys(officeManifest.entities);
    expect(entityIds).toContain("worker");
    expect(entityIds).toContain("email");
    expect(entityIds).toContain("server-rack");
    expect(entityIds).toContain("manager-desk");
    expect(entityIds).toContain("invoice");
    expect(entityIds).toContain("crash");
  });

  it("should define scene layout with named positions", () => {
    const positions = Object.keys(officeManifest.layout.positions);
    expect(positions).toContain("managerDesk");
    expect(positions).toContain("serverLeft");
    expect(positions).toContain("serverRight");
    expect(positions).toContain("openSpace");
    expect(positions).toContain("entrance");
    expect(positions).toContain("accounts");
    expect(officeManifest.layout.sceneWidth).toBe(800);
    expect(officeManifest.layout.sceneHeight).toBe(600);
  });

  it("should list assets to preload", () => {
    expect(officeManifest.assets.preload.length).toBeGreaterThan(0);
    expect(officeManifest.assets.basePath).toBe("./assets");
  });
});

describe("officeEntities", () => {
  it("worker should be a spritesheet with idle and walk animations", () => {
    const worker = officeEntities["worker"];
    expect(worker).toBeDefined();
    expect(worker?.visual.type).toBe("spritesheet");

    if (worker?.visual.type === "spritesheet") {
      const animNames = Object.keys(worker.visual.animations);
      expect(animNames).toContain("idle");
      expect(animNames).toContain("walk");
    }
  });

  it("worker should have worker and agent tags", () => {
    const worker = officeEntities["worker"];
    expect(worker?.tags).toContain("worker");
    expect(worker?.tags).toContain("agent");
  });

  it("email should be a sprite entity", () => {
    const email = officeEntities["email"];
    expect(email).toBeDefined();
    expect(email?.visual.type).toBe("sprite");
  });

  it("crash should be a particle system", () => {
    const crash = officeEntities["crash"];
    expect(crash).toBeDefined();
    expect(crash?.visual.type).toBe("particle");

    if (crash?.visual.type === "particle") {
      expect(crash.visual.emitter.maxParticles).toBeGreaterThan(0);
    }
  });

  it("invoice should have cost tag", () => {
    const invoice = officeEntities["invoice"];
    expect(invoice?.tags).toContain("cost");
    expect(invoice?.visual.type).toBe("particle");
  });
});

describe("officeEntityVisuals (entity-visuals.json)", () => {
  const config = officeEntityVisuals as EntityVisualConfig;

  it("should have entries for all 6 manifest entities", () => {
    const manifestEntityIds = Object.keys(officeManifest.entities);
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

describe("officeTheme (ThemeContract)", () => {
  it("should expose the manifest", () => {
    expect(officeTheme.manifest).toBe(officeManifest);
  });

  it("should create a renderer", () => {
    const renderer = officeTheme.createRenderer({
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
    const renderer = officeTheme.createRenderer({
      container: null,
      width: 800,
      height: 600,
    });

    const handle = renderer.spawnEntity("worker", { x: 100, y: 200 });
    expect(handle.instanceId).toMatch(/^worker-/);
    expect(handle.definition.id).toBe("worker");
  });

  it("should throw on unknown entity", () => {
    const renderer = officeTheme.createRenderer({
      container: null,
      width: 800,
      height: 600,
    });

    expect(() => renderer.spawnEntity("dragon", { x: 0, y: 0 })).toThrow(
      "Unknown entity: dragon",
    );
  });

  it("should support full spawn -> move -> destroy lifecycle", async () => {
    const renderer = officeTheme.createRenderer({
      container: null,
      width: 800,
      height: 600,
    });

    await renderer.init();

    const handle = renderer.spawnEntity("email", { x: 100, y: 100 });
    await renderer.fly(handle, { x: 500, y: 80 }, 1200, "arc");
    renderer.destroyEntity(handle);

    renderer.dispose();
  });
});
