/**
 * @sajou/core — Signal bus and choreographer runtime for Sajou.
 *
 * Zero external dependencies. Framework-agnostic.
 * Runs in browser and Node.js environments.
 */

export {
  Choreographer,
  TestClock,
  RecordingSink,
  resetPerformanceIdCounter,
  linear,
  easeIn,
  easeOut,
  easeInOut,
  arc,
  getEasing,
  EASING_FUNCTIONS,
} from "./choreographer/index.js";

export type {
  ChoreographerOptions,
  Clock,
  CancelHandle,
  CommandSink,
  ActionStartCommand,
  ActionUpdateCommand,
  ActionCompleteCommand,
  ActionExecuteCommand,
  InterruptCommand,
  ActionCommandBase,
  EasingFn,
  EasingName,
  ChoreographyDefinition,
  ChoreographyStep,
  ActionStep,
  ParallelStep,
  OnArriveStep,
  OnInterruptStep,
  Performance,
  PerformanceSignal,
  RecordedCommand,
} from "./choreographer/index.js";
