/**
 * Tests for the entity format types.
 *
 * These are compile-time type tests — they verify that the discriminated
 * union on `visual.type` narrows correctly and that entity definitions
 * conform to the expected shapes.
 */

import { describe, expect, it } from "vitest";
import type {
  EntityDefinition,
  EntityVisual,
  SpriteVisual,
  SpritesheetVisual,
  Model3dVisual,
  ParticleVisual,
} from "@sajou/theme-api";

describe("EntityDefinition", () => {
  it("should accept a static sprite entity", () => {
    const flag: EntityDefinition = {
      id: "flag",
      tags: ["decoration"],
      defaults: { scale: 1.0, anchor: [0.5, 1.0] },
      visual: {
        type: "sprite",
        source: "entities/flag.png",
      },
    };

    expect(flag.id).toBe("flag");
    expect(flag.visual.type).toBe("sprite");
  });

  it("should accept a spritesheet entity with animations", () => {
    const peon: EntityDefinition = {
      id: "peon",
      tags: ["unit", "worker"],
      defaults: { scale: 1.0, anchor: [0.5, 1.0], zIndex: 10 },
      visual: {
        type: "spritesheet",
        source: "entities/peon-sheet.png",
        frameWidth: 64,
        frameHeight: 64,
        animations: {
          idle: { frames: [0], fps: 1 },
          walk: { frames: [0, 1, 2, 3], fps: 12, loop: true },
          die: { frames: [4, 5, 6, 7], fps: 8, loop: false },
        },
      },
      sounds: {
        spawn: "sfx/peon-ready.ogg",
        die: "sfx/peon-death.ogg",
      },
    };

    expect(peon.id).toBe("peon");
    expect(peon.tags).toContain("worker");
    expect(peon.visual.type).toBe("spritesheet");
  });

  it("should accept a 3D model entity", () => {
    const fortress: EntityDefinition = {
      id: "fortress",
      tags: ["building", "structure"],
      defaults: { scale: 2.0, anchor: [0.5, 0.5], zIndex: 5 },
      visual: {
        type: "model3d",
        source: "models/fortress.glb",
        animations: {
          idle: { clip: "idle_loop" },
          build: { clip: "construction", loop: false },
          destroy: { clip: "collapse", loop: false },
        },
      },
      sounds: {
        spawn: "sfx/building-complete.ogg",
        destroy: "sfx/building-collapse.ogg",
      },
    };

    expect(fortress.id).toBe("fortress");
    expect(fortress.visual.type).toBe("model3d");
  });

  it("should accept a particle system entity", () => {
    const explosion: EntityDefinition = {
      id: "explosion",
      tags: ["effect", "vfx"],
      visual: {
        type: "particle",
        emitter: {
          maxParticles: 50,
          lifetime: 800,
          rate: 100,
          speed: [50, 200],
          scale: [0.5, 1.5],
          startColor: "#ff6600",
          endColor: "#ff000000",
          sprite: "particles/spark.png",
        },
      },
    };

    expect(explosion.id).toBe("explosion");
    expect(explosion.visual.type).toBe("particle");
  });

  it("should narrow visual type via discriminated union", () => {
    const entity: EntityDefinition = {
      id: "test",
      visual: {
        type: "spritesheet",
        source: "test.png",
        frameWidth: 32,
        frameHeight: 32,
        animations: {
          idle: { frames: [0], fps: 1 },
        },
      },
    };

    const visual: EntityVisual = entity.visual;

    switch (visual.type) {
      case "sprite": {
        const _narrowed: SpriteVisual = visual;
        expect(_narrowed.source).toBeDefined();
        break;
      }
      case "spritesheet": {
        const _narrowed: SpritesheetVisual = visual;
        expect(_narrowed.frameWidth).toBe(32);
        expect(_narrowed.animations["idle"]).toBeDefined();
        break;
      }
      case "model3d": {
        const _narrowed: Model3dVisual = visual;
        expect(_narrowed.source).toBeDefined();
        break;
      }
      case "particle": {
        const _narrowed: ParticleVisual = visual;
        expect(_narrowed.emitter).toBeDefined();
        break;
      }
    }
  });
});
