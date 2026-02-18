/**
 * list_themes tool — returns available sajou themes.
 *
 * V1: hardcoded list. Future: will query loaded themes dynamically.
 */

import { z } from "zod";

/** Tool name. */
export const name = "list_themes";

/** Tool description shown to the AI agent. */
export const description =
  "List available sajou themes. Each theme provides a complete visual world " +
  "with entities, animations, sounds, and layouts. Use get_catalog to see " +
  "what a specific theme offers.";

/** Input schema — no parameters needed. */
export const inputSchema = z.object({});

/** Hardcoded theme list for V1. */
const THEMES = [
  {
    id: "citadel",
    name: "Citadelle",
    description: "Medieval-fantasy theme inspired by WC3. Camp, buildings, units, and effects.",
  },
  {
    id: "office",
    name: "Office",
    description: "Corporate/office theme. Desks, workers, meeting rooms, and office equipment.",
  },
];

/** Tool handler — returns the theme list. */
export async function handler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ themes: THEMES }),
      },
    ],
  };
}
