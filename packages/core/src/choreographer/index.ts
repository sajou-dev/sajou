/**
 * @sajou/core choreographer module — public API exports.
 */

// Core facade
export { Choreographer } from "./choreographer.js";
export type { ChoreographerOptions } from "./choreographer.js";

// Clock
export type { Clock, CancelHandle } from "./clock.js";
export { BrowserClock } from "./browser-clock.js";

// Commands & sink
export type {
  CommandSink,
  ActionStartCommand,
  ActionUpdateCommand,
  ActionCompleteCommand,
  ActionExecuteCommand,
  InterruptCommand,
  ActionCommandBase,
} from "./commands.js";

// Easing
export type { EasingFn, EasingName } from "./easing.js";
export {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  arc,
  getEasing,
  EASING_FUNCTIONS,
} from "./easing.js";

// Matcher (when clause evaluation)
export { matchesWhen } from "./matcher.js";

// Types (choreography definitions)
export type {
  ChoreographyDefinition,
  ChoreographyStep,
  ActionStep,
  ParallelStep,
  OnArriveStep,
  OnInterruptStep,
  Performance,
  PerformanceSignal,
  WhenClause,
  WhenCondition,
  WhenOperator,
} from "./types.js";

// Test utilities
export { TestClock } from "./test-clock.js";
export { RecordingSink } from "./recording-sink.js";
export type { RecordedCommand } from "./recording-sink.js";
export { resetPerformanceIdCounter } from "./scheduler.js";
