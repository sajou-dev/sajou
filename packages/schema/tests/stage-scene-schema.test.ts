import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv/dist/2020.js";

let validate: ReturnType<InstanceType<typeof Ajv>["compile"]>;

beforeAll(() => {
  const schemaPath = join(__dirname, "../src/stage-scene.schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  const ajv = new Ajv({ allErrors: true });
  validate = ajv.compile(schema);
});

// ---------------------------------------------------------------------------
// Valid scenes
// ---------------------------------------------------------------------------

describe("Valid stage scenes", () => {
  it("accepts a minimal scene with one zone", () => {
    const scene = {
      board: {
        projection: "isometric",
        zones: [{ id: "main", bounds: { x: 0, y: 0, w: 400, h: 300 } }],
      },
    };
    expect(validate(scene)).toBe(true);
  });

  it("accepts a full scene with all features", () => {
    const scene = {
      board: {
        projection: "isometric",
        angle: 45,
        zones: [
          {
            id: "forge",
            label: "La Forge",
            elevation: 0,
            bounds: { x: 0, y: 0, w: 400, h: 300 },
            ambiance: {
              lighting: "warm",
              particles: "embers",
              soundLoop: "anvil_ambient",
            },
            slots: [
              { id: "anvil", position: { x: 200, y: 150 }, role: "workstation" },
              { id: "forge-guard", position: { x: 350, y: 250 }, role: "standing" },
            ],
          },
          {
            id: "rampart",
            label: "Les Remparts",
            elevation: 2,
            bounds: { x: 400, y: -100, w: 300, h: 200 },
            ambiance: { lighting: "cold", particles: "wind", soundLoop: "wind_howl" },
            connections: [{ to: "forge", type: "stairs", path: "stairs_east" }],
          },
        ],
      },
      lighting: {
        global: {
          type: "directional",
          angle: 225,
          elevation: 45,
          color: "#FFE4B5",
          intensity: 0.6,
        },
        sources: [
          {
            id: "forge-fire",
            type: "point",
            position: { x: 180, y: 140 },
            color: "#FF6B35",
            intensity: 1.2,
            radius: 200,
            flicker: { speed: 3, amount: 0.15 },
          },
          {
            id: "torch-rampart",
            type: "point",
            position: { x: 500, y: -50 },
            color: "#E8A851",
            intensity: 0.8,
            radius: 120,
          },
        ],
      },
      particles: {
        embers: {
          emitter: "zone:forge",
          sprite: "assets/particles/ember.png",
          count: 30,
          lifetime: [1.0, 3.0],
          velocity: { x: [-10, 10], y: [-40, -20] },
          colorOverLife: ["#FF6B35", "#FF4500", "#00000000"],
          size: [2, 6],
          glow: true,
        },
        wind: {
          emitter: "zone:rampart",
          type: "directional",
          sprite: "assets/particles/dust.png",
          count: 15,
          lifetime: [0.5, 2.0],
          direction: { x: -1, y: 0.2 },
          speed: [20, 60],
        },
      },
      entities: [
        {
          id: "blacksmith-01",
          displayName: "Forge Master",
          rig: "humanoid",
          visual: {
            spritesheet: "assets/blacksmith_sheet.png",
            normalMap: "assets/blacksmith_normal.png",
            frameSize: [64, 64],
            animations: {
              idle: { frames: [0, 1, 2, 3], fps: 4, loop: true },
              work_standing: { frames: [4, 5, 6, 7, 8, 9], fps: 6, loop: true },
              walk: { frames: [10, 11, 12, 13, 14, 15], fps: 8, loop: true },
            },
          },
          interactions: [
            { type: "click", signal: "agent.inspect", label: "Inspecter" },
            {
              type: "context_menu",
              options: [
                { label: "Assigner tâche", signal: "agent.assign_task" },
                { label: "Déplacer", signal: "agent.move", mode: "drag_to_slot" },
              ],
            },
          ],
          slot: "anvil",
          state: "working",
        },
      ],
    };

    expect(validate(scene)).toBe(true);
  });

  it("accepts a top-down projection", () => {
    const scene = {
      board: {
        projection: "top-down",
        zones: [{ id: "room", bounds: { x: 0, y: 0, w: 800, h: 600 } }],
      },
    };
    expect(validate(scene)).toBe(true);
  });

  it("accepts a scene with only lighting (no particles, no entities)", () => {
    const scene = {
      board: {
        projection: "isometric",
        zones: [{ id: "plain", bounds: { x: 0, y: 0, w: 1000, h: 1000 } }],
      },
      lighting: {
        global: {
          type: "directional",
          angle: 180,
          elevation: 60,
          color: "#FFFFFF",
          intensity: 1.0,
        },
      },
    };
    expect(validate(scene)).toBe(true);
  });

  it("accepts an entity with minimal config", () => {
    const scene = {
      board: {
        projection: "isometric",
        zones: [{ id: "area", bounds: { x: 0, y: 0, w: 500, h: 500 } }],
      },
      entities: [
        {
          id: "unit-01",
          visual: {
            spritesheet: "assets/unit.png",
            frameSize: [32, 32],
            animations: { idle: { frames: [0], fps: 1 } },
          },
        },
      ],
    };
    expect(validate(scene)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid scenes
// ---------------------------------------------------------------------------

describe("Invalid stage scenes", () => {
  it("rejects a scene without board", () => {
    expect(validate({ lighting: {} })).toBe(false);
  });

  it("rejects a board without zones", () => {
    expect(validate({ board: { projection: "isometric" } })).toBe(false);
  });

  it("rejects a board with empty zones array", () => {
    expect(validate({ board: { projection: "isometric", zones: [] } })).toBe(false);
  });

  it("rejects an invalid projection type", () => {
    const scene = {
      board: {
        projection: "perspective",
        zones: [{ id: "a", bounds: { x: 0, y: 0, w: 100, h: 100 } }],
      },
    };
    expect(validate(scene)).toBe(false);
  });

  it("rejects a zone without bounds", () => {
    const scene = {
      board: {
        projection: "isometric",
        zones: [{ id: "no-bounds" }],
      },
    };
    expect(validate(scene)).toBe(false);
  });

  it("rejects a light source with invalid color format", () => {
    const scene = {
      board: {
        projection: "isometric",
        zones: [{ id: "a", bounds: { x: 0, y: 0, w: 100, h: 100 } }],
      },
      lighting: {
        sources: [
          {
            id: "bad",
            type: "point",
            position: { x: 0, y: 0 },
            color: "red",
            intensity: 1,
            radius: 100,
          },
        ],
      },
    };
    expect(validate(scene)).toBe(false);
  });

  it("rejects an entity without visual", () => {
    const scene = {
      board: {
        projection: "isometric",
        zones: [{ id: "a", bounds: { x: 0, y: 0, w: 100, h: 100 } }],
      },
      entities: [{ id: "no-visual" }],
    };
    expect(validate(scene)).toBe(false);
  });

  it("rejects an animation without frames", () => {
    const scene = {
      board: {
        projection: "isometric",
        zones: [{ id: "a", bounds: { x: 0, y: 0, w: 100, h: 100 } }],
      },
      entities: [
        {
          id: "bad-anim",
          visual: {
            spritesheet: "x.png",
            frameSize: [32, 32],
            animations: { idle: { fps: 4 } },
          },
        },
      ],
    };
    expect(validate(scene)).toBe(false);
  });

  it("rejects a connection with invalid type", () => {
    const scene = {
      board: {
        projection: "isometric",
        zones: [
          {
            id: "a",
            bounds: { x: 0, y: 0, w: 100, h: 100 },
            connections: [{ to: "b", type: "teleport" }],
          },
        ],
      },
    };
    expect(validate(scene)).toBe(false);
  });

  it("rejects additional properties on top-level", () => {
    const scene = {
      board: {
        projection: "isometric",
        zones: [{ id: "a", bounds: { x: 0, y: 0, w: 100, h: 100 } }],
      },
      unknown: true,
    };
    expect(validate(scene)).toBe(false);
  });
});
