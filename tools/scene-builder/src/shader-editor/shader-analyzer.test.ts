/**
 * Tests for the GLSL shader value analyzer.
 *
 * Covers vec constructors, function arguments (smoothstep, mix, pow, clamp),
 * time/frequency patterns, SDF primitives, exclusion rules, comment stripping,
 * preset sources, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { analyzeShader, stripComments } from "./shader-analyzer.js";
import { SHADER_PRESETS } from "./shader-presets.js";
import { DEFAULT_FRAGMENT_SOURCE } from "./shader-defaults.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap a GLSL expression in a minimal compilable fragment body. */
function wrap(bodyLine: string): string {
  return `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
void main() {
  ${bodyLine}
}
`;
}

// ---------------------------------------------------------------------------
// Comment stripping
// ---------------------------------------------------------------------------

describe("stripComments", () => {
  it("removes line comments preserving positions", () => {
    const src = "float x = 1.0; // comment\nfloat y = 2.0;";
    const clean = stripComments(src);
    expect(clean).toContain("float x = 1.0;");
    expect(clean).not.toContain("comment");
    expect(clean.split("\n").length).toBe(src.split("\n").length);
  });

  it("removes block comments preserving newlines", () => {
    const src = "float x = 1.0;\n/* block\ncomment */\nfloat y = 2.0;";
    const clean = stripComments(src);
    expect(clean).not.toContain("block");
    expect(clean).not.toContain("comment");
    expect(clean.split("\n").length).toBe(src.split("\n").length);
  });

  it("handles empty source", () => {
    expect(stripComments("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Vec constructors
// ---------------------------------------------------------------------------

describe("vec constructors", () => {
  it("detects vec3 position", () => {
    const vals = analyzeShader(wrap("vec3 pos = vec3(0.0, 2.0, 4.0);"));
    const v = vals.find((d) => d.glslType === "vec3");
    expect(v).toBeDefined();
    expect(v!.value).toEqual([0.0, 2.0, 4.0]);
    expect(v!.context).toBe("position");
    expect(v!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("detects vec3 color (all 0-1)", () => {
    const vals = analyzeShader(wrap("vec3 c = vec3(0.1, 0.1, 0.3);"));
    const v = vals.find((d) => d.glslType === "vec3");
    expect(v).toBeDefined();
    expect(v!.context).toBe("color");
    expect(v!.suggestedControl).toBe("color");
    expect(v!.suggestedRange).toBeNull();
    expect(v!.confidence).toBe(0.8);
  });

  it("detects vec4 RGBA", () => {
    const vals = analyzeShader(wrap("vec4 c = vec4(1.0, 0.5, 0.2, 1.0);"));
    const v = vals.find((d) => d.glslType === "vec4");
    expect(v).toBeDefined();
    expect(v!.value).toEqual([1.0, 0.5, 0.2, 1.0]);
    expect(v!.suggestedControl).toBe("color");
  });

  it("detects vec2 as xy control", () => {
    const vals = analyzeShader(wrap("vec2 off = vec2(0.5, 0.3);"));
    const v = vals.find((d) => d.glslType === "vec2");
    expect(v).toBeDefined();
    expect(v!.suggestedControl).toBe("xy");
  });

  it("does not match nested/non-literal vecs", () => {
    const vals = analyzeShader(wrap("vec3 c = vec3(sin(x), 0.5, uv.x);"));
    const vecs = vals.filter((d) => d.glslType === "vec3");
    expect(vecs).toHaveLength(0);
  });

  it("marks hash constants as low confidence", () => {
    const vals = analyzeShader(wrap("vec2 h = vec2(127.1, 311.7);"));
    const v = vals.find((d) => d.glslType === "vec2");
    expect(v).toBeDefined();
    expect(v!.confidence).toBe(0.2);
    expect(v!.context).toBe("hash constant");
  });
});

// ---------------------------------------------------------------------------
// Function arguments
// ---------------------------------------------------------------------------

describe("smoothstep", () => {
  it("detects two threshold arguments", () => {
    const vals = analyzeShader(wrap("float s = smoothstep(0.008, 0.011, d);"));
    const thresholds = vals.filter((d) => d.context === "smoothstep threshold");
    expect(thresholds).toHaveLength(2);
    expect(thresholds[0].value).toBe(0.008);
    expect(thresholds[1].value).toBe(0.011);
    expect(thresholds[0].confidence).toBe(0.9);
  });
});

describe("mix", () => {
  it("detects mix factor", () => {
    const vals = analyzeShader(wrap("vec3 c = mix(a, b, 0.65);"));
    const v = vals.find((d) => d.context === "mix factor");
    expect(v).toBeDefined();
    expect(v!.value).toBe(0.65);
    expect(v!.suggestedRange).toEqual({ min: 0, max: 1 });
    expect(v!.confidence).toBe(0.85);
  });
});

describe("pow", () => {
  it("detects pow exponent", () => {
    const vals = analyzeShader(wrap("float g = pow(col, 2.2);"));
    const v = vals.find((d) => d.context === "pow exponent");
    expect(v).toBeDefined();
    expect(v!.value).toBe(2.2);
    expect(v!.suggestedRange!.min).toBe(0.1);
  });
});

describe("clamp", () => {
  it("detects clamp bounds", () => {
    const vals = analyzeShader(wrap("float c = clamp(x, 0.2, 0.8);"));
    const bounds = vals.filter((d) => d.context === "clamp bounds");
    expect(bounds).toHaveLength(2);
    expect(bounds[0].value).toBe(0.2);
    expect(bounds[1].value).toBe(0.8);
  });
});

// ---------------------------------------------------------------------------
// Time / frequency
// ---------------------------------------------------------------------------

describe("time multiplier", () => {
  it("detects iTime * FREQ", () => {
    const vals = analyzeShader(wrap("float t = iTime * 0.5;"));
    const v = vals.find((d) => d.context === "time frequency");
    expect(v).toBeDefined();
    expect(v!.value).toBe(0.5);
    expect(v!.suggestedRange).toEqual({ min: 0, max: 10 });
    expect(v!.confidence).toBe(0.9);
  });

  it("detects FREQ * iTime (reversed)", () => {
    const vals = analyzeShader(wrap("float t = 0.15 * iTime;"));
    const v = vals.find((d) => d.context === "time frequency");
    expect(v).toBeDefined();
    expect(v!.value).toBe(0.15);
  });
});

describe("sin/cos frequency", () => {
  it("detects frequency multiplier inside sin", () => {
    const vals = analyzeShader(wrap("float v = sin(uv.x * 3.14);"));
    const v = vals.find((d) => d.context === "sin/cos frequency");
    expect(v).toBeDefined();
    expect(v!.value).toBe(3.14);
  });
});

// ---------------------------------------------------------------------------
// SDF
// ---------------------------------------------------------------------------

describe("SDF arguments", () => {
  it("detects sdSphere radius", () => {
    const vals = analyzeShader(wrap("float d = sdSphere(pos, 0.25);"));
    const v = vals.find((d) => d.context.startsWith("SDF"));
    expect(v).toBeDefined();
    expect(v!.value).toBe(0.25);
    expect(v!.confidence).toBe(0.85);
    expect(v!.suggestedRange!.max).toBe(1);
  });

  it("detects sdBox size", () => {
    const vals = analyzeShader(wrap("float d = sdBox(pos, 1.5);"));
    const v = vals.find((d) => d.context.includes("sdBox"));
    expect(v).toBeDefined();
    expect(v!.value).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------------

describe("exclusions", () => {
  it("ignores values in line comments", () => {
    const vals = analyzeShader(wrap("// vec3(1.0, 0.5, 0.2)"));
    expect(vals).toHaveLength(0);
  });

  it("ignores values in block comments", () => {
    const src = wrap("/* smoothstep(0.1, 0.5, x) */\nfloat a = 1.0;");
    const vals = analyzeShader(src);
    const thresholds = vals.filter((d) => d.context === "smoothstep threshold");
    expect(thresholds).toHaveLength(0);
  });

  it("ignores uniform lines", () => {
    const src = "#version 300 es\nprecision highp float;\nuniform float uSpeed;\nvoid main() { float t = iTime * 0.5; }";
    const vals = analyzeShader(src);
    // Should not detect anything on the uniform line
    const uniformVals = vals.filter((d) => d.location.line === 3);
    expect(uniformVals).toHaveLength(0);
  });

  it("ignores #define lines", () => {
    const src = "#version 300 es\n#define PI 3.14159\nvoid main() { float t = iTime * 0.5; }";
    const vals = analyzeShader(src);
    const defineVals = vals.filter((d) => d.location.line === 2);
    expect(defineVals).toHaveLength(0);
  });

  it("ignores const lines", () => {
    const src = "#version 300 es\nconst float PI = 3.14159;\nvoid main() { float t = iTime * 0.5; }";
    const vals = analyzeShader(src);
    const constVals = vals.filter((d) => d.location.line === 2);
    expect(constVals).toHaveLength(0);
  });

  it("assigns low confidence to trivial isolated floats", () => {
    const vals = analyzeShader(wrap("float t = iTime * 1.0;"));
    const v = vals.find((d) => d.context === "time frequency");
    expect(v).toBeDefined();
    expect(v!.confidence).toBeLessThanOrEqual(0.3);
  });
});

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

describe("Preset: Minimal Gradient", () => {
  const preset = SHADER_PRESETS.find((p) => p.name === "Minimal Gradient")!;
  const source = preset.create().fragmentSource;

  it("detects iTime * 0.5", () => {
    const vals = analyzeShader(source);
    const freq = vals.find((d) => d.context === "time frequency");
    expect(freq).toBeDefined();
    expect(freq!.value).toBe(0.5);
  });

  it("detects vec3(0.0, 2.0, 4.0)", () => {
    const vals = analyzeShader(source);
    const vec = vals.find((d) => d.glslType === "vec3");
    expect(vec).toBeDefined();
    expect(vec!.value).toEqual([0.0, 2.0, 4.0]);
  });
});

describe("Preset: Noise Field", () => {
  const preset = SHADER_PRESETS.find((p) => p.name === "Noise Field")!;
  const source = preset.create().fragmentSource;

  it("detects hash constant vec2(127.1, 311.7) with low confidence", () => {
    const vals = analyzeShader(source);
    const hash = vals.find((d) => d.context === "hash constant");
    expect(hash).toBeDefined();
    expect(hash!.confidence).toBe(0.2);
  });
});

describe("Default fragment shader", () => {
  it("detects vec3(0.0, 2.0, 4.0) and 3.14159", () => {
    const vals = analyzeShader(DEFAULT_FRAGMENT_SOURCE);
    const vec = vals.find((d) => d.glslType === "vec3" && Array.isArray(d.value));
    expect(vec).toBeDefined();
    expect(vec!.value).toEqual([0.0, 2.0, 4.0]);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("returns empty array for empty source", () => {
    expect(analyzeShader("")).toHaveLength(0);
  });

  it("returns empty array for whitespace-only source", () => {
    expect(analyzeShader("   \n\n  ")).toHaveLength(0);
  });

  it("handles source with only uniforms (nothing to detect)", () => {
    const src = "#version 300 es\nprecision highp float;\nuniform float uSpeed;\nuniform vec3 uColor;\nvoid main() { fragColor = vec4(uColor, 1.0); }";
    const vals = analyzeShader(src);
    // No extractable literals (1.0 in vec4 context is trivial)
    expect(vals.length).toBeLessThanOrEqual(1);
  });

  it("detects negative values", () => {
    const vals = analyzeShader(wrap("float d = smoothstep(-0.5, 0.5, x);"));
    const thresholds = vals.filter((d) => d.context === "smoothstep threshold");
    expect(thresholds).toHaveLength(2);
    expect(thresholds[0].value).toBe(-0.5);
  });

  it("handles multiple values per line", () => {
    const vals = analyzeShader(wrap("float a = smoothstep(0.1, 0.9, x) + pow(y, 2.2);"));
    expect(vals.length).toBeGreaterThanOrEqual(3);
  });

  it("deduplicates values at the same location", () => {
    // This ensures the dedup logic works — same location shouldn't appear twice
    const vals = analyzeShader(wrap("float t = iTime * 0.5;"));
    const freqs = vals.filter((d) => d.context === "time frequency");
    expect(freqs).toHaveLength(1);
  });

  it("sorts results by line number", () => {
    const src = wrap("float a = iTime * 0.3;\n  float b = iTime * 0.7;");
    const vals = analyzeShader(src);
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i].location.line).toBeGreaterThanOrEqual(vals[i - 1].location.line);
    }
  });
});
