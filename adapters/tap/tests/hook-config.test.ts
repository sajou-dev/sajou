import { describe, it, expect } from "vitest";
import {
  generateHookConfig,
  HOOK_EVENTS,
  TAP_HOOK_TAG,
} from "../src/adapters/claude-code/hook-config.js";

describe("generateHookConfig", () => {
  it("generates config with all 6 hook events", () => {
    const config = generateHookConfig();
    const events = Object.keys(config);

    expect(events).toHaveLength(6);
    for (const event of HOOK_EVENTS) {
      expect(config[event]).toBeDefined();
    }
  });

  it("each hook uses sajou-emit --stdin", () => {
    const config = generateHookConfig();

    for (const event of HOOK_EVENTS) {
      const groups = config[event]!;
      expect(groups).toHaveLength(1);
      const hooks = groups[0]!.hooks;
      expect(hooks).toHaveLength(1);
      expect(hooks[0]!.command).toBe("npx sajou-emit --stdin");
    }
  });

  it("all hooks are async with timeout and tag", () => {
    const config = generateHookConfig();

    for (const event of HOOK_EVENTS) {
      const hook = config[event]![0]!.hooks[0]!;
      expect(hook.type).toBe("command");
      expect(hook.async).toBe(true);
      expect(hook.timeout).toBe(5);
      expect(hook.statusMessage).toBe(TAP_HOOK_TAG);
    }
  });

  it("accepts custom emit command", () => {
    const config = generateHookConfig("/usr/local/bin/sajou-emit --stdin");

    for (const event of HOOK_EVENTS) {
      const hook = config[event]![0]!.hooks[0]!;
      expect(hook.command).toBe("/usr/local/bin/sajou-emit --stdin");
    }
  });
});
