import { describe, it, expect } from "vitest";
import { shouldSuppressShortcut, SHORTCUTS } from "./shortcut-registry.js";

// ---------------------------------------------------------------------------
// Helpers — build minimal mock targets without requiring jsdom
// ---------------------------------------------------------------------------

/** Create a fake HTMLElement-like object with the given tagName. */
function mockTarget(tagName: string, opts?: { isContentEditable?: boolean; closestCmEditor?: boolean }): HTMLElement {
  const el = {
    tagName,
    isContentEditable: opts?.isContentEditable ?? false,
    closest(selector: string): HTMLElement | null {
      if (selector === ".cm-editor" && opts?.closestCmEditor) return el as unknown as HTMLElement;
      return null;
    },
  } as unknown as HTMLElement;
  return el;
}

/** Create a fake KeyboardEvent with the given target. */
function fakeEvent(target: HTMLElement): KeyboardEvent {
  return { target } as unknown as KeyboardEvent;
}

// ---------------------------------------------------------------------------
// shouldSuppressShortcut
// ---------------------------------------------------------------------------

describe("shouldSuppressShortcut", () => {
  it("suppresses when target is an INPUT", () => {
    expect(shouldSuppressShortcut(fakeEvent(mockTarget("INPUT")))).toBe(true);
  });

  it("suppresses when target is a TEXTAREA", () => {
    expect(shouldSuppressShortcut(fakeEvent(mockTarget("TEXTAREA")))).toBe(true);
  });

  it("suppresses when target is a SELECT", () => {
    expect(shouldSuppressShortcut(fakeEvent(mockTarget("SELECT")))).toBe(true);
  });

  it("suppresses when target is contentEditable", () => {
    expect(shouldSuppressShortcut(fakeEvent(mockTarget("DIV", { isContentEditable: true })))).toBe(true);
  });

  it("suppresses when target is inside a .cm-editor", () => {
    expect(shouldSuppressShortcut(fakeEvent(mockTarget("DIV", { closestCmEditor: true })))).toBe(true);
  });

  it("does NOT suppress for a regular div", () => {
    expect(shouldSuppressShortcut(fakeEvent(mockTarget("DIV")))).toBe(false);
  });

  it("does NOT suppress for a button", () => {
    expect(shouldSuppressShortcut(fakeEvent(mockTarget("BUTTON")))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SHORTCUTS catalog integrity
// ---------------------------------------------------------------------------

describe("SHORTCUTS catalog", () => {
  it("has no duplicate key+category combinations", () => {
    const seen = new Set<string>();
    for (const entry of SHORTCUTS) {
      const key = `${entry.keys.join("+")}::${entry.category}`;
      expect(seen.has(key), `duplicate: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("every entry has a non-empty label", () => {
    for (const entry of SHORTCUTS) {
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it("every entry has at least one key", () => {
    for (const entry of SHORTCUTS) {
      expect(entry.keys.length).toBeGreaterThan(0);
    }
  });
});
