/**
 * RecordingSink — captures all choreographer commands for test assertions.
 *
 * Stores every command in typed arrays that tests can inspect.
 */

import type {
  ActionCompleteCommand,
  ActionExecuteCommand,
  ActionStartCommand,
  ActionUpdateCommand,
  CommandSink,
  InterruptCommand,
} from "./commands.js";

/** Union of all command types, tagged for easy filtering. */
export type RecordedCommand =
  | { readonly kind: "start"; readonly command: ActionStartCommand }
  | { readonly kind: "update"; readonly command: ActionUpdateCommand }
  | { readonly kind: "complete"; readonly command: ActionCompleteCommand }
  | { readonly kind: "execute"; readonly command: ActionExecuteCommand }
  | { readonly kind: "interrupt"; readonly command: InterruptCommand };

/**
 * A CommandSink that records every command for later inspection.
 *
 * @example
 * ```ts
 * const sink = new RecordingSink();
 * const choreographer = new Choreographer({ sink });
 * choreographer.handleSignal(signal);
 * clock.advance(1000);
 *
 * expect(sink.starts).toHaveLength(1);
 * expect(sink.starts[0].action).toBe("move");
 * expect(sink.updates.length).toBeGreaterThan(0);
 * expect(sink.completes).toHaveLength(1);
 * ```
 */
export class RecordingSink implements CommandSink {
  /** All commands in emission order. */
  readonly all: RecordedCommand[] = [];
  /** All ActionStartCommand emissions. */
  readonly starts: ActionStartCommand[] = [];
  /** All ActionUpdateCommand emissions. */
  readonly updates: ActionUpdateCommand[] = [];
  /** All ActionCompleteCommand emissions. */
  readonly completes: ActionCompleteCommand[] = [];
  /** All ActionExecuteCommand emissions. */
  readonly executes: ActionExecuteCommand[] = [];
  /** All InterruptCommand emissions. */
  readonly interrupts: InterruptCommand[] = [];

  onActionStart(command: ActionStartCommand): void {
    this.starts.push(command);
    this.all.push({ kind: "start", command });
  }

  onActionUpdate(command: ActionUpdateCommand): void {
    this.updates.push(command);
    this.all.push({ kind: "update", command });
  }

  onActionComplete(command: ActionCompleteCommand): void {
    this.completes.push(command);
    this.all.push({ kind: "complete", command });
  }

  onActionExecute(command: ActionExecuteCommand): void {
    this.executes.push(command);
    this.all.push({ kind: "execute", command });
  }

  onInterrupt(command: InterruptCommand): void {
    this.interrupts.push(command);
    this.all.push({ kind: "interrupt", command });
  }

  /** Clear all recorded commands. */
  clear(): void {
    this.all.length = 0;
    this.starts.length = 0;
    this.updates.length = 0;
    this.completes.length = 0;
    this.executes.length = 0;
    this.interrupts.length = 0;
  }
}
