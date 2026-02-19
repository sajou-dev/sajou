/**
 * Server-side mutations — direct state modifications.
 *
 * Each function modifies the in-memory store and triggers subscriber
 * notifications. These replace the old command-queue → browser round-trip.
 */

import { mutate, getShaders, getP5 } from "./store.js";

// ---------------------------------------------------------------------------
// Entity mutations
// ---------------------------------------------------------------------------

/** Place a new entity on the scene. */
export function addEntity(data: Record<string, unknown>): void {
  mutate((s) => {
    const entities = (s.scene["entities"] ?? []) as Array<Record<string, unknown>>;
    entities.push({
      id: data["id"] ?? crypto.randomUUID(),
      entityId: data["entityId"],
      semanticId: data["semanticId"],
      x: data["x"] ?? 0,
      y: data["y"] ?? 0,
      scale: data["scale"] ?? 1,
      rotation: data["rotation"] ?? 0,
      layerId: data["layerId"] ?? "midground",
      zIndex: data["zIndex"] ?? 0,
      opacity: data["opacity"] ?? 1,
      flipH: data["flipH"] ?? false,
      flipV: data["flipV"] ?? false,
      locked: data["locked"] ?? false,
      visible: data["visible"] ?? true,
      activeState: data["activeState"] ?? "idle",
    });
    s.scene["entities"] = entities;
  });
}

/** Remove an entity by instance ID. */
export function removeEntity(id: string): void {
  mutate((s) => {
    const entities = (s.scene["entities"] ?? []) as Array<Record<string, unknown>>;
    s.scene["entities"] = entities.filter((e) => e["id"] !== id);
  });
}

/** Update an entity by spreading partial data. */
export function updateEntity(id: string, data: Record<string, unknown>): void {
  mutate((s) => {
    const entities = (s.scene["entities"] ?? []) as Array<Record<string, unknown>>;
    s.scene["entities"] = entities.map((e) =>
      e["id"] === id ? { ...e, ...data } : e,
    );
  });
}

// ---------------------------------------------------------------------------
// Choreography mutations
// ---------------------------------------------------------------------------

/** Add a choreography definition. */
export function addChoreography(data: Record<string, unknown>): void {
  mutate((s) => {
    const choreos = (s.choreographies["choreographies"] ?? []) as Array<Record<string, unknown>>;
    choreos.push({
      id: data["id"] ?? crypto.randomUUID(),
      on: data["on"] ?? "",
      when: data["when"] ?? null,
      interrupts: data["interrupts"] ?? false,
      steps: data["steps"] ?? [],
      nodeX: data["nodeX"] ?? 0,
      nodeY: data["nodeY"] ?? 0,
      collapsed: data["collapsed"] ?? false,
      defaultTargetEntityId: data["defaultTargetEntityId"] ?? null,
    });
    s.choreographies["choreographies"] = choreos;
  });
}

/** Remove a choreography by ID. Also removes wires targeting it. */
export function removeChoreography(id: string): void {
  mutate((s) => {
    const choreos = (s.choreographies["choreographies"] ?? []) as Array<Record<string, unknown>>;
    s.choreographies["choreographies"] = choreos.filter((c) => c["id"] !== id);

    // Clean up wires targeting this choreography
    const wires = (s.wiring["wires"] ?? []) as Array<Record<string, unknown>>;
    s.wiring["wires"] = wires.filter(
      (w) => !(w["toZone"] === "choreographer" && w["toId"] === id),
    );
  });
}

/** Update a choreography by spreading partial data. */
export function updateChoreography(id: string, data: Record<string, unknown>): void {
  mutate((s) => {
    const choreos = (s.choreographies["choreographies"] ?? []) as Array<Record<string, unknown>>;
    s.choreographies["choreographies"] = choreos.map((c) =>
      c["id"] === id ? { ...c, ...data } : c,
    );
  });
}

// ---------------------------------------------------------------------------
// Binding mutations
// ---------------------------------------------------------------------------

/** Add a binding. */
export function addBinding(data: Record<string, unknown>): void {
  mutate((s) => {
    const bindings = (s.bindings["bindings"] ?? []) as Array<Record<string, unknown>>;
    bindings.push({
      id: data["id"] ?? crypto.randomUUID(),
      targetEntityId: data["targetEntityId"],
      property: data["property"],
      sourceChoreographyId: data["sourceChoreographyId"],
      sourceType: data["sourceType"] ?? "direct",
      mapping: data["mapping"],
      action: data["action"],
      sourceField: data["sourceField"],
      transition: data["transition"],
    });
    s.bindings["bindings"] = bindings;
  });
}

/** Remove a binding by ID. */
export function removeBinding(id: string): void {
  mutate((s) => {
    const bindings = (s.bindings["bindings"] ?? []) as Array<Record<string, unknown>>;
    s.bindings["bindings"] = bindings.filter((b) => b["id"] !== id);
  });
}

// ---------------------------------------------------------------------------
// Wire mutations
// ---------------------------------------------------------------------------

/** Add a wire connection. */
export function addWire(data: Record<string, unknown>): void {
  mutate((s) => {
    const wires = (s.wiring["wires"] ?? []) as Array<Record<string, unknown>>;
    wires.push({
      id: data["id"] ?? crypto.randomUUID(),
      fromZone: data["fromZone"],
      fromId: data["fromId"],
      toZone: data["toZone"],
      toId: data["toId"],
      mapping: data["mapping"] ?? null,
    });
    s.wiring["wires"] = wires;
  });
}

/** Remove a wire by ID. */
export function removeWire(id: string): void {
  mutate((s) => {
    const wires = (s.wiring["wires"] ?? []) as Array<Record<string, unknown>>;
    s.wiring["wires"] = wires.filter((w) => w["id"] !== id);
  });
}

// ---------------------------------------------------------------------------
// Signal source mutations
// ---------------------------------------------------------------------------

/** Add a signal source. */
export function addSignalSource(data: Record<string, unknown>): void {
  mutate((s) => {
    const sources = (s.signalSources["sources"] ?? []) as Array<Record<string, unknown>>;
    sources.push({
      id: data["id"] ?? crypto.randomUUID(),
      name: data["name"] ?? "New Source",
      protocol: data["protocol"] ?? "websocket",
      url: data["url"] ?? "",
      status: data["status"] ?? "disconnected",
      error: null,
      category: data["category"] ?? "remote",
      eventsPerSecond: 0,
      streaming: false,
    });
    s.signalSources["sources"] = sources;
  });
}

/** Remove a signal source by ID. Also removes its wires. */
export function removeSignalSource(id: string): void {
  mutate((s) => {
    const sources = (s.signalSources["sources"] ?? []) as Array<Record<string, unknown>>;
    s.signalSources["sources"] = sources.filter((src) => src["id"] !== id);

    // Clean up wires from this source
    const wires = (s.wiring["wires"] ?? []) as Array<Record<string, unknown>>;
    s.wiring["wires"] = wires.filter(
      (w) => !(w["fromZone"] === "signal" && w["fromId"] === id),
    );
  });
}

// ---------------------------------------------------------------------------
// Shader mutations
// ---------------------------------------------------------------------------

/** Shader uniform definition shape. */
interface ShaderUniformDef {
  name: string;
  type: string;
  control: string;
  value: number | boolean | number[];
  defaultValue: number | boolean | number[];
  min: number;
  max: number;
  step: number;
  objectId?: string;
  bind?: { semantic: string };
}

/** Shader object definition shape. */
interface ShaderObjectDef {
  id: string;
  label: string;
}

/** Parse raw uniform data from an API call. */
function parseUniforms(raw: Array<Record<string, unknown>>): ShaderUniformDef[] {
  return raw.map((u) => ({
    name: u["name"] as string,
    type: (u["type"] as string) ?? "float",
    control: (u["control"] as string) ?? "slider",
    value: u["value"] as number | boolean | number[],
    defaultValue: (u["defaultValue"] ?? u["value"]) as number | boolean | number[],
    min: (u["min"] as number) ?? 0,
    max: (u["max"] as number) ?? 1,
    step: (u["step"] as number) ?? 0.01,
    objectId: u["objectId"] as string | undefined,
    bind: u["bind"] as ShaderUniformDef["bind"],
  }));
}

/** Parse raw object data from an API call. */
function parseObjects(raw: Array<Record<string, unknown>>): ShaderObjectDef[] {
  return raw.map((o) => ({
    id: o["id"] as string,
    label: o["label"] as string,
  }));
}

/** Add a shader. */
export function addShader(data: Record<string, unknown>): void {
  const rawUniforms = (data["uniforms"] as Array<Record<string, unknown>>) ?? [];
  const rawObjects = (data["objects"] as Array<Record<string, unknown>>) ?? [];

  mutate((s) => {
    const shaders = (s.shaders["shaders"] ?? []) as Array<Record<string, unknown>>;
    shaders.push({
      id: data["id"] ?? crypto.randomUUID(),
      name: data["name"] ?? "Untitled",
      mode: data["mode"] ?? "fragment",
      vertexSource: data["vertexSource"] ?? "",
      fragmentSource: data["fragmentSource"] ?? "",
      uniforms: parseUniforms(rawUniforms),
      objects: parseObjects(rawObjects),
      passes: data["passes"] ?? 1,
      bufferResolution: data["bufferResolution"] ?? 1,
    });
    s.shaders["shaders"] = shaders;
  });
}

/** Update an existing shader. */
export function updateShader(id: string, data: Record<string, unknown>): void {
  mutate((s) => {
    const shaders = (s.shaders["shaders"] ?? []) as Array<Record<string, unknown>>;
    s.shaders["shaders"] = shaders.map((shader) => {
      if (shader["id"] !== id) return shader;

      const partial: Record<string, unknown> = {};
      if (data["name"] !== undefined) partial["name"] = data["name"];
      if (data["mode"] !== undefined) partial["mode"] = data["mode"];
      if (data["vertexSource"] !== undefined) partial["vertexSource"] = data["vertexSource"];
      if (data["fragmentSource"] !== undefined) partial["fragmentSource"] = data["fragmentSource"];
      if (data["passes"] !== undefined) partial["passes"] = data["passes"];
      if (data["bufferResolution"] !== undefined) partial["bufferResolution"] = data["bufferResolution"];
      if (data["uniforms"] !== undefined) {
        partial["uniforms"] = parseUniforms(data["uniforms"] as Array<Record<string, unknown>>);
      }
      if (data["objects"] !== undefined) {
        partial["objects"] = parseObjects(data["objects"] as Array<Record<string, unknown>>);
      }

      return { ...shader, ...partial };
    });
  });
}

/** Remove a shader by ID. */
export function removeShader(id: string): void {
  mutate((s) => {
    const shaders = (s.shaders["shaders"] ?? []) as Array<Record<string, unknown>>;
    s.shaders["shaders"] = shaders.filter((shader) => shader["id"] !== id);
  });
}

/** Set a single uniform value on a shader. */
export function setUniform(shaderId: string, uniformName: string, value: number | boolean | number[]): void {
  const shadersState = getShaders();
  const shaders = (shadersState["shaders"] ?? []) as Array<Record<string, unknown>>;
  const shader = shaders.find((s) => s["id"] === shaderId);
  if (!shader) return;

  const uniforms = (shader["uniforms"] ?? []) as ShaderUniformDef[];
  const updatedUniforms = uniforms.map((u) =>
    u.name === uniformName ? { ...u, value } : u,
  );
  updateShader(shaderId, { uniforms: updatedUniforms });
}

// ---------------------------------------------------------------------------
// p5 sketch mutations
// ---------------------------------------------------------------------------

/** p5 param definition shape. */
interface P5ParamDef {
  name: string;
  type: string;
  control: string;
  value: number | boolean | number[];
  defaultValue: number | boolean | number[];
  min: number;
  max: number;
  step: number;
  bind?: { semantic: string };
}

/** Parse raw param data from an API call. */
function parseP5Params(raw: Array<Record<string, unknown>>): P5ParamDef[] {
  return raw.map((p) => ({
    name: p["name"] as string,
    type: (p["type"] as string) ?? "float",
    control: (p["control"] as string) ?? "slider",
    value: p["value"] as number | boolean | number[],
    defaultValue: (p["defaultValue"] ?? p["value"]) as number | boolean | number[],
    min: (p["min"] as number) ?? 0,
    max: (p["max"] as number) ?? 1,
    step: (p["step"] as number) ?? 0.01,
    bind: p["bind"] as P5ParamDef["bind"],
  }));
}

/** Add a p5 sketch. */
export function addP5Sketch(data: Record<string, unknown>): void {
  const rawParams = (data["params"] as Array<Record<string, unknown>>) ?? [];

  mutate((s) => {
    const sketches = (s.p5["sketches"] ?? []) as Array<Record<string, unknown>>;
    sketches.push({
      id: data["id"] ?? crypto.randomUUID(),
      name: data["name"] ?? "Untitled",
      source: data["source"] ?? "",
      params: parseP5Params(rawParams),
      width: data["width"] ?? 0,
      height: data["height"] ?? 0,
    });
    s.p5["sketches"] = sketches;
  });
}

/** Update a p5 sketch. */
export function updateP5Sketch(id: string, data: Record<string, unknown>): void {
  mutate((s) => {
    const sketches = (s.p5["sketches"] ?? []) as Array<Record<string, unknown>>;
    s.p5["sketches"] = sketches.map((sketch) => {
      if (sketch["id"] !== id) return sketch;

      const partial: Record<string, unknown> = {};
      if (data["name"] !== undefined) partial["name"] = data["name"];
      if (data["source"] !== undefined) partial["source"] = data["source"];
      if (data["width"] !== undefined) partial["width"] = data["width"];
      if (data["height"] !== undefined) partial["height"] = data["height"];
      if (data["params"] !== undefined) {
        partial["params"] = parseP5Params(data["params"] as Array<Record<string, unknown>>);
      }

      return { ...sketch, ...partial };
    });
  });
}

/** Remove a p5 sketch by ID. */
export function removeP5Sketch(id: string): void {
  mutate((s) => {
    const sketches = (s.p5["sketches"] ?? []) as Array<Record<string, unknown>>;
    s.p5["sketches"] = sketches.filter((sketch) => sketch["id"] !== id);
  });
}

/** Set a single param value on a p5 sketch. */
export function setP5Param(sketchId: string, paramName: string, value: number | boolean | number[]): void {
  const p5State = getP5();
  const sketches = (p5State["sketches"] ?? []) as Array<Record<string, unknown>>;
  const sketch = sketches.find((s) => s["id"] === sketchId);
  if (!sketch) return;

  const params = (sketch["params"] ?? []) as P5ParamDef[];
  const updatedParams = params.map((p) =>
    p.name === paramName ? { ...p, value } : p,
  );
  updateP5Sketch(sketchId, { params: updatedParams });
}

// ---------------------------------------------------------------------------
// Generic command dispatch (for browser SSE command compatibility)
// ---------------------------------------------------------------------------

/** Execute a command in the same format as the old command-queue. */
export function executeCommand(cmd: {
  action: string;
  type: string;
  data: Record<string, unknown>;
}): void {
  const { action, type, data } = cmd;

  switch (type) {
    case "entity":
      if (action === "add") addEntity(data);
      else if (action === "remove") removeEntity(data["id"] as string);
      else if (action === "update") updateEntity(data["id"] as string, data);
      break;
    case "choreography":
      if (action === "add") addChoreography(data);
      else if (action === "remove") removeChoreography(data["id"] as string);
      else if (action === "update") updateChoreography(data["id"] as string, data);
      break;
    case "binding":
      if (action === "add") addBinding(data);
      else if (action === "remove") removeBinding(data["id"] as string);
      break;
    case "wire":
      if (action === "add") addWire(data);
      else if (action === "remove") removeWire(data["id"] as string);
      break;
    case "source":
      if (action === "add") addSignalSource(data);
      else if (action === "remove") removeSignalSource(data["id"] as string);
      break;
    case "shader":
      if (action === "add") addShader(data);
      else if (action === "update") updateShader(data["id"] as string, data);
      else if (action === "remove") removeShader(data["id"] as string);
      else if (action === "set-uniform") setUniform(data["id"] as string, data["uniformName"] as string, data["value"] as number | boolean | number[]);
      break;
    case "p5":
      if (action === "add") addP5Sketch(data);
      else if (action === "update") updateP5Sketch(data["id"] as string, data);
      else if (action === "remove") removeP5Sketch(data["id"] as string);
      else if (action === "set-param") setP5Param(data["id"] as string, data["paramName"] as string, data["value"] as number | boolean | number[]);
      break;
  }
}
