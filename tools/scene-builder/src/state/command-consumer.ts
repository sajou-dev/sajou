/**
 * Command consumer — receives write commands from the Vite dev server via SSE.
 *
 * The MCP server (or any external tool) sends write commands via POST endpoints
 * (e.g. POST /api/scene/entities). The Vite dev server queues them and broadcasts
 * each command over SSE at /__commands__/stream. This module listens on that
 * stream and executes each command against the appropriate client-side store,
 * then ACKs so they are pruned from the queue.
 *
 * Falls back to polling GET /api/commands/pending if SSE fails to connect.
 *
 * This is the reverse channel of state-sync.ts: state-sync pushes state OUT,
 * command-consumer pulls commands IN.
 */

import { getSceneState, updateSceneState } from "./scene-state.js";
import { getChoreographyState, updateChoreographyState, removeChoreography } from "./choreography-state.js";
import { addWire, removeWire } from "./wiring-state.js";
import { addBinding, removeBinding } from "./binding-store.js";
import { addSource, removeSource } from "./signal-source-state.js";
import { getShaderState, addShader, updateShader, removeShader } from "../shader-editor/shader-state.js";
import type { ShaderDef, ShaderUniformDef, ShaderObjectDef } from "../shader-editor/shader-types.js";
import { getSketchState, addSketch, updateSketch, removeSketch } from "../sketch-editor/sketch-state.js";
import type { SketchDef, SketchParamDef } from "../sketch-editor/sketch-types.js";
import type { PlacedEntity, ChoreographyDef, ChoreographyStepDef, BindingValueType } from "../types.js";

/** Poll interval in milliseconds (fallback only). */
const POLL_MS = 500;

/** Timer handle for the fallback poll loop. */
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Active EventSource connection. */
let eventSource: EventSource | null = null;

/** Whether the SSE stream is currently connected. */
let sseConnected = false;

/** Shape of a command as returned by the server. */
interface PendingCommand {
  id: string;
  action: "add" | "remove" | "update" | "set-uniform" | "set-param";
  type: "entity" | "choreography" | "binding" | "wire" | "source" | "shader" | "p5";
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Command executors
// ---------------------------------------------------------------------------

/** Place, remove, or update an entity on the scene. */
function executeEntityCommand(action: string, data: Record<string, unknown>): void {
  const scene = getSceneState();

  if (action === "add") {
    const id = (data["id"] as string) ?? crypto.randomUUID();
    const entity: PlacedEntity = {
      id,
      entityId: data["entityId"] as string,
      x: (data["x"] as number) ?? 0,
      y: (data["y"] as number) ?? 0,
      scale: (data["scale"] as number) ?? 1,
      rotation: (data["rotation"] as number) ?? 0,
      layerId: (data["layerId"] as string) ?? "midground",
      zIndex: (data["zIndex"] as number) ?? 0,
      opacity: (data["opacity"] as number) ?? 1,
      flipH: (data["flipH"] as boolean) ?? false,
      flipV: (data["flipV"] as boolean) ?? false,
      locked: false,
      visible: true,
      activeState: (data["activeState"] as string) ?? "idle",
      semanticId: data["semanticId"] as string | undefined,
    };
    updateSceneState({ entities: [...scene.entities, entity] });
  } else if (action === "remove") {
    const id = data["id"] as string;
    updateSceneState({ entities: scene.entities.filter((e) => e.id !== id) });
  } else if (action === "update") {
    const id = data["id"] as string;
    updateSceneState({
      entities: scene.entities.map((e) =>
        e.id === id ? { ...e, ...data, id } : e,
      ),
    });
  }
}

/** Create or remove a choreography. */
function executeChoreographyCommand(action: string, data: Record<string, unknown>): void {
  const choreoState = getChoreographyState();

  if (action === "add") {
    const id = (data["id"] as string) ?? crypto.randomUUID();
    const rawSteps = (data["steps"] as Array<Record<string, unknown>>) ?? [];
    const steps: ChoreographyStepDef[] = rawSteps.map((s) => ({
      id: (s["id"] as string) ?? crypto.randomUUID(),
      action: s["action"] as string,
      entity: s["entity"] as string | undefined,
      target: s["target"] as string | undefined,
      delay: s["delay"] as number | undefined,
      duration: s["duration"] as number | undefined,
      easing: s["easing"] as string | undefined,
      params: (s["params"] as Record<string, unknown>) ?? {},
      children: s["children"] as ChoreographyStepDef[] | undefined,
    }));

    const choreo: ChoreographyDef = {
      id,
      on: (data["on"] as string) ?? "",
      when: data["when"] as ChoreographyDef["when"],
      interrupts: (data["interrupts"] as boolean) ?? false,
      steps,
      nodeX: (data["nodeX"] as number) ?? 100,
      nodeY: (data["nodeY"] as number) ?? 100,
      collapsed: false,
      defaultTargetEntityId: data["defaultTargetEntityId"] as string | undefined,
    };
    updateChoreographyState({
      choreographies: [...choreoState.choreographies, choreo],
    });
  } else if (action === "remove") {
    const id = data["id"] as string;
    removeChoreography(id);
  } else if (action === "update") {
    const id = data["id"] as string;
    updateChoreographyState({
      choreographies: choreoState.choreographies.map((c) =>
        c.id === id ? { ...c, ...data, id } : c,
      ),
    });
  }
}

/** Create or remove a binding. */
function executeBindingCommand(action: string, data: Record<string, unknown>): void {
  if (action === "add") {
    addBinding({
      targetEntityId: data["targetEntityId"] as string,
      property: data["property"] as string,
      sourceChoreographyId: data["sourceChoreographyId"] as string,
      sourceType: (data["sourceType"] as BindingValueType) ?? "event",
      mapping: data["mapping"] as undefined,
      action: data["action"] as undefined,
      sourceField: data["sourceField"] as string | undefined,
      transition: data["transition"] as undefined,
    });
  } else if (action === "remove") {
    const id = data["id"] as string;
    removeBinding(id);
  }
}

/** Create or remove a wire connection. */
function executeWireCommand(action: string, data: Record<string, unknown>): void {
  if (action === "add") {
    addWire({
      fromZone: data["fromZone"] as "signal" | "signal-type" | "choreographer",
      fromId: data["fromId"] as string,
      toZone: data["toZone"] as "signal-type" | "choreographer" | "theme" | "shader",
      toId: data["toId"] as string,
      mapping: data["mapping"] as undefined,
    });
  } else if (action === "remove") {
    const id = data["id"] as string;
    removeWire(id);
  }
}

/** Add or remove a signal source. */
function executeSourceCommand(action: string, data: Record<string, unknown>): void {
  if (action === "add") {
    addSource(data["name"] as string | undefined);
  } else if (action === "remove") {
    const id = data["id"] as string;
    removeSource(id);
  }
}

/** Add, update, remove a shader or set a uniform value. */
function executeShaderCommand(action: string, data: Record<string, unknown>): void {
  if (action === "add") {
    const id = (data["id"] as string) ?? crypto.randomUUID();
    const rawUniforms = (data["uniforms"] as Array<Record<string, unknown>>) ?? [];
    const uniforms: ShaderUniformDef[] = rawUniforms.map((u) => ({
      name: u["name"] as string,
      type: (u["type"] as ShaderUniformDef["type"]) ?? "float",
      control: (u["control"] as ShaderUniformDef["control"]) ?? "slider",
      value: u["value"] as number | boolean | number[],
      defaultValue: (u["defaultValue"] ?? u["value"]) as number | boolean | number[],
      min: (u["min"] as number) ?? 0,
      max: (u["max"] as number) ?? 1,
      step: (u["step"] as number) ?? 0.01,
      objectId: u["objectId"] as string | undefined,
      bind: u["bind"] as ShaderUniformDef["bind"],
    }));
    const rawObjects = (data["objects"] as Array<Record<string, unknown>>) ?? [];
    const objects: ShaderObjectDef[] = rawObjects.map((o) => ({
      id: o["id"] as string,
      label: o["label"] as string,
    }));

    const shader: ShaderDef = {
      id,
      name: (data["name"] as string) ?? "Untitled",
      mode: "glsl",
      vertexSource: (data["vertexSource"] as string) ?? "",
      fragmentSource: (data["fragmentSource"] as string) ?? "",
      uniforms,
      objects,
      passes: (data["passes"] as number) ?? 1,
      bufferResolution: (data["bufferResolution"] as number) ?? 0,
    };
    addShader(shader);
  } else if (action === "update") {
    const id = data["id"] as string;
    const partial: Partial<ShaderDef> = {};
    if (data["name"] !== undefined) partial.name = data["name"] as string;
    if (data["fragmentSource"] !== undefined) partial.fragmentSource = data["fragmentSource"] as string;
    if (data["vertexSource"] !== undefined) partial.vertexSource = data["vertexSource"] as string;
    if (data["passes"] !== undefined) partial.passes = data["passes"] as number;
    if (data["bufferResolution"] !== undefined) partial.bufferResolution = data["bufferResolution"] as number;
    if (data["uniforms"] !== undefined) {
      const rawUniforms = data["uniforms"] as Array<Record<string, unknown>>;
      partial.uniforms = rawUniforms.map((u) => ({
        name: u["name"] as string,
        type: (u["type"] as ShaderUniformDef["type"]) ?? "float",
        control: (u["control"] as ShaderUniformDef["control"]) ?? "slider",
        value: u["value"] as number | boolean | number[],
        defaultValue: (u["defaultValue"] ?? u["value"]) as number | boolean | number[],
        min: (u["min"] as number) ?? 0,
        max: (u["max"] as number) ?? 1,
        step: (u["step"] as number) ?? 0.01,
        objectId: u["objectId"] as string | undefined,
        bind: u["bind"] as ShaderUniformDef["bind"],
      }));
    }
    if (data["objects"] !== undefined) {
      const rawObjects = data["objects"] as Array<Record<string, unknown>>;
      partial.objects = rawObjects.map((o) => ({
        id: o["id"] as string,
        label: o["label"] as string,
      }));
    }
    updateShader(id, partial);
  } else if (action === "remove") {
    const id = data["id"] as string;
    removeShader(id);
  } else if (action === "set-uniform") {
    const id = data["id"] as string;
    const uniformName = data["uniformName"] as string;
    const value = data["value"] as number | boolean | number[];
    // Update just the target uniform's value in the shader's uniforms array
    const shader = getShaderState().shaders.find((s) => s.id === id);
    if (!shader) return;
    const updatedUniforms = shader.uniforms.map((u) =>
      u.name === uniformName ? { ...u, value } : u,
    );
    updateShader(id, { uniforms: updatedUniforms });
  }
}

/** Add, update, remove a p5 sketch or set a param value. */
function executeP5Command(action: string, data: Record<string, unknown>): void {
  if (action === "add") {
    const id = (data["id"] as string) ?? crypto.randomUUID();
    const rawParams = (data["params"] as Array<Record<string, unknown>>) ?? [];
    const params: SketchParamDef[] = rawParams.map((p) => ({
      name: p["name"] as string,
      type: (p["type"] as SketchParamDef["type"]) ?? "float",
      control: (p["control"] as SketchParamDef["control"]) ?? "slider",
      value: p["value"] as number | boolean | number[],
      defaultValue: (p["defaultValue"] ?? p["value"]) as number | boolean | number[],
      min: (p["min"] as number) ?? 0,
      max: (p["max"] as number) ?? 1,
      step: (p["step"] as number) ?? 0.01,
      bind: p["bind"] as SketchParamDef["bind"],
    }));

    const sketch: SketchDef = {
      id,
      name: (data["name"] as string) ?? "Untitled",
      source: (data["source"] as string) ?? "",
      params,
      width: (data["width"] as number) ?? 0,
      height: (data["height"] as number) ?? 0,
    };
    addSketch(sketch);
  } else if (action === "update") {
    const id = data["id"] as string;
    const partial: Partial<SketchDef> = {};
    if (data["name"] !== undefined) partial.name = data["name"] as string;
    if (data["source"] !== undefined) partial.source = data["source"] as string;
    if (data["width"] !== undefined) partial.width = data["width"] as number;
    if (data["height"] !== undefined) partial.height = data["height"] as number;
    if (data["params"] !== undefined) {
      const rawParams = data["params"] as Array<Record<string, unknown>>;
      partial.params = rawParams.map((p) => ({
        name: p["name"] as string,
        type: (p["type"] as SketchParamDef["type"]) ?? "float",
        control: (p["control"] as SketchParamDef["control"]) ?? "slider",
        value: p["value"] as number | boolean | number[],
        defaultValue: (p["defaultValue"] ?? p["value"]) as number | boolean | number[],
        min: (p["min"] as number) ?? 0,
        max: (p["max"] as number) ?? 1,
        step: (p["step"] as number) ?? 0.01,
        bind: p["bind"] as SketchParamDef["bind"],
      }));
    }
    updateSketch(id, partial);
  } else if (action === "remove") {
    const id = data["id"] as string;
    removeSketch(id);
  } else if (action === "set-param") {
    const id = data["id"] as string;
    const paramName = data["paramName"] as string;
    const value = data["value"] as number | boolean | number[];
    // Update just the target param's value in the sketch's params array
    const sketch = getSketchState().sketches.find((s) => s.id === id);
    if (!sketch) return;
    const updatedParams = sketch.params.map((p) =>
      p.name === paramName ? { ...p, value } : p,
    );
    updateSketch(id, { params: updatedParams });
  }
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

/** Execute a single command against the appropriate store. */
function executeCommand(cmd: PendingCommand): void {
  switch (cmd.type) {
    case "entity":
      executeEntityCommand(cmd.action, cmd.data);
      break;
    case "choreography":
      executeChoreographyCommand(cmd.action, cmd.data);
      break;
    case "binding":
      executeBindingCommand(cmd.action, cmd.data);
      break;
    case "wire":
      executeWireCommand(cmd.action, cmd.data);
      break;
    case "source":
      executeSourceCommand(cmd.action, cmd.data);
      break;
    case "shader":
      executeShaderCommand(cmd.action, cmd.data);
      break;
    case "p5":
      executeP5Command(cmd.action, cmd.data);
      break;
  }
}

// ---------------------------------------------------------------------------
// ACK helper
// ---------------------------------------------------------------------------

/** Acknowledge processed command IDs so the server prunes them. */
function ackCommands(ids: string[]): void {
  if (ids.length === 0) return;
  fetch("/api/commands/ack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  }).catch(() => {
    // Silently ignore ACK failures — command was already executed client-side
  });
}

// ---------------------------------------------------------------------------
// SSE stream
// ---------------------------------------------------------------------------

/** Connect to the command SSE stream and process commands in real-time. */
function connectSSE(): void {
  const es = new EventSource("/__commands__/stream");
  eventSource = es;

  es.addEventListener("command", (event: MessageEvent) => {
    try {
      const cmd = JSON.parse(event.data as string) as PendingCommand;
      executeCommand(cmd);
      ackCommands([cmd.id]);
    } catch (e) {
      console.error("[command-consumer] Failed to process SSE command:", e);
    }
  });

  es.addEventListener("open", () => {
    if (!sseConnected) {
      console.log("[command-consumer] SSE connected — real-time command streaming active");
      sseConnected = true;
    }
    // Stop fallback polling when SSE is connected
    stopPolling();
  });

  es.addEventListener("error", () => {
    if (sseConnected) {
      console.warn("[command-consumer] SSE disconnected — falling back to polling");
      sseConnected = false;
    }
    // EventSource will auto-reconnect, but start polling as fallback in the meantime
    startPolling();
  });
}

// ---------------------------------------------------------------------------
// Fallback poll loop
// ---------------------------------------------------------------------------

/** Fetch pending commands and execute them. */
async function pollCommands(): Promise<void> {
  try {
    const resp = await fetch("/api/commands/pending", {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return;

    const body = (await resp.json()) as { ok: boolean; commands: PendingCommand[] };
    if (!body.ok || !body.commands.length) return;

    const ackIds: string[] = [];

    for (const cmd of body.commands) {
      try {
        executeCommand(cmd);
        ackIds.push(cmd.id);
      } catch (e) {
        console.error("[command-consumer] Failed to execute command:", cmd.id, e);
        // Still ACK to prevent stuck commands — the error is logged client-side
        ackIds.push(cmd.id);
      }
    }

    ackCommands(ackIds);
  } catch {
    // Silently ignore poll failures (server might be restarting)
  }
}

/** Start the fallback polling loop (if not already running). */
function startPolling(): void {
  if (pollTimer !== null) return;
  pollTimer = setInterval(() => { pollCommands(); }, POLL_MS);
  pollCommands();
}

/** Stop the fallback polling loop. */
function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the command consumer — connects via SSE with polling fallback.
 *
 * Call this AFTER all stores are initialized (alongside initStateSync).
 */
export function initCommandConsumer(): void {
  if (eventSource !== null || pollTimer !== null) return; // Already running
  connectSSE();
}

/**
 * Stop the command consumer (SSE + polling).
 */
export function stopCommandConsumer(): void {
  if (eventSource !== null) {
    eventSource.close();
    eventSource = null;
    sseConnected = false;
  }
  stopPolling();
}
