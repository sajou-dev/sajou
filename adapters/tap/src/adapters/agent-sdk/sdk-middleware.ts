/**
 * SDK middleware — programmatic API for integrating tap into agent code.
 *
 * @example
 * ```ts
 * import { createTapMiddleware } from '@sajou/tap';
 *
 * const tap = await createTapMiddleware({ endpoint: 'http://localhost:5175/api/signal' });
 * tap.onToolCall('search', { query: 'hello' });
 * tap.onToolResult('search', true, { results: ['...'] });
 * await tap.close();
 * ```
 */

import { createTapSignal } from "../../signal/signal-factory.js";
import { createTransport } from "../../client/create-transport.js";
import type { TapTransport } from "../../client/transport.js";
import type { SignalEnvelope, AgentState, ErrorSeverity } from "@sajou/schema";

/** Options for creating a tap middleware instance. */
export interface TapMiddlewareOptions {
  /** The endpoint URL to send signals to. */
  endpoint?: string;
  /** Custom source identifier for signals. Defaults to "adapter:tap:sdk". */
  source?: string;
  /** Correlation ID to tag all signals with. */
  correlationId?: string;
  /** Pre-configured transport (for testing). Overrides endpoint. */
  transport?: TapTransport;
}

/** Programmatic API for sending sajou signals from agent code. */
export interface TapMiddleware {
  /** Emits a tool_call signal. */
  onToolCall(
    toolName: string,
    input?: Record<string, unknown>,
    callId?: string,
  ): void;
  /** Emits a tool_result signal. */
  onToolResult(
    toolName: string,
    success: boolean,
    output?: Record<string, unknown>,
    callId?: string,
  ): void;
  /** Emits a task_dispatch signal. */
  onTaskDispatch(taskId: string, from: string, to: string): void;
  /** Emits an agent_state_change signal. */
  onStateChange(agentId: string, from: AgentState, to: AgentState): void;
  /** Emits an error signal. */
  onError(message: string, severity?: ErrorSeverity, code?: string): void;
  /** Emits a completion signal. */
  onCompletion(taskId: string, success: boolean, result?: string): void;
  /** Emits a text_delta signal. */
  onTextDelta(agentId: string, content: string): void;
  /** Emits an arbitrary signal envelope. */
  emit(signal: SignalEnvelope): void;
  /** Closes the transport and releases resources. */
  close(): Promise<void>;
}

/**
 * Creates a tap middleware instance for programmatic signal emission.
 *
 * @param options - Configuration options
 * @returns A connected TapMiddleware ready to emit signals
 */
export async function createTapMiddleware(
  options?: TapMiddlewareOptions,
): Promise<TapMiddleware> {
  const source = options?.source ?? "adapter:tap:sdk";
  const correlationId = options?.correlationId;
  const transport = options?.transport ?? createTransport(options?.endpoint);

  await transport.connect();

  const send = (signal: SignalEnvelope): void => {
    transport.send(signal).catch(() => {});
  };

  return {
    onToolCall(
      toolName: string,
      input?: Record<string, unknown>,
      callId?: string,
    ): void {
      send(
        createTapSignal(
          "tool_call",
          { toolName, agentId: "sdk", callId, input },
          { source, correlationId },
        ),
      );
    },

    onToolResult(
      toolName: string,
      success: boolean,
      output?: Record<string, unknown>,
      callId?: string,
    ): void {
      send(
        createTapSignal(
          "tool_result",
          { toolName, agentId: "sdk", success, callId, output },
          { source, correlationId },
        ),
      );
    },

    onTaskDispatch(taskId: string, from: string, to: string): void {
      send(
        createTapSignal(
          "task_dispatch",
          { taskId, from, to },
          { source, correlationId },
        ),
      );
    },

    onStateChange(agentId: string, from: AgentState, to: AgentState): void {
      send(
        createTapSignal(
          "agent_state_change",
          { agentId, from, to },
          { source, correlationId },
        ),
      );
    },

    onError(
      message: string,
      severity: ErrorSeverity = "error",
      code?: string,
    ): void {
      send(
        createTapSignal(
          "error",
          { message, severity, code },
          { source, correlationId },
        ),
      );
    },

    onCompletion(taskId: string, success: boolean, result?: string): void {
      send(
        createTapSignal(
          "completion",
          { taskId, success, result },
          { source, correlationId },
        ),
      );
    },

    onTextDelta(agentId: string, content: string): void {
      send(
        createTapSignal(
          "text_delta",
          { agentId, content },
          { source, correlationId },
        ),
      );
    },

    emit(signal: SignalEnvelope): void {
      send(signal);
    },

    async close(): Promise<void> {
      await transport.close();
    },
  };
}
