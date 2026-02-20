import { describe, it, expect } from "vitest";
import { matchesWhen } from "../src/choreographer/index.js";
import type { PerformanceSignal, WhenClause } from "../src/choreographer/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sig(payload: Record<string, unknown>, type = "token_usage"): PerformanceSignal {
  return { type, payload };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("matchesWhen", () => {
  // =========================================================================
  // No when clause
  // =========================================================================

  describe("no when clause", () => {
    it("returns true when when is undefined", () => {
      expect(matchesWhen(undefined, sig({}))).toBe(true);
    });

    it("returns true when when is empty object", () => {
      expect(matchesWhen({}, sig({}))).toBe(true);
    });

    it("returns true when when is empty array", () => {
      expect(matchesWhen([], sig({}))).toBe(true);
    });
  });

  // =========================================================================
  // equals
  // =========================================================================

  describe("equals operator", () => {
    it("matches when value strictly equals operand", () => {
      const when: WhenClause = { "signal.model": { equals: "glm-4.7" } };
      expect(matchesWhen(when, sig({ model: "glm-4.7" }))).toBe(true);
    });

    it("does not match on type coercion", () => {
      const when: WhenClause = { "signal.count": { equals: "5" } };
      expect(matchesWhen(when, sig({ count: 5 }))).toBe(false);
    });

    it("does not match when field is missing", () => {
      const when: WhenClause = { "signal.model": { equals: "glm-4.7" } };
      expect(matchesWhen(when, sig({}))).toBe(false);
    });

    it("matches boolean values", () => {
      const when: WhenClause = { "signal.success": { equals: true } };
      expect(matchesWhen(when, sig({ success: true }))).toBe(true);
      expect(matchesWhen(when, sig({ success: false }))).toBe(false);
    });

    it("matches null", () => {
      const when: WhenClause = { "signal.result": { equals: null } };
      expect(matchesWhen(when, sig({ result: null }))).toBe(true);
      expect(matchesWhen(when, sig({ result: "x" }))).toBe(false);
    });
  });

  // =========================================================================
  // contains
  // =========================================================================

  describe("contains operator", () => {
    it("matches substring", () => {
      const when: WhenClause = { "signal.content": { contains: "amour" } };
      expect(matchesWhen(when, sig({ content: "je parle d'amour" }))).toBe(true);
    });

    it("is case-sensitive", () => {
      const when: WhenClause = { "signal.content": { contains: "Amour" } };
      expect(matchesWhen(when, sig({ content: "amour" }))).toBe(false);
    });

    it("returns false for non-string values", () => {
      const when: WhenClause = { "signal.count": { contains: "5" } };
      expect(matchesWhen(when, sig({ count: 5 }))).toBe(false);
    });

    it("returns false when substring not found", () => {
      const when: WhenClause = { "signal.content": { contains: "xyz" } };
      expect(matchesWhen(when, sig({ content: "hello world" }))).toBe(false);
    });

    it("matches empty string (always true for strings)", () => {
      const when: WhenClause = { "signal.content": { contains: "" } };
      expect(matchesWhen(when, sig({ content: "anything" }))).toBe(true);
    });
  });

  // =========================================================================
  // matches (regex)
  // =========================================================================

  describe("matches operator", () => {
    it("matches regex pattern", () => {
      const when: WhenClause = { "signal.content": { matches: "err?or" } };
      expect(matchesWhen(when, sig({ content: "an error occurred" }))).toBe(true);
      expect(matchesWhen(when, sig({ content: "an eror occurred" }))).toBe(true);
    });

    it("supports anchored patterns", () => {
      const when: WhenClause = { "signal.content": { matches: "^Error:" } };
      expect(matchesWhen(when, sig({ content: "Error: something" }))).toBe(true);
      expect(matchesWhen(when, sig({ content: "not Error: here" }))).toBe(false);
    });

    it("returns false for non-string values", () => {
      const when: WhenClause = { "signal.count": { matches: "\\d+" } };
      expect(matchesWhen(when, sig({ count: 42 }))).toBe(false);
    });

    it("returns false for invalid regex (does not throw)", () => {
      const when: WhenClause = { "signal.content": { matches: "[invalid" } };
      expect(matchesWhen(when, sig({ content: "test" }))).toBe(false);
    });
  });

  // =========================================================================
  // gt / lt
  // =========================================================================

  describe("gt / lt operators", () => {
    it("gt matches when value is greater", () => {
      const when: WhenClause = { "signal.tokens": { gt: 100 } };
      expect(matchesWhen(when, sig({ tokens: 101 }))).toBe(true);
    });

    it("gt does not match when equal", () => {
      const when: WhenClause = { "signal.tokens": { gt: 100 } };
      expect(matchesWhen(when, sig({ tokens: 100 }))).toBe(false);
    });

    it("lt matches when value is less", () => {
      const when: WhenClause = { "signal.tokens": { lt: 50 } };
      expect(matchesWhen(when, sig({ tokens: 49 }))).toBe(true);
    });

    it("lt does not match when equal", () => {
      const when: WhenClause = { "signal.tokens": { lt: 50 } };
      expect(matchesWhen(when, sig({ tokens: 50 }))).toBe(false);
    });

    it("returns false for non-number values", () => {
      const when: WhenClause = { "signal.tokens": { gt: 10 } };
      expect(matchesWhen(when, sig({ tokens: "20" }))).toBe(false);
    });

    it("gt and lt together form a range", () => {
      const when: WhenClause = { "signal.tokens": { gt: 10, lt: 100 } };
      expect(matchesWhen(when, sig({ tokens: 50 }))).toBe(true);
      expect(matchesWhen(when, sig({ tokens: 5 }))).toBe(false);
      expect(matchesWhen(when, sig({ tokens: 100 }))).toBe(false);
      expect(matchesWhen(when, sig({ tokens: 10 }))).toBe(false);
    });
  });

  // =========================================================================
  // exists
  // =========================================================================

  describe("exists operator", () => {
    it("matches when field exists", () => {
      const when: WhenClause = { "signal.content": { exists: true } };
      expect(matchesWhen(when, sig({ content: "hello" }))).toBe(true);
    });

    it("does not match when field is missing", () => {
      const when: WhenClause = { "signal.content": { exists: true } };
      expect(matchesWhen(when, sig({}))).toBe(false);
    });

    it("does not match when field is null", () => {
      const when: WhenClause = { "signal.content": { exists: true } };
      expect(matchesWhen(when, sig({ content: null }))).toBe(false);
    });

    it("does not match when field is undefined", () => {
      const when: WhenClause = { "signal.content": { exists: true } };
      expect(matchesWhen(when, sig({ content: undefined }))).toBe(false);
    });

    it("matches zero, empty string, false (they exist)", () => {
      const when: WhenClause = { "signal.val": { exists: true } };
      expect(matchesWhen(when, sig({ val: 0 }))).toBe(true);
      expect(matchesWhen(when, sig({ val: "" }))).toBe(true);
      expect(matchesWhen(when, sig({ val: false }))).toBe(true);
    });

    it("exists: false matches when field is missing", () => {
      const when: WhenClause = { "signal.content": { exists: false } };
      expect(matchesWhen(when, sig({}))).toBe(true);
      expect(matchesWhen(when, sig({ content: "x" }))).toBe(false);
    });
  });

  // =========================================================================
  // not
  // =========================================================================

  describe("not operator", () => {
    it("negates equals", () => {
      const when: WhenClause = { "signal.model": { not: { equals: "gpt-4" } } };
      expect(matchesWhen(when, sig({ model: "glm-4.7" }))).toBe(true);
      expect(matchesWhen(when, sig({ model: "gpt-4" }))).toBe(false);
    });

    it("negates contains", () => {
      const when: WhenClause = { "signal.content": { not: { contains: "error" } } };
      expect(matchesWhen(when, sig({ content: "all good" }))).toBe(true);
      expect(matchesWhen(when, sig({ content: "an error" }))).toBe(false);
    });

    it("negates exists", () => {
      const when: WhenClause = { "signal.content": { not: { exists: true } } };
      expect(matchesWhen(when, sig({}))).toBe(true);
      expect(matchesWhen(when, sig({ content: "x" }))).toBe(false);
    });
  });

  // =========================================================================
  // AND composition
  // =========================================================================

  describe("AND composition (object with multiple keys)", () => {
    it("requires all conditions to match", () => {
      const when: WhenClause = {
        "signal.content": { contains: "amour" },
        "signal.model": { equals: "glm-4.7" },
      };
      expect(matchesWhen(when, sig({ content: "l'amour", model: "glm-4.7" }))).toBe(true);
      expect(matchesWhen(when, sig({ content: "l'amour", model: "gpt-4" }))).toBe(false);
      expect(matchesWhen(when, sig({ content: "hello", model: "glm-4.7" }))).toBe(false);
    });
  });

  // =========================================================================
  // OR composition
  // =========================================================================

  describe("OR composition (array of conditions)", () => {
    it("matches when any condition is true", () => {
      const when: WhenClause = [
        { "signal.content": { contains: "amour" } },
        { "signal.content": { contains: "love" } },
      ];
      expect(matchesWhen(when, sig({ content: "l'amour" }))).toBe(true);
      expect(matchesWhen(when, sig({ content: "love story" }))).toBe(true);
      expect(matchesWhen(when, sig({ content: "hello" }))).toBe(false);
    });

    it("does not match when none are true", () => {
      const when: WhenClause = [
        { "signal.content": { contains: "foo" } },
        { "signal.content": { contains: "bar" } },
      ];
      expect(matchesWhen(when, sig({ content: "baz" }))).toBe(false);
    });
  });

  // =========================================================================
  // Nested signal paths
  // =========================================================================

  describe("nested signal paths", () => {
    it("resolves signal.type to envelope type", () => {
      const when: WhenClause = { "signal.type": { equals: "error" } };
      expect(matchesWhen(when, sig({}, "error"))).toBe(true);
      expect(matchesWhen(when, sig({}, "token_usage"))).toBe(false);
    });

    it("resolves deep payload paths", () => {
      const when: WhenClause = { "signal.nested.field": { equals: 42 } };
      expect(matchesWhen(when, sig({ nested: { field: 42 } }))).toBe(true);
      expect(matchesWhen(when, sig({ nested: { field: 99 } }))).toBe(false);
    });

    it("returns undefined for missing nested paths (no match)", () => {
      const when: WhenClause = { "signal.a.b.c": { equals: "x" } };
      expect(matchesWhen(when, sig({}))).toBe(false);
      expect(matchesWhen(when, sig({ a: {} }))).toBe(false);
    });
  });
});
