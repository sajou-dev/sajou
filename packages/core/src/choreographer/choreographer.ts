/**
 * Choreographer — the top-level facade that ties together the registry,
 * scheduler, resolver, and command sink.
 *
 * This is the main public API of @sajou/core's choreographer module.
 */

import type { Clock } from "./clock.js";
import type { CommandSink } from "./commands.js";
import { matchesWhen } from "./matcher.js";
import { Registry } from "./registry.js";
import { Scheduler } from "./scheduler.js";
import type { ChoreographyDefinition, PerformanceSignal } from "./types.js";

/** Options for creating a Choreographer instance. */
export interface ChoreographerOptions {
  /** The clock to use for timing. */
  readonly clock: Clock;
  /** The command sink that receives action commands (theme implements this). */
  readonly sink: CommandSink;
}

/**
 * The choreographer runtime — reads choreography definitions (JSON) and
 * executes them as timed action sequences when signals arrive.
 *
 * @example
 * ```ts
 * const choreographer = new Choreographer({ clock, sink });
 *
 * choreographer.register({
 *   on: "task_dispatch",
 *   steps: [
 *     { action: "move", entity: "agent", to: "signal.to", duration: 800 },
 *   ],
 * });
 *
 * choreographer.handleSignal({
 *   type: "task_dispatch",
 *   payload: { taskId: "t-1", from: "orchestrator", to: "solver" },
 * });
 * // The sink now receives onActionStart, onActionUpdate*, onActionComplete
 * ```
 */
export class Choreographer {
  private readonly registry: Registry;
  private readonly scheduler: Scheduler;

  constructor(options: ChoreographerOptions) {
    this.registry = new Registry();
    this.scheduler = new Scheduler(options.clock, options.sink);
  }

  /**
   * Register a choreography definition.
   * The choreography will trigger when a signal matching its `on` type arrives.
   */
  register(definition: ChoreographyDefinition): void {
    this.registry.register(definition);
  }

  /**
   * Register multiple choreography definitions at once.
   */
  registerAll(definitions: readonly ChoreographyDefinition[]): void {
    for (const def of definitions) {
      this.registry.register(def);
    }
  }

  /**
   * Handle an incoming signal.
   *
   * Looks up matching choreographies in the registry, handles interruptions
   * for definitions with `interrupts: true`, and starts new performances.
   *
   * @param signal - The signal to handle (type + payload).
   * @param correlationId - Optional correlationId for grouping/interruption.
   */
  handleSignal(
    signal: PerformanceSignal,
    correlationId?: string,
  ): void {
    const definitions = this.registry.getForSignalType(signal.type);

    for (const definition of definitions) {
      // Skip if the when clause doesn't match the signal payload
      if (!matchesWhen(definition.when, signal)) {
        continue;
      }

      // If this choreography interrupts, cancel matching active performances
      if (definition.interrupts && correlationId !== undefined) {
        this.scheduler.interruptByCorrelationId(correlationId, signal.type);
      }

      this.scheduler.startPerformance(definition, signal, correlationId);
    }
  }

  /** Number of currently running performances. */
  get activePerformanceCount(): number {
    return this.scheduler.activeCount;
  }

  /** Stop all performances and clean up. */
  dispose(): void {
    this.scheduler.dispose();
  }
}
