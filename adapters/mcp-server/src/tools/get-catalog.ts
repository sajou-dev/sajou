/**
 * get_catalog tool — returns entity catalog for a theme.
 *
 * V1: hardcoded catalogs for citadel and office themes.
 * Future: will read from theme manifests dynamically.
 */

import { z } from "zod";

/** Tool name. */
export const name = "get_catalog";

/** Tool description shown to the AI agent. */
export const description =
  "Get the entity catalog for a theme. Returns available entities organized " +
  "by category (buildings, units, effects, props, etc.). Everything in the " +
  "catalog is guaranteed renderable by the theme.";

/** Input schema. */
export const inputSchema = z.object({
  theme: z
    .string()
    .describe("Theme ID to get the catalog for (e.g. 'citadel', 'office')."),
});

/** Hardcoded catalogs for V1. */
const CATALOGS: Record<string, Record<string, readonly string[]>> = {
  citadel: {
    buildings: ["town-hall", "barracks", "forge", "gold-mine", "watchtower"],
    units: ["peon", "footman", "archer", "mage"],
    effects: ["explosion", "heal-aura", "gold-coins", "smoke"],
    props: ["torch", "banner", "crate", "campfire"],
  },
  office: {
    furniture: ["desk", "chair", "whiteboard", "filing-cabinet", "coffee-machine"],
    workers: ["developer", "manager", "designer", "intern"],
    effects: ["notification", "coffee-steam", "paper-stack", "lightbulb"],
    props: ["laptop", "mug", "plant", "sticky-note"],
  },
};

/** Tool handler — returns the catalog for the requested theme. */
export async function handler(
  params: z.infer<typeof inputSchema>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const catalog = CATALOGS[params.theme];

  if (!catalog) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: `Unknown theme: ${params.theme}. Available: ${Object.keys(CATALOGS).join(", ")}`,
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ theme: params.theme, catalog }),
      },
    ],
  };
}
