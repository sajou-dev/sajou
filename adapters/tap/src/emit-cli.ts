#!/usr/bin/env node
/**
 * sajou-emit — micro CLI for sending signals from shell scripts and hooks.
 *
 * Usage:
 *   sajou-emit tool_call '{"toolName":"Bash","agentId":"claude","callId":"xyz"}'
 *   echo '{"hook_event_name":"PreToolUse",...}' | sajou-emit --stdin
 *
 * Endpoint resolution: --endpoint arg > SAJOU_ENDPOINT env > http://localhost:5175/api/signal
 */

import { randomUUID } from "node:crypto";
import { createTapSignal } from "./signal/signal-factory.js";
import { HttpTransport } from "./client/http-client.js";
import type { SignalEnvelope, SignalType } from "@sajou/schema";

// ---------------------------------------------------------------------------
// Hook → Signal mapping
// ---------------------------------------------------------------------------

/** Shape of Claude Code hook input data. */
interface HookInput {
  hook_event_name: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: string;
  error?: string;
  agent_id?: string;
  agent_type?: string;
  session_id?: string;
}

/**
 * Maps a Claude Code hook event to a sajou SignalEnvelope.
 *
 * @param hook - The parsed hook input from stdin
 * @returns A SignalEnvelope or null if the event is unmapped
 */
export function mapHookToSignal(hook: HookInput): SignalEnvelope | null {
  const correlationId = hook.session_id;

  switch (hook.hook_event_name) {
    case "PreToolUse":
      return createTapSignal(
        "tool_call",
        {
          toolName: hook.tool_name ?? "unknown",
          agentId: "claude",
          callId: hook.tool_use_id,
          input: hook.tool_input,
        },
        { correlationId },
      );

    case "PostToolUse":
      return createTapSignal(
        "tool_result",
        {
          toolName: hook.tool_name ?? "unknown",
          agentId: "claude",
          callId: hook.tool_use_id,
          success: true,
          output: hook.tool_response
            ? { response: hook.tool_response }
            : undefined,
        },
        { correlationId },
      );

    case "PostToolUseFailure":
      return createTapSignal(
        "error",
        {
          agentId: "claude",
          message: hook.error ?? "Tool use failed",
          severity: "error",
          code: hook.tool_name,
        },
        { correlationId },
      );

    case "SubagentStart":
      return createTapSignal(
        "task_dispatch",
        {
          taskId: hook.agent_id ?? "unknown",
          from: "claude",
          to: hook.agent_type ?? "subagent",
        },
        { correlationId },
      );

    case "SubagentStop":
      return createTapSignal(
        "completion",
        {
          taskId: hook.agent_id ?? "unknown",
          agentId: hook.agent_type,
          success: true,
        },
        { correlationId },
      );

    case "Stop":
      return createTapSignal(
        "agent_state_change",
        {
          agentId: "claude",
          from: "acting",
          to: "done",
        },
        { correlationId },
      );

    case "SessionStart":
      return createTapSignal(
        "agent_state_change",
        {
          agentId: "claude",
          from: "idle",
          to: "thinking",
        },
        { correlationId },
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// stdin reading
// ---------------------------------------------------------------------------

/** Reads all data from stdin and returns it as a string. */
function readStdin(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/** Parsed CLI arguments for sajou-emit. */
export interface EmitArgs {
  /** Signal type (positional arg) — only in arg mode. */
  type?: SignalType;
  /** JSON payload string (positional arg) — only in arg mode. */
  payloadJson?: string;
  /** The endpoint URL to send to. */
  endpoint?: string;
  /** Read hook JSON from stdin instead of positional args. */
  stdin: boolean;
}

/** Parses process.argv into EmitArgs. */
export function parseEmitArgs(argv: readonly string[]): EmitArgs {
  const args = argv.slice(2); // skip node + script
  let endpoint: string | undefined;
  let stdin = false;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--stdin") {
      stdin = true;
    } else if (arg === "--endpoint" && i + 1 < args.length) {
      endpoint = args[++i];
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
    }
  }

  return {
    type: positional[0] as SignalType | undefined,
    payloadJson: positional[1],
    endpoint,
    stdin,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Entry point for the sajou-emit CLI. */
export async function emitMain(argv: readonly string[]): Promise<void> {
  const args = parseEmitArgs(argv);
  const endpointUrl =
    args.endpoint ?? process.env["SAJOU_ENDPOINT"] ?? undefined;

  const transport = new HttpTransport({ endpoint: endpointUrl });
  await transport.connect();

  let signal: SignalEnvelope | null = null;

  if (args.stdin) {
    const raw = await readStdin();
    const hook = JSON.parse(raw) as HookInput;
    signal = mapHookToSignal(hook);
  } else if (args.type && args.payloadJson) {
    const payload = JSON.parse(args.payloadJson) as Record<string, unknown>;
    signal = {
      id: `tap-${randomUUID()}`,
      type: args.type,
      timestamp: Date.now(),
      source: "adapter:tap",
      payload,
    };
  }

  if (!signal) {
    process.exitCode = 1;
    return;
  }

  try {
    await transport.send(signal);
  } catch {
    process.exitCode = 1;
  } finally {
    await transport.close();
  }
}

// Run if executed directly
const isDirectExecution =
  process.argv[1]?.endsWith("emit-cli.ts") ||
  process.argv[1]?.endsWith("emit-cli.js");
if (isDirectExecution) {
  emitMain(process.argv).catch(() => {
    process.exitCode = 1;
  });
}
