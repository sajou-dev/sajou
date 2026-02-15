#!/usr/bin/env node
/**
 * sajou-tap — main CLI entry point.
 *
 * Usage:
 *   sajou-tap claude                             — Claude Code + hooks
 *   sajou-tap -- node my-agent.js                — Wrap process, JSON Lines
 *   sajou-tap --raw -- python crew.py            — Wrap process, raw stdout
 *   sajou-tap --endpoint ws://remote:9100 -- node app.js
 */

import { parseConfig } from "./config/config.js";
import { createTransport } from "./client/create-transport.js";
import { ClaudeCodeAdapter } from "./adapters/claude-code/claude-code-adapter.js";
import { JsonlAdapter } from "./adapters/jsonl/jsonl-adapter.js";
import { RawAdapter } from "./adapters/raw/raw-adapter.js";
import { wrapProcess } from "./process/process-wrapper.js";
import { installCleanupHandlers } from "./process/cleanup.js";
import type { TapAdapter } from "./adapters/types.js";

/** Entry point for the sajou-tap CLI. */
async function main(): Promise<void> {
  const config = parseConfig(process.argv);
  const transport = createTransport(config.endpoint);

  await transport.connect();

  let adapter: TapAdapter;

  if (config.mode === "claude") {
    adapter = new ClaudeCodeAdapter();
    await adapter.start(transport);

    installCleanupHandlers({ adapter, transport });

    // Claude Code mode: hooks handle everything, just wait
    console.error("[sajou-tap] Claude Code hooks installed. Listening...");
    console.error("[sajou-tap] Press Ctrl+C to stop and remove hooks.");

    // Keep process alive
    await new Promise<void>(() => {});
  } else {
    if (!config.command || config.command.length === 0) {
      console.error("[sajou-tap] Error: no command specified. Usage: sajou-tap -- <command>");
      process.exitCode = 1;
      return;
    }

    const [cmd, ...args] = config.command;

    if (config.mode === "raw") {
      adapter = new RawAdapter({ source: config.source, correlationId: config.correlationId });
    } else {
      adapter = new JsonlAdapter({ source: config.source, correlationId: config.correlationId });
    }

    await adapter.start(transport);

    const handle = wrapProcess({
      command: cmd!,
      args,
      onLine: (line) => {
        if (config.mode === "raw") {
          (adapter as RawAdapter).processLine(line);
        } else {
          (adapter as JsonlAdapter).processLine(line);
        }
      },
      onExit: (code) => {
        adapter.stop().catch(() => {});
        transport.close().catch(() => {});
        process.exitCode = code ?? 0;
      },
    });

    installCleanupHandlers({ adapter, transport, process: handle });
  }
}

main().catch((err) => {
  console.error("[sajou-tap] Fatal:", err);
  process.exitCode = 1;
});
