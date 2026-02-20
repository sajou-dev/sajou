import { describe, it, expect } from "vitest";
import {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  arc,
  getEasing,
} from "../src/choreographer/easing.js";

describe("easing functions", () => {
  describe("linear", () => {
    it("returns input unchanged", () => {
      expect(linear(0)).toBe(0);
      expect(linear(0.5)).toBe(0.5);
      expect(linear(1)).toBe(1);
    });
  });

  describe("easeIn", () => {
    it("starts slow and accelerates", () => {
      expect(easeIn(0)).toBe(0);
      expect(easeIn(1)).toBe(1);
      // At t=0.5, easeIn(0.5) = 0.25 — slower than linear
      expect(easeIn(0.5)).toBe(0.25);
      expect(easeIn(0.5)).toBeLessThan(0.5);
    });
  });

  describe("easeOut", () => {
    it("starts fast and decelerates", () => {
      expect(easeOut(0)).toBe(0);
      expect(easeOut(1)).toBe(1);
      // At t=0.5, easeOut(0.5) = 0.75 — faster than linear
      expect(easeOut(0.5)).toBe(0.75);
      expect(easeOut(0.5)).toBeGreaterThan(0.5);
    });
  });

  describe("easeInOut", () => {
    it("is symmetric — midpoint at 0.5", () => {
      expect(easeInOut(0)).toBe(0);
      expect(easeInOut(1)).toBe(1);
      expect(easeInOut(0.5)).toBe(0.5);
    });

    it("is slow at start and end, fast in middle", () => {
      expect(easeInOut(0.25)).toBeLessThan(0.25);
      expect(easeInOut(0.75)).toBeGreaterThan(0.75);
    });
  });

  describe("arc", () => {
    it("peaks at midpoint", () => {
      expect(arc(0)).toBe(0);
      expect(arc(0.5)).toBe(1);
      expect(arc(1)).toBe(0);
    });

    it("is symmetric", () => {
      expect(arc(0.25)).toBeCloseTo(arc(0.75), 10);
    });
  });

  describe("getEasing", () => {
    it("returns built-in functions by name", () => {
      expect(getEasing("linear")).toBe(linear);
      expect(getEasing("easeIn")).toBe(easeIn);
      expect(getEasing("easeOut")).toBe(easeOut);
      expect(getEasing("easeInOut")).toBe(easeInOut);
      expect(getEasing("arc")).toBe(arc);
    });

    it("returns undefined for unknown names", () => {
      expect(getEasing("bounce")).toBeUndefined();
      expect(getEasing("")).toBeUndefined();
    });
  });
});
