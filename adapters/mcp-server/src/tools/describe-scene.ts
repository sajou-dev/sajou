/**
 * describe_scene tool — comprehensive human/AI-readable scene description.
 *
 * This is the first tool an AI agent should call to understand the current
 * scene. It fetches all state and produces a structured text summary of
 * entities, choreographies, signal sources, bindings, and wiring.
 */

import { z } from "zod";
import {
  getSceneState,
  getChoreographies,
  getBindings,
  getSignalSources,
  getWiring,
  ping,
  type SceneEntity,
  type ChoreographySummary,
  type BindingData,
  type SignalSourceData,
  type WireData,
} from "../bridge.js";

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
function describeEntity(e: SceneEntity): string {
  const label = e.semanticId ? `"${e.semanticId}" (${e.entityId})` : e.entityId;
  const pos = `at (${Math.round(e.x)}, ${Math.round(e.y)})`;
  const vis = e.visible ? "" : " [hidden]";
  const lock = e.locked ? " [locked]" : "";
  const topo = e.topology
    ? `, topology: home=${e.topology.home ?? "none"}, waypoints=[${e.topology.waypoints.join(", ")}]`
    : "";
  return `  - ${label} ${pos}${vis}${lock}, layer=${e.layerId}, state=${e.activeState}${topo}`;
}

/** Format a choreography for the description. */
function describeChoreography(c: ChoreographySummary): string {
  const trigger = c.wiredSignalTypes.length > 0
    ? `wired to: [${c.wiredSignalTypes.join(", ")}]`
    : `on: "${c.on}"`;
  const when = c.when ? `, when: ${JSON.stringify(c.when)}` : "";
  const target = c.defaultTargetEntityId ? `, default target: "${c.defaultTargetEntityId}"` : "";
  const steps = c.stepCount > 0
    ? `, ${c.stepCount} steps: [${c.stepTypes.join(" → ")}]`
    : ", no steps";
  const sources = c.sources.length > 0
    ? `\n    sources: ${c.sources.map((s) => `${s.sourceId} via "${s.signalType}"`).join(", ")}`
    : "";
  return `  - ${c.id}: ${trigger}${when}${target}${steps}${sources}`;
}

/** Format a binding for the description. */
function describeBinding(b: BindingData): string {
  const mapping = b.mapping ? `, mapping: ${JSON.stringify(b.mapping)}` : "";
  const action = b.action ? `, action: ${JSON.stringify(b.action)}` : "";
  const field = b.sourceField ? `, field: "${b.sourceField}"` : "";
  const transition = b.transition ? `, transition: ${JSON.stringify(b.transition)}` : "";
  return `  - "${b.targetEntityId}".${b.property} ← choreo "${b.sourceChoreographyId}" (${b.sourceType})${field}${mapping}${transition}${action}`;
}

/** Format a signal source for the description. */
function describeSource(s: SignalSourceData): string {
  const status = s.status === "connected" ? "CONNECTED" : s.status.toUpperCase();
  const err = s.error ? ` (error: ${s.error})` : "";
  return `  - ${s.name} [${s.protocol}] ${status}${err} — ${s.category}`;
}

/** Format a wire for the description. */
function describeWire(w: WireData): string {
  return `  - ${w.fromZone}:${w.fromId} → ${w.toZone}:${w.toId}`;
}

/** Tool handler — fetches all state and builds a text description. */
export async function handler(): Promise<{
  content: Array<{ type: "text"; text: string }>;
}> {
  // Fetch all state in parallel
  const [sceneState, choreographies, bindings, sources, wires] =
    await Promise.all([
      getSceneState(),
      getChoreographies(),
      getBindings(),
      getSignalSources(),
      getWiring(),
    ]);

  // Check if anything came back
  if (
    sceneState === null &&
    choreographies === null &&
    bindings === null &&
    sources === null &&
    wires === null
  ) {
    const isRunning = await ping();
    const message = isRunning
      ? "Scene-builder is running but no state has been synced yet. Open the scene-builder UI — state syncs automatically when the page loads."
      : "Scene-builder is not running. Start it with: cd tools/scene-builder && pnpm dev";

    return {
      content: [{ type: "text" as const, text: message }],
    };
  }

  // Build the description
  const lines: string[] = [];

  // Scene overview
  lines.push("# Scene Description");
  lines.push("");

  if (sceneState) {
    const d = sceneState.dimensions;
    lines.push(`## Canvas: ${d?.width ?? "?"}×${d?.height ?? "?"} px, mode: ${sceneState.mode ?? "unknown"}, view: ${sceneState.viewMode ?? "unknown"}`);
    lines.push("");

    // Entities
    const entities = sceneState.entities;
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
    if (sceneState.positions.length > 0) {
      lines.push(`## Positions (${sceneState.positions.length})`);
      for (const p of sceneState.positions) {
        lines.push(`  - "${p.name}" at (${Math.round(p.x)}, ${Math.round(p.y)}), type=${p.typeHint}${p.entityBinding ? `, bound to "${p.entityBinding}"` : ""}`);
      }
      lines.push("");
    }

    // Routes
    if (sceneState.routes.length > 0) {
      lines.push(`## Routes (${sceneState.routes.length})`);
      for (const r of sceneState.routes) {
        lines.push(`  - "${r.name}" (${r.points.length} points, ${r.style}, ${r.bidirectional ? "bidirectional" : "one-way"})`);
      }
      lines.push("");
    }
  }

  // Choreographies
  if (choreographies && choreographies.length > 0) {
    lines.push(`## Choreographies (${choreographies.length})`);
    for (const c of choreographies) {
      lines.push(describeChoreography(c));
    }
  } else {
    lines.push("## Choreographies: none defined");
  }
  lines.push("");

  // Signal sources
  if (sources && sources.length > 0) {
    lines.push(`## Signal Sources (${sources.length})`);
    for (const s of sources) {
      lines.push(describeSource(s));
    }
  } else {
    lines.push("## Signal Sources: none configured");
  }
  lines.push("");

  // Bindings
  if (bindings && bindings.length > 0) {
    lines.push(`## Bindings (${bindings.length})`);
    for (const b of bindings) {
      lines.push(describeBinding(b));
    }
  } else {
    lines.push("## Bindings: none");
  }
  lines.push("");

  // Wiring
  if (wires && wires.length > 0) {
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
