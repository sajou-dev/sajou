/**
 * Tests for the entity visual JSON Schema validation.
 *
 * Uses ajv to validate sample configs against entity-visual.schema.json.
 * Verifies that valid configs pass and invalid configs are rejected
 * with appropriate errors.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("entity-visual.schema.json", () => {
  let validate: ReturnType<Ajv["compile"]>;

  beforeAll(() => {
    const schemaPath = resolve(__dirname, "../src/entity-visual.schema.json");
    const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
    const ajv = new Ajv2020({ allErrors: true });
    validate = ajv.compile(schema);
  });

  it("accepts a valid config with static and spritesheet states", () => {
    const config = {
      entities: {
        peon: {
          displayWidth: 64,
          displayHeight: 64,
          fallbackColor: "#4488ff",
          states: {
            idle: {
              type: "spritesheet",
              asset: "path/to/peon.png",
              frameSize: 192,
              frameCount: 6,
              frameRow: 0,
              fps: 10,
              loop: true,
            },
            run: {
              type: "spritesheet",
              asset: "path/to/peon.png",
              frameSize: 192,
              frameCount: 6,
              frameRow: 1,
              fps: 10,
              loop: true,
            },
          },
        },
        forge: {
          displayWidth: 64,
          displayHeight: 96,
          fallbackColor: "#8b4513",
          states: {
            idle: {
              type: "static",
              asset: "path/to/house.png",
            },
          },
        },
      },
    };

    const valid = validate(config);
    expect(valid).toBe(true);
  });

  it("accepts a static state with sourceRect", () => {
    const config = {
      entities: {
        pigeon: {
          displayWidth: 32,
          displayHeight: 32,
          fallbackColor: "#ffffff",
          states: {
            idle: {
              type: "static",
              asset: "path/to/arrow.png",
              sourceRect: { x: 0, y: 0, w: 64, h: 64 },
            },
          },
        },
      },
    };

    const valid = validate(config);
    expect(valid).toBe(true);
  });

  it("accepts the Citadel entity-visuals.json", () => {
    const citadelPath = resolve(
      __dirname,
      "../../theme-citadel/src/entity-visuals.json",
    );
    const citadel = JSON.parse(readFileSync(citadelPath, "utf-8"));
    const valid = validate(citadel);
    expect(valid).toBe(true);
  });

  it("rejects config missing displayWidth", () => {
    const config = {
      entities: {
        broken: {
          displayHeight: 64,
          fallbackColor: "#ff0000",
          states: {
            idle: { type: "static", asset: "test.png" },
          },
        },
      },
    };

    const valid = validate(config);
    expect(valid).toBe(false);
  });

  it("rejects config missing states", () => {
    const config = {
      entities: {
        broken: {
          displayWidth: 64,
          displayHeight: 64,
          fallbackColor: "#ff0000",
        },
      },
    };

    const valid = validate(config);
    expect(valid).toBe(false);
  });

  it("rejects state with missing asset", () => {
    const config = {
      entities: {
        broken: {
          displayWidth: 64,
          displayHeight: 64,
          fallbackColor: "#ff0000",
          states: {
            idle: { type: "static" },
          },
        },
      },
    };

    const valid = validate(config);
    expect(valid).toBe(false);
  });

  it("rejects invalid type value", () => {
    const config = {
      entities: {
        broken: {
          displayWidth: 64,
          displayHeight: 64,
          fallbackColor: "#ff0000",
          states: {
            idle: { type: "video", asset: "test.mp4" },
          },
        },
      },
    };

    const valid = validate(config);
    expect(valid).toBe(false);
  });

  it("rejects spritesheet without frameSize", () => {
    const config = {
      entities: {
        broken: {
          displayWidth: 64,
          displayHeight: 64,
          fallbackColor: "#ff0000",
          states: {
            idle: {
              type: "spritesheet",
              asset: "test.png",
              frameCount: 6,
              fps: 10,
            },
          },
        },
      },
    };

    const valid = validate(config);
    expect(valid).toBe(false);
  });

  it("rejects spritesheet without frameCount", () => {
    const config = {
      entities: {
        broken: {
          displayWidth: 64,
          displayHeight: 64,
          fallbackColor: "#ff0000",
          states: {
            idle: {
              type: "spritesheet",
              asset: "test.png",
              frameSize: 192,
              fps: 10,
            },
          },
        },
      },
    };

    const valid = validate(config);
    expect(valid).toBe(false);
  });

  it("rejects spritesheet without fps", () => {
    const config = {
      entities: {
        broken: {
          displayWidth: 64,
          displayHeight: 64,
          fallbackColor: "#ff0000",
          states: {
            idle: {
              type: "spritesheet",
              asset: "test.png",
              frameSize: 192,
              frameCount: 6,
            },
          },
        },
      },
    };

    const valid = validate(config);
    expect(valid).toBe(false);
  });

  it("rejects invalid fallbackColor format", () => {
    const config = {
      entities: {
        broken: {
          displayWidth: 64,
          displayHeight: 64,
          fallbackColor: "red",
          states: {
            idle: { type: "static", asset: "test.png" },
          },
        },
      },
    };

    const valid = validate(config);
    expect(valid).toBe(false);
  });
});
