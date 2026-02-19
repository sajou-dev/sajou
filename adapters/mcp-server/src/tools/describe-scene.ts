/**
 * describe_scene tool — comprehensive human/AI-readable scene description.
 *
 * This is the first tool an AI agent should call to understand the current
 * scene. It reads all state from the store and produces a structured text
 * summary of entities, choreographies, signal sources, bindings, and wiring.
 */

import { z } from "zod";
import {
  getSceneSnapshot,
  getChoreographies,
  getBindings,
  getSignalSources,
  getWiring,
  getEditor,
} from "../state/store.js";

/** Tool name. */
export const name = "describe_scene";

/** Tool description shown to the AI agent. */
export const description =
  "Get a comprehensive, human-readable description of the current sajou scene. " +
  "Returns a structured summary of all placed entities, choreographies, signal " +
  "sources, bindings, and wiring. This is the best first tool to call to " +
  "understand what the scene contains and how it is configured.";

/** Input schema — no parameters needed. */
export const inputSchema = z.object({});

/** Format an entity for the description. */
function describeEntity(e: Record<string, unknown>): string {
  const label = e["semanticId"] ? `"${e["semanticId"]}" (${e["entityId"]})` : e["entityId"];
  const pos = `at (${Math.round(e["x"] as number)}, ${Math.round(e["y"] as number)})`;
  const vis = e["visible"] ? "" : " [hidden]";
  const lock = e["locked"] ? " [locked]" : "";
  const topology = e["topology"] as Record<string, unknown> | undefined;
  const topo = topology
    ? `, topology: home=${(topology["home"] as string) ?? "none"}, waypoints=[${((topology["waypoints"] as string[]) ?? []).join(", ")}]`
    : "";
  return `  - ${label} ${pos}${vis}${lock}, layer=${e["layerId"]}, state=${e["activeState"]}${topo}`;
}

/** Format a choreography for the description. */
function describeChoreography(c: Record<string, unknown>): string {
  const wiredSignalTypes = (c["wiredSignalTypes"] ?? []) as string[];
  const trigger = wiredSignalTypes.length > 0
    ? `wired to: [${wiredSignalTypes.join(", ")}]`
    : `on: "${c["on"]}"`;
  const when = c["when"] ? `, when: ${JSON.stringify(c["when"])}` : "";
  const target = c["defaultTargetEntityId"] ? `, default target: "${c["defaultTargetEntityId"]}"` : "";
  const stepCount = c["stepCount"] as number;
  const stepTypes = (c["stepTypes"] ?? []) as string[];
  const steps = stepCount > 0
    ? `, ${stepCount} steps: [${stepTypes.join(" → ")}]`
    : ", no steps";
  const sources = (c["sources"] ?? []) as Array<Record<string, unknown>>;
  const sourcesStr = sources.length > 0
    ? `\n    sources: ${sources.map((s) => `${s["sourceId"]} via "${s["signalType"]}"`).join(", ")}`
    : "";
  return `  - ${c["id"]}: ${trigger}${when}${target}${steps}${sourcesStr}`;
}

/** Format a binding for the description. */
function describeBinding(b: Record<string, unknown>): string {
  const mapping = b["mapping"] ? `, mapping: ${JSON.stringify(b["mapping"])}` : "";
  const action = b["action"] ? `, action: ${JSON.stringify(b["action"])}` : "";
  const field = b["sourceField"] ? `, field: "${b["sourceField"]}"` : "";
  const transition = b["transition"] ? `, transition: ${JSON.stringify(b["transition"])}` : "";
  return `  - "${b["targetEntityId"]}".${b["property"]} ← choreo "${b["sourceChoreographyId"]}" (${b["sourceType"]})${field}${mapping}${transition}${action}`;
}

/** Format a signal source for the description. */
function describeSource(s: Record<string, unknown>): string {
  const statusStr = s["status"] as string;
  const status = statusStr === "connected" ? "CONNECTED" : statusStr.toUpperCase();
  const err = s["error"] ? ` (error: ${s["error"]})` : "";
  return `  - ${s["name"]} [${s["protocol"]}] ${status}${err} — ${s["category"]}`;
}

/** Format a wire for the description. */
function describeWire(w: Record<string, unknown>): string {
  return `  - ${w["fromZone"]}:${w["fromId"]} → ${w["toZone"]}:${w["toId"]}`;
}

/** Tool handler — reads all state from the store and builds a text description. */
export async function handler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  // Read all state synchronously from the store
  const sceneState = getSceneSnapshot();
  const choreosState = getChoreographies();
  const bindingsState = getBindings();
  const sourcesState = getSignalSources();
  const wiringState = getWiring();
  const editor = getEditor();

  const entities = (sceneState["entities"] ?? []) as Array<Record<string, unknown>>;
  const positions = (sceneState["positions"] ?? []) as Array<Record<string, unknown>>;
  const routes = (sceneState["routes"] ?? []) as Array<Record<string, unknown>>;
  const rawChoreos = (choreosState["choreographies"] ?? []) as Array<Record<string, unknown>>;
  const bindings = (bindingsState["bindings"] ?? []) as Array<Record<string, unknown>>;
  const sources = (sourcesState["sources"] ?? []) as Array<Record<string, unknown>>;
  const wires = (wiringState["wires"] ?? []) as Array<Record<string, unknown>>;

  // Enrich choreographies with wiring info
  const enrichedChoreos = rawChoreos.map((c) => {
    const id = c["id"] as string;
    const steps = (c["steps"] ?? []) as Array<Record<string, unknown>>;

    const incomingWires = wires.filter(
      (w) => w["toZone"] === "choreographer" && w["toId"] === id,
    );
    const wiredSignalTypes = incomingWires
      .filter((w) => w["fromZone"] === "signal-type")
      .map((w) => w["fromId"] as string);

    const choreoSources: Array<Record<string, unknown>> = [];
    for (const signalType of wiredSignalTypes) {
      const sourceWires = wires.filter(
        (w) => w["fromZone"] === "signal" && w["toZone"] === "signal-type" && w["toId"] === signalType,
      );
      for (const sw of sourceWires) {
        choreoSources.push({
          sourceId: sw["fromId"],
          signalType,
        });
      }
    }

    return {
      ...c,
      stepCount: steps.length,
      stepTypes: steps.map((s) => s["action"] as string),
      wiredSignalTypes,
      sources: choreoSources,
    };
  });

  // Build the description
  const lines: string[] = [];

  // Scene overview
  lines.push("# Scene Description");
  lines.push("");

  const d = sceneState["dimensions"] as Record<string, unknown> | null;
  lines.push(`## Canvas: ${d?.["width"] ?? "?"}×${d?.["height"] ?? "?"} px, mode: ${(editor["mode"] as string) ?? "unknown"}, view: ${(editor["viewMode"] as string) ?? "unknown"}`);
  lines.push("");

  // Entities
  if (entities.length > 0) {
    lines.push(`## Entities (${entities.length})`);
    for (const e of entities) {
      lines.push(describeEntity(e));
    }
  } else {
    lines.push("## Entities: none placed");
  }
  lines.push("");

  // Positions
  if (positions.length > 0) {
    lines.push(`## Positions (${positions.length})`);
    for (const p of positions) {
      lines.push(`  - "${p["name"]}" at (${Math.round(p["x"] as number)}, ${Math.round(p["y"] as number)}), type=${p["typeHint"]}${p["entityBinding"] ? `, bound to "${p["entityBinding"]}"` : ""}`);
    }
    lines.push("");
  }

  // Routes
  if (routes.length > 0) {
    lines.push(`## Routes (${routes.length})`);
    for (const r of routes) {
      const points = (r["points"] ?? []) as unknown[];
      lines.push(`  - "${r["name"]}" (${points.length} points, ${r["style"]}, ${r["bidirectional"] ? "bidirectional" : "one-way"})`);
    }
    lines.push("");
  }

  // Choreographies
  if (enrichedChoreos.length > 0) {
    lines.push(`## Choreographies (${enrichedChoreos.length})`);
    for (const c of enrichedChoreos) {
      lines.push(describeChoreography(c));
    }
  } else {
    lines.push("## Choreographies: none defined");
  }
  lines.push("");

  // Signal sources
  if (sources.length > 0) {
    lines.push(`## Signal Sources (${sources.length})`);
    for (const s of sources) {
      lines.push(describeSource(s));
    }
  } else {
    lines.push("## Signal Sources: none configured");
  }
  lines.push("");

  // Bindings
  if (bindings.length > 0) {
    lines.push(`## Bindings (${bindings.length})`);
    for (const b of bindings) {
      lines.push(describeBinding(b));
    }
  } else {
    lines.push("## Bindings: none");
  }
  lines.push("");

  // Wiring
  if (wires.length > 0) {
    lines.push(`## Wiring (${wires.length} connections)`);
    for (const w of wires) {
      lines.push(describeWire(w));
    }
  } else {
    lines.push("## Wiring: no connections");
  }

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
