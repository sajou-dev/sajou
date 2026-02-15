import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code/claude-code-adapter.js";
import { TAP_HOOK_TAG } from "../src/adapters/claude-code/hook-config.js";
import type { TapTransport } from "../src/client/transport.js";

/** Minimal mock transport. */
const mockTransport: TapTransport = {
  connected: true,
  connect: async () => {},
  send: async () => {},
  close: async () => {},
};

describe("ClaudeCodeAdapter", () => {
  let tempDir: string;
  let claudeDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `tap-test-${randomUUID()}`);
    claudeDir = join(tempDir, ".claude");
    settingsPath = join(claudeDir, "settings.local.json");
    await mkdir(claudeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates settings.local.json with hooks when none exists", async () => {
    // Remove settings file (start clean)
    await rm(settingsPath, { force: true });

    const adapter = new ClaudeCodeAdapter({ claudeDir });
    await adapter.start(mockTransport);

    const raw = await readFile(settingsPath, "utf8");
    const settings = JSON.parse(raw) as { hooks: Record<string, unknown> };

    expect(settings.hooks).toBeDefined();
    expect(Object.keys(settings.hooks)).toHaveLength(6);

    await adapter.stop();
  });

  it("merges hooks with existing settings", async () => {
    // Pre-existing settings with custom hooks
    const existing = {
      allowedTools: ["Bash"],
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: "command",
                command: "my-linter",
                async: false,
                timeout: 10,
                statusMessage: "lint",
              },
            ],
          },
        ],
      },
    };
    await writeFile(settingsPath, JSON.stringify(existing, null, 2));

    const adapter = new ClaudeCodeAdapter({ claudeDir });
    await adapter.start(mockTransport);

    const raw = await readFile(settingsPath, "utf8");
    const settings = JSON.parse(raw) as {
      allowedTools: string[];
      hooks: Record<string, Array<{ hooks: Array<{ statusMessage: string }> }>>;
    };

    // Original settings preserved
    expect(settings.allowedTools).toEqual(["Bash"]);

    // Original PreToolUse hook preserved, tap hook added
    const preToolUse = settings.hooks["PreToolUse"]!;
    expect(preToolUse).toHaveLength(2);

    const lintHook = preToolUse.find(
      (g) => g.hooks[0]!.statusMessage === "lint",
    );
    const tapHook = preToolUse.find(
      (g) => g.hooks[0]!.statusMessage === TAP_HOOK_TAG,
    );
    expect(lintHook).toBeDefined();
    expect(tapHook).toBeDefined();

    await adapter.stop();
  });

  it("removes only tap hooks on stop, preserving others", async () => {
    // Setup: existing + tap hooks
    const existing = {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: "command",
                command: "my-linter",
                async: false,
                timeout: 10,
                statusMessage: "lint",
              },
            ],
          },
        ],
      },
    };
    await writeFile(settingsPath, JSON.stringify(existing, null, 2));

    const adapter = new ClaudeCodeAdapter({ claudeDir });
    await adapter.start(mockTransport);
    await adapter.stop();

    const raw = await readFile(settingsPath, "utf8");
    const settings = JSON.parse(raw) as {
      hooks: Record<string, Array<{ hooks: Array<{ statusMessage: string }> }>>;
    };

    // Only the linter hook remains
    const preToolUse = settings.hooks["PreToolUse"]!;
    expect(preToolUse).toHaveLength(1);
    expect(preToolUse[0]!.hooks[0]!.statusMessage).toBe("lint");

    // Events with only tap hooks are gone
    expect(settings.hooks["PostToolUse"]).toBeUndefined();
  });

  it("cleans up hooks entirely when no other hooks exist", async () => {
    const adapter = new ClaudeCodeAdapter({ claudeDir });
    await adapter.start(mockTransport);
    await adapter.stop();

    const raw = await readFile(settingsPath, "utf8");
    const settings = JSON.parse(raw) as Record<string, unknown>;

    // hooks key should be removed entirely
    expect(settings["hooks"]).toBeUndefined();
  });

  it("does not duplicate tap hooks on repeated start", async () => {
    const adapter = new ClaudeCodeAdapter({ claudeDir });
    await adapter.start(mockTransport);
    await adapter.start(mockTransport);

    const raw = await readFile(settingsPath, "utf8");
    const settings = JSON.parse(raw) as {
      hooks: Record<string, Array<{ hooks: Array<{ statusMessage: string }> }>>;
    };

    // Only one tap hook per event, not two
    for (const groups of Object.values(settings.hooks)) {
      const tapGroups = groups.filter(
        (g) => g.hooks[0]!.statusMessage === TAP_HOOK_TAG,
      );
      expect(tapGroups).toHaveLength(1);
    }

    await adapter.stop();
  });
});
