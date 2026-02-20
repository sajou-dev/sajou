/**
 * Action commands — the typed interface between the choreographer and theme renderers.
 *
 * The choreographer produces commands; the theme consumes them via a CommandSink.
 * Commands are split into two categories:
 * - Animated actions: start → update* → complete lifecycle
 * - Instant actions: single execute call
 */

/** Base fields shared by all action commands. */
export interface ActionCommandBase {
  /** Unique ID of the performance (choreography instance) that produced this command. */
  readonly performanceId: string;
  /** The action name (e.g., "move", "spawn", "flash"). */
  readonly action: string;
  /** Logical entity reference, resolved from the choreography step. */
  readonly entityRef: string;
  /** Action-specific parameters from the choreography step. */
  readonly params: Readonly<Record<string, unknown>>;
}

/** Emitted when an animated action begins. */
export interface ActionStartCommand extends ActionCommandBase {
  /** Total duration of this action in milliseconds. */
  readonly duration: number;
  /** Name of the easing function applied. */
  readonly easing: string;
}

/** Emitted each frame while an animated action is running. */
export interface ActionUpdateCommand extends ActionCommandBase {
  /** Eased progress value in [0, 1]. */
  readonly progress: number;
  /** Elapsed time since action start, in milliseconds. */
  readonly elapsed: number;
}

/** Emitted when an animated action completes normally. */
export interface ActionCompleteCommand extends ActionCommandBase {
  // No extra fields — signals normal completion.
}

/** Emitted for instant (one-shot) actions like spawn, destroy, playSound. */
export interface ActionExecuteCommand extends ActionCommandBase {
  // No extra fields — execute immediately.
}

/** Emitted when a performance is interrupted (e.g., by an error signal). */
export interface InterruptCommand {
  /** ID of the interrupted performance. */
  readonly performanceId: string;
  /** The correlationId that triggered the interruption. */
  readonly correlationId: string;
  /** The signal type that caused the interruption (e.g., "error"). */
  readonly interruptedBy: string;
}

/**
 * The interface a theme implements to receive choreographer commands.
 *
 * The choreographer calls these methods as it advances performances.
 * In tests, use `RecordingSink` to capture commands for assertion.
 */
export interface CommandSink {
  /** An animated action begins. Theme should prepare the visual. */
  onActionStart(command: ActionStartCommand): void;
  /** Frame update for an animated action. Theme should interpolate the visual. */
  onActionUpdate(command: ActionUpdateCommand): void;
  /** An animated action completed normally. Theme should finalize the visual. */
  onActionComplete(command: ActionCompleteCommand): void;
  /** An instant action should be executed immediately. */
  onActionExecute(command: ActionExecuteCommand): void;
  /** A performance was interrupted. Theme should clean up visuals. */
  onInterrupt(command: InterruptCommand): void;
}
