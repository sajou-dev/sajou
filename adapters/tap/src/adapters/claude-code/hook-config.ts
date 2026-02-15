/**
 * Generates the Claude Code hooks configuration for sajou-tap.
 *
 * All hooks use `sajou-emit --stdin` and are async (never block Claude Code).
 * The `statusMessage: "sajou-tap"` tag identifies hooks installed by tap
 * for clean removal on stop.
 */

/** Tag used to identify sajou-tap hooks in settings. */
export const TAP_HOOK_TAG = "sajou-tap";

/** Hook event names that sajou-tap installs. */
export const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "SubagentStart",
  "SubagentStop",
  "Stop",
] as const;

/** Shape of a single hook entry in Claude Code settings. */
export interface HookEntry {
  type: "command";
  command: string;
  async: boolean;
  timeout: number;
  statusMessage: string;
}

/** Shape of the hooks object in Claude Code settings. */
export type HookConfig = Record<string, Array<{ hooks: HookEntry[] }>>;

/**
 * Generates the hooks configuration for sajou-tap.
 *
 * @param emitCommand - The command to run (defaults to "sajou-emit --stdin")
 * @returns A hooks config object ready to merge into settings.local.json
 */
export function generateHookConfig(
  emitCommand = "npx sajou-emit --stdin",
): HookConfig {
  const config: HookConfig = {};

  for (const event of HOOK_EVENTS) {
    config[event] = [
      {
        hooks: [
          {
            type: "command",
            command: emitCommand,
            async: true,
            timeout: 5,
            statusMessage: TAP_HOOK_TAG,
          },
        ],
      },
    ];
  }

  return config;
}
