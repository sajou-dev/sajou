/**
 * CLI argument parsing for the main sajou-tap command.
 *
 * Supports:
 *   sajou-tap claude
 *   sajou-tap -- node my-agent.js
 *   sajou-tap --raw -- python crew.py
 *   sajou-tap --endpoint ws://remote:9100 -- node app.js
 */

/** Parsed configuration for a sajou-tap session. */
export interface TapConfig {
  /** The adapter to use: "claude" for Claude Code, "jsonl" or "raw" for process wrapping. */
  mode: "claude" | "jsonl" | "raw";
  /** The endpoint URL to send signals to. */
  endpoint: string;
  /** Custom source identifier for signals. */
  source?: string;
  /** Correlation ID to tag all signals with. */
  correlationId?: string;
  /** The command and arguments for the child process (everything after --). */
  command?: readonly string[];
}

/** Default scene-builder HTTP endpoint. */
const DEFAULT_ENDPOINT = "http://localhost:5175/api/signal";

/**
 * Parses process.argv into a TapConfig.
 *
 * @param argv - The full process.argv array
 * @returns Parsed configuration
 */
export function parseConfig(argv: readonly string[]): TapConfig {
  const args = argv.slice(2); // skip node + script

  let endpoint: string | undefined;
  let source: string | undefined;
  let correlationId: string | undefined;
  let raw = false;
  let mode: TapConfig["mode"] = "jsonl";
  let command: string[] | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (arg === "--") {
      // Everything after -- is the child command
      command = args.slice(i + 1);
      break;
    }

    if (arg === "--endpoint" && i + 1 < args.length) {
      endpoint = args[++i];
    } else if (arg === "--source" && i + 1 < args.length) {
      source = args[++i];
    } else if (arg === "--correlation-id" && i + 1 < args.length) {
      correlationId = args[++i];
    } else if (arg === "--raw") {
      raw = true;
    } else if (arg === "claude") {
      mode = "claude";
    } else if (!arg.startsWith("--")) {
      // Bare command without -- separator
      command = args.slice(i);
      break;
    }

    i++;
  }

  // Determine mode from flags
  if (mode !== "claude") {
    mode = raw ? "raw" : "jsonl";
  }

  return {
    mode,
    endpoint: endpoint ?? process.env["SAJOU_ENDPOINT"] ?? DEFAULT_ENDPOINT,
    source,
    correlationId,
    command: command && command.length > 0 ? command : undefined,
  };
}
