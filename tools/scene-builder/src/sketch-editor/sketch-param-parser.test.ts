/**
 * Tests for p5.js param annotation parser.
 */

import { describe, it, expect } from "vitest";
import { parseSketchSource } from "./sketch-param-parser.js";

describe("parseSketchSource", () => {
  it("parses a slider param with min/max", () => {
    const source = `// @param: speed, slider, min: 0.1, max: 5.0`;
    const { params } = parseSketchSource(source);

    expect(params).toHaveLength(1);
    expect(params[0].name).toBe("speed");
    expect(params[0].type).toBe("float");
    expect(params[0].control).toBe("slider");
    expect(params[0].min).toBe(0.1);
    expect(params[0].max).toBe(5.0);
    expect(params[0].value).toBeCloseTo(2.55);
  });

  it("parses a color param", () => {
    const source = `// @param: tint, color`;
    const { params } = parseSketchSource(source);

    expect(params).toHaveLength(1);
    expect(params[0].name).toBe("tint");
    expect(params[0].type).toBe("color");
    expect(params[0].control).toBe("color");
    expect(params[0].value).toEqual([1.0, 1.0, 1.0]);
  });

  it("parses a toggle param", () => {
    const source = `// @param: enable, toggle`;
    const { params } = parseSketchSource(source);

    expect(params).toHaveLength(1);
    expect(params[0].name).toBe("enable");
    expect(params[0].type).toBe("bool");
    expect(params[0].control).toBe("toggle");
    expect(params[0].value).toBe(false);
  });

  it("parses a vec2 (xy) param with range", () => {
    const source = `// @param: center, xy, min: 0.0, max: 1.0`;
    const { params } = parseSketchSource(source);

    expect(params).toHaveLength(1);
    expect(params[0].name).toBe("center");
    expect(params[0].type).toBe("vec2");
    expect(params[0].control).toBe("xy");
    expect(params[0].value).toEqual([0.5, 0.5]);
    expect(params[0].min).toBe(0.0);
    expect(params[0].max).toBe(1.0);
  });

  it("parses a step annotation", () => {
    const source = `// @param: count, slider, min: 1, max: 100, step: 1`;
    const { params } = parseSketchSource(source);

    expect(params).toHaveLength(1);
    expect(params[0].step).toBe(1);
  });

  it("parses multiple params", () => {
    const source = [
      "// @param: speed, slider, min: 0.1, max: 5.0",
      "// @param: color, color",
      "// @param: enable, toggle",
    ].join("\n");

    const { params } = parseSketchSource(source);
    expect(params).toHaveLength(3);
    expect(params[0].name).toBe("speed");
    expect(params[1].name).toBe("color");
    expect(params[2].name).toBe("enable");
  });

  it("ignores non-annotation lines", () => {
    const source = [
      "// This is a regular comment",
      "const x = 5;",
      "// @param: speed, slider, min: 0, max: 10",
      "function setup() {}",
    ].join("\n");

    const { params } = parseSketchSource(source);
    expect(params).toHaveLength(1);
    expect(params[0].name).toBe("speed");
  });

  it("parses @bind on the same line", () => {
    const source = `// @param: intensity, slider, min: 0, max: 1 @bind: intensity`;
    const { params } = parseSketchSource(source);

    expect(params).toHaveLength(1);
    expect(params[0].name).toBe("intensity");
    expect(params[0].bind).toEqual({ semantic: "intensity" });
  });

  it("parses @bind on the next line", () => {
    const source = [
      "// @param: scale, slider, min: 0.1, max: 10",
      "// @bind: scale",
    ].join("\n");

    const { params } = parseSketchSource(source);
    expect(params).toHaveLength(1);
    expect(params[0].bind).toEqual({ semantic: "scale" });
  });

  it("ignores invalid control types", () => {
    const source = `// @param: foo, unknown`;
    const { params } = parseSketchSource(source);
    expect(params).toHaveLength(0);
  });

  it("ignores annotations with no name", () => {
    const source = `// @param: slider`;
    const { params } = parseSketchSource(source);
    // "slider" is name, but there's no second part for control
    expect(params).toHaveLength(0);
  });

  it("returns empty for source with no annotations", () => {
    const source = `p.setup = function() { p.createCanvas(400, 400); };`;
    const { params } = parseSketchSource(source);
    expect(params).toHaveLength(0);
  });

  it("uses default min/max/step when not specified", () => {
    const source = `// @param: value, slider`;
    const { params } = parseSketchSource(source);

    expect(params).toHaveLength(1);
    expect(params[0].min).toBe(0);
    expect(params[0].max).toBe(1);
    expect(params[0].step).toBe(0.01);
  });
});
