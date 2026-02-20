/**
 * Tap hook management routes — install/uninstall Claude Code hooks.
 *
 * Extracted from tapHookPlugin in vite.config.ts.
 */

import { Router } from "express";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";

// ---------------------------------------------------------------------------
// Tap hook config
// ---------------------------------------------------------------------------

const TAP_HOOK_TAG = "sajou-tap";
const TAP_HOOK_EVENTS = ["PreToolUse", "PostToolUse", "PostToolUseFailure", "SubagentStart", "SubagentStop", "Stop"];

interface TapHookEntry { type: string; command: string; async: boolean; timeout: number; statusMessage: string }
type TapHookConfig = Record<string, Array<{ hooks: TapHookEntry[] }>>;
interface TapSettings { hooks?: TapHookConfig; [key: string]: unknown }

/** Find nearest .claude directory by walking up from cwd. */
async function findClaudeDir(): Promise<string> {
  let dir = process.cwd();
  while (true) {
    const candidate = join(dir, ".claude");
    try {
      const s = await stat(candidate);
      if (s.isDirectory()) return candidate;
    } catch { /* keep walking */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(process.cwd(), ".claude");
}

async function readSettings(path: string): Promise<TapSettings> {
  try { return JSON.parse(await readFile(path, "utf8")) as TapSettings; }
  catch { return {}; }
}

function isTapHook(h: TapHookEntry): boolean { return h.statusMessage === TAP_HOOK_TAG; }

async function installTapHooks(): Promise<void> {
  const claudeDir = await findClaudeDir();
  const settingsPath = join(claudeDir, "settings.local.json");
  const settings = await readSettings(settingsPath);
  if (!settings.hooks) settings.hooks = {};

  for (const event of TAP_HOOK_EVENTS) {
    if (!settings.hooks[event]) settings.hooks[event] = [];
    settings.hooks[event] = settings.hooks[event]!.filter(g => !g.hooks.some(isTapHook));
    settings.hooks[event]!.push({
      hooks: [{ type: "command", command: "npx sajou-emit --stdin", async: true, timeout: 5, statusMessage: TAP_HOOK_TAG }],
    });
  }

  await mkdir(claudeDir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

async function uninstallTapHooks(): Promise<void> {
  const claudeDir = await findClaudeDir();
  const settingsPath = join(claudeDir, "settings.local.json");
  const settings = await readSettings(settingsPath);
  if (!settings.hooks) return;

  const cleaned: TapHookConfig = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const filtered = groups.filter(g => !g.hooks.some(isTapHook));
    if (filtered.length > 0) cleaned[event] = filtered;
  }
  settings.hooks = Object.keys(cleaned).length > 0 ? cleaned : undefined;
  if (!settings.hooks) delete settings.hooks;

  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Track hook state for cleanup
// ---------------------------------------------------------------------------

let hooksInstalled = false;

/** Clean up hooks on process exit. */
export function cleanupTapHooks(): void {
  if (hooksInstalled) {
    uninstallTapHooks().catch(() => {});
    hooksInstalled = false;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function createTapRoutes(): Router {
  const router = Router();

  // POST /api/tap/connect — install hooks
  router.post("/api/tap/connect", (_req, res) => {
    installTapHooks()
      .then(() => {
        hooksInstalled = true;
        res.json({ ok: true });
      })
      .catch((e) => {
        res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
  });

  // POST /api/tap/disconnect — remove hooks
  router.post("/api/tap/disconnect", (_req, res) => {
    uninstallTapHooks()
      .then(() => {
        hooksInstalled = false;
        res.json({ ok: true });
      })
      .catch((e) => {
        res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
  });

  return router;
}
