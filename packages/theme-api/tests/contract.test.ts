/**
 * Tests for the ThemeContract and ThemeManifest types.
 *
 * Verifies that the manifest structure, capabilities, and layout
 * types work as expected.
 */

import { describe, expect, it } from "vitest";
import type {
  ThemeContract,
  ThemeManifest,
  ThemeRenderer,
  RendererOptions,
  EntityHandle,
  Position,
} from "@sajou/theme-api";

/** Minimal stub renderer for type-checking purposes. */
function createStubRenderer(): ThemeRenderer {
  const resolvedPromise = Promise.resolve();
  return {
    init: () => resolvedPromise,
    dispose: () => undefined,
    tick: () => undefined,
    spawnEntity: (entityId: string, position: Position, instanceId?: string) => ({
      instanceId: instanceId ?? `${entityId}-1`,
      definition: {
        id: entityId,
        visual: { type: "sprite" as const, source: "stub.png" },
      },
    }),
    destroyEntity: () => undefined,
    move: () => resolvedPromise,
    fly: () => resolvedPromise,
    flash: () => resolvedPromise,
    pulse: () => resolvedPromise,
    drawBeam: () => resolvedPromise,
    typeText: () => resolvedPromise,
    playSound: () => undefined,
    setAnimation: () => undefined,
  };
}

describe("ThemeManifest", () => {
  const manifest: ThemeManifest = {
    id: "test-theme",
    name: "Test Theme",
    version: "0.1.0",
    description: "A minimal test theme",
    capabilities: {
      visualTypes: ["sprite", "spritesheet"],
      sound: false,
      perspective: false,
    },
    entities: {
      agent: {
        id: "agent",
        tags: ["unit"],
        visual: { type: "sprite", source: "agent.png" },
      },
    },
    layout: {
      positions: {
        center: { x: 400, y: 300 },
        forge: { x: 100, y: 500 },
      },
      sceneWidth: 800,
      sceneHeight: 600,
    },
    assets: {
      basePath: "./assets",
      preload: ["agent.png"],
    },
  };

  it("should have correct id and name", () => {
    expect(manifest.id).toBe("test-theme");
    expect(manifest.name).toBe("Test Theme");
  });

  it("should declare capabilities", () => {
    expect(manifest.capabilities.visualTypes).toContain("sprite");
    expect(manifest.capabilities.sound).toBe(false);
  });

  it("should define entities", () => {
    expect(manifest.entities["agent"]).toBeDefined();
    expect(manifest.entities["agent"]?.visual.type).toBe("sprite");
  });

  it("should define layout positions", () => {
    expect(manifest.layout.positions["center"]).toEqual({ x: 400, y: 300 });
    expect(manifest.layout.sceneWidth).toBe(800);
  });

  it("should define asset manifest", () => {
    expect(manifest.assets.basePath).toBe("./assets");
    expect(manifest.assets.preload).toContain("agent.png");
  });
});

describe("ThemeContract", () => {
  it("should combine manifest and renderer factory", () => {
    const theme: ThemeContract = {
      manifest: {
        id: "stub",
        name: "Stub",
        version: "0.0.0",
        description: "Stub theme for testing",
        capabilities: {
          visualTypes: ["sprite"],
          sound: false,
          perspective: false,
        },
        entities: {},
        layout: {
          positions: {},
          sceneWidth: 100,
          sceneHeight: 100,
        },
        assets: {
          basePath: ".",
          preload: [],
        },
      },
      createRenderer(_options: RendererOptions) {
        return createStubRenderer();
      },
    };

    expect(theme.manifest.id).toBe("stub");

    const renderer = theme.createRenderer({
      container: null,
      width: 800,
      height: 600,
    });

    expect(renderer).toBeDefined();
    expect(typeof renderer.init).toBe("function");
    expect(typeof renderer.spawnEntity).toBe("function");
    expect(typeof renderer.move).toBe("function");
  });

  it("should allow spawning and moving entities via renderer", async () => {
    const renderer = createStubRenderer();
    await renderer.init();

    const handle: EntityHandle = renderer.spawnEntity(
      "agent",
      { x: 100, y: 200 },
    );

    expect(handle.instanceId).toBe("agent-1");
    expect(handle.definition.id).toBe("agent");

    await renderer.move(handle, { x: 300, y: 400 }, 500, "ease-out");

    renderer.destroyEntity(handle);
    renderer.dispose();
  });
});
