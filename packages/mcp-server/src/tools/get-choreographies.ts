/**
 * get_choreographies tool — lists choreographies defined in the current scene.
 *
 * Reads the server-authoritative state directly. Returns all
 * choreography definitions with their signal triggers, steps, and wiring info.
 */

import { z } from "zod";
import { getChoreographies, getWiring } from "../state/store.js";

/** Tool name. */
export const name = "get_choreographies";

/** Tool description shown to the AI agent. */
export const description =
  "List all choreographies in the current scene. Returns each choreography's " +
  "trigger signal type, when-conditions, step count, step types, and wiring " +
  "info (which signal sources feed into it). Use this to understand what " +
  "animations are available before emitting signals.";

/** Input schema — no parameters needed. */
export const inputSchema = z.object({});

/** Tool handler — reads choreographies from the store and enriches with wiring. */
export async function handler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  const choreosState = getChoreographies();
  const wiringState = getWiring();

  const rawChoreos = (choreosState["choreographies"] ?? []) as Array<Record<string, unknown>>;
  const wires = (wiringState["wires"] ?? []) as Array<Record<string, unknown>>;

  // Enrich choreographies with wiring info
  const choreographies = rawChoreos.map((c) => {
    const id = c["id"] as string;
    const steps = (c["steps"] ?? []) as Array<Record<string, unknown>>;

    // Find wires targeting this choreography
    const incomingWires = wires.filter(
      (w) => w["toZone"] === "choreographer" && w["toId"] === id,
    );

    // Signal types wired to this choreography
    const wiredSignalTypes = incomingWires
      .filter((w) => w["fromZone"] === "signal-type")
      .map((w) => w["fromId"] as string);

    // Sources feeding into this choreography (via signal-type wires)
    const sources: Array<{ sourceId: string; signalType: string }> = [];
    for (const signalType of wiredSignalTypes) {
      const sourceWires = wires.filter(
        (w) => w["fromZone"] === "signal" && w["toZone"] === "signal-type" && w["toId"] === signalType,
      );
      for (const sw of sourceWires) {
        sources.push({
          sourceId: sw["fromId"] as string,
          signalType,
        });
      }
    }

    return {
      id,
      on: c["on"] as string,
      when: c["when"] ?? null,
      interrupts: c["interrupts"] ?? false,
      defaultTargetEntityId: c["defaultTargetEntityId"] ?? null,
      stepCount: steps.length,
      stepTypes: steps.map((s) => s["action"] as string),
      wiredSignalTypes,
      sources,
    };
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: true,
          choreographies,
          count: choreographies.length,
        }),
      },
    ],
  };
}
