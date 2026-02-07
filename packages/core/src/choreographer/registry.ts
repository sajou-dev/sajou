/**
 * Choreography registry — stores choreography definitions indexed by signal type.
 *
 * Multiple choreographies can trigger on the same signal type.
 * The registry is a simple lookup table with no logic — the scheduler
 * handles execution.
 */

import type { ChoreographyDefinition } from "./types.js";

/**
 * Stores choreography definitions and retrieves them by signal type.
 */
export class Registry {
  private readonly definitions = new Map<string, ChoreographyDefinition[]>();

  /**
   * Register a choreography definition.
   * Multiple definitions can share the same `on` signal type.
   */
  register(definition: ChoreographyDefinition): void {
    const existing = this.definitions.get(definition.on);
    if (existing) {
      existing.push(definition);
    } else {
      this.definitions.set(definition.on, [definition]);
    }
  }

  /**
   * Get all choreography definitions that trigger on the given signal type.
   * Returns an empty array if no choreographies match.
   */
  getForSignalType(signalType: string): readonly ChoreographyDefinition[] {
    return this.definitions.get(signalType) ?? [];
  }

  /** Remove all registered definitions. */
  clear(): void {
    this.definitions.clear();
  }
}
