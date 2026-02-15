/**
 * Process wrapper — spawns a child process and captures its stdout.
 *
 * stdin and stderr pass through to the parent. stdout is piped for parsing.
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

/** Options for wrapping a child process. */
export interface ProcessWrapperOptions {
  /** The command to run. */
  command: string;
  /** Arguments to pass to the command. */
  args: readonly string[];
  /** Called for each line of stdout. */
  onLine: (line: string) => void;
  /** Called when the process exits. */
  onExit: (code: number | null) => void;
}

/** Handle for managing a wrapped child process. */
export interface ProcessHandle {
  /** The underlying child process. */
  readonly child: ChildProcess;
  /** Kills the child process. */
  kill(): void;
}

/**
 * Spawns a child process with stdout capture.
 *
 * stdin is inherited from parent (user can interact).
 * stderr is inherited (visible in terminal).
 * stdout is piped and emitted line-by-line via onLine callback.
 */
export function wrapProcess(options: ProcessWrapperOptions): ProcessHandle {
  const child = spawn(options.command, [...options.args], {
    stdio: ["inherit", "pipe", "inherit"],
  });

  if (child.stdout) {
    const rl = createInterface({ input: child.stdout });
    rl.on("line", options.onLine);
  }

  child.on("exit", (code) => {
    options.onExit(code);
  });

  return {
    child,
    kill(): void {
      if (!child.killed) {
        child.kill();
      }
    },
  };
}
