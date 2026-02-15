/**
 * Claude Code adapter — installs hooks into `.claude/settings.local.json`
 * and removes them on stop.
 *
 * The adapter merges sajou-tap hooks with existing hooks (if any),
 * tagging each entry with `statusMessage: "sajou-tap"` for identification.
 * On stop, only tap-tagged hooks are removed — the rest is preserved.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { TapAdapter } from "../types.js";
import type { TapTransport } from "../../client/transport.js";
import {
  generateHookConfig,
  TAP_HOOK_TAG,
  type HookConfig,
  type HookEntry,
} from "./hook-config.js";

/** Shape of Claude Code's settings.local.json. */
interface ClaudeSettings {
  hooks?: HookConfig;
  [key: string]: unknown;
}

/** Options for creating a Claude Code adapter. */
export interface ClaudeCodeAdapterOptions {
  /** Path to the project's .claude directory. Defaults to cwd + ".claude". */
  claudeDir?: string;
  /** Override the emit command used in hooks. */
  emitCommand?: string;
}

/** Claude Code adapter — installs/removes hooks in settings.local.json. */
export class ClaudeCodeAdapter implements TapAdapter {
  readonly name = "claude-code";
  readonly source = "adapter:tap:claude";

  private readonly settingsPath: string;
  private readonly claudeDir: string;
  private readonly emitCommand: string | undefined;
  private originalSettings: ClaudeSettings | null = null;
  private cleanupInstalled = false;

  constructor(options?: ClaudeCodeAdapterOptions) {
    this.claudeDir = options?.claudeDir ?? join(process.cwd(), ".claude");
    this.settingsPath = join(this.claudeDir, "settings.local.json");
    this.emitCommand = options?.emitCommand;
  }

  /** Installs sajou-tap hooks into settings.local.json. */
  async start(_transport: TapTransport): Promise<void> {
    // Read existing settings (or start fresh)
    this.originalSettings = await this.readSettings();
    const settings = structuredClone(this.originalSettings);

    // Merge tap hooks
    const tapHooks = generateHookConfig(this.emitCommand);
    settings.hooks = mergeHooks(settings.hooks, tapHooks);

    // Write merged settings
    await this.writeSettings(settings);

    // Install cleanup handlers
    if (!this.cleanupInstalled) {
      this.cleanupInstalled = true;
      const cleanup = (): void => {
        this.stopSync();
      };
      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
      process.on("beforeExit", cleanup);
    }
  }

  /** Removes sajou-tap hooks, restoring original state. */
  async stop(): Promise<void> {
    const settings = await this.readSettings();
    if (settings.hooks) {
      settings.hooks = removeTapHooks(settings.hooks);
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }
    }
    await this.writeSettings(settings);
  }

  /** Synchronous cleanup for signal handlers. */
  private stopSync(): void {
    try {
      const { readFileSync, writeFileSync } = require("node:fs") as {
        readFileSync: (path: string, encoding: string) => string;
        writeFileSync: (path: string, data: string) => void;
      };
      const raw = readFileSync(this.settingsPath, "utf8");
      const settings = JSON.parse(raw) as ClaudeSettings;
      if (settings.hooks) {
        settings.hooks = removeTapHooks(settings.hooks);
        if (Object.keys(settings.hooks).length === 0) {
          delete settings.hooks;
        }
      }
      writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2) + "\n");
    } catch {
      // Best-effort cleanup
    }
  }

  private async readSettings(): Promise<ClaudeSettings> {
    try {
      const raw = await readFile(this.settingsPath, "utf8");
      return JSON.parse(raw) as ClaudeSettings;
    } catch {
      return {};
    }
  }

  private async writeSettings(settings: ClaudeSettings): Promise<void> {
    await mkdir(this.claudeDir, { recursive: true });
    await writeFile(
      this.settingsPath,
      JSON.stringify(settings, null, 2) + "\n",
    );
  }
}

/**
 * Merges tap hooks into existing hooks without duplicating.
 * Existing non-tap hooks are preserved.
 */
function mergeHooks(
  existing: HookConfig | undefined,
  tapHooks: HookConfig,
): HookConfig {
  const merged: HookConfig = existing ? structuredClone(existing) : {};

  for (const [event, tapEntries] of Object.entries(tapHooks)) {
    if (!merged[event]) {
      merged[event] = [];
    }
    // Remove any existing tap hooks for this event (avoid duplicates on re-start)
    merged[event] = merged[event]!.filter(
      (group) => !group.hooks.some((h) => isTapHook(h)),
    );
    // Append tap hooks
    merged[event]!.push(...tapEntries);
  }

  return merged;
}

/** Removes all tap-tagged hook entries from a hooks config. */
function removeTapHooks(hooks: HookConfig): HookConfig {
  const cleaned: HookConfig = {};

  for (const [event, groups] of Object.entries(hooks)) {
    const filtered = groups.filter(
      (group) => !group.hooks.some((h) => isTapHook(h)),
    );
    if (filtered.length > 0) {
      cleaned[event] = filtered;
    }
  }

  return cleaned;
}

/** Checks whether a hook entry was installed by sajou-tap. */
function isTapHook(hook: HookEntry): boolean {
  return hook.statusMessage === TAP_HOOK_TAG;
}
