/**
 * Action input schemas — declares the ISF-typed inputs for each built-in action.
 *
 * Each action's schema defines:
 * - common: fields like entity, duration, easing (auto-displayed)
 * - params: action-specific parameters (auto-generated controls)
 *
 * Unknown actions fall back to a raw JSON editor.
 */

import type { ActionInputSchema, InputDeclaration } from "./input-types.js";

// ---------------------------------------------------------------------------
// Shared input fragments
// ---------------------------------------------------------------------------

const ENTITY_INPUT: InputDeclaration = {
  type: "entity-ref",
  key: "entity",
  label: "Entity",
  allowSignalRef: true,
  placeholder: "agent, signal.to, ...",
};

const TARGET_INPUT: InputDeclaration = {
  type: "entity-ref",
  key: "target",
  label: "Target",
  allowSignalRef: true,
  placeholder: "signal.to, stage, ...",
};

const DURATION_INPUT: InputDeclaration = {
  type: "duration",
  key: "duration",
  label: "Duration",
  min: 0,
  max: 10000,
  default: 500,
};

const DELAY_INPUT: InputDeclaration = {
  type: "duration",
  key: "delay",
  label: "Delay",
  min: 0,
  max: 5000,
  default: 0,
};

const EASING_INPUT: InputDeclaration = {
  type: "easing",
  key: "easing",
  label: "Easing",
  default: "linear",
};

// ---------------------------------------------------------------------------
// Action schemas
// ---------------------------------------------------------------------------

const MOVE_SCHEMA: ActionInputSchema = {
  action: "move",
  common: [ENTITY_INPUT, DELAY_INPUT, DURATION_INPUT, EASING_INPUT],
  params: [
    {
      type: "position-ref",
      key: "to",
      label: "To",
      allowSignalRef: true,
      placeholder: "signal.to, forge, ...",
    },
    { type: "string", key: "animationDuring", label: "Anim. during", placeholder: "walk, run, ..." },
    { type: "string", key: "animationOnArrival", label: "Anim. arrival", placeholder: "idle, ..." },
  ],
};

const FLY_SCHEMA: ActionInputSchema = {
  action: "fly",
  common: [ENTITY_INPUT, DELAY_INPUT, DURATION_INPUT, EASING_INPUT],
  params: [
    {
      type: "position-ref",
      key: "to",
      label: "To",
      allowSignalRef: true,
      placeholder: "signal.to, forge, ...",
    },
    { type: "string", key: "animationDuring", label: "Anim. during", placeholder: "walk, run, ..." },
    { type: "string", key: "animationOnArrival", label: "Anim. arrival", placeholder: "idle, ..." },
  ],
};

const SPAWN_SCHEMA: ActionInputSchema = {
  action: "spawn",
  common: [ENTITY_INPUT, DELAY_INPUT],
  params: [
    {
      type: "position-ref",
      key: "at",
      label: "At",
      allowSignalRef: true,
      placeholder: "signal.from, base, ...",
    },
  ],
};

const DESTROY_SCHEMA: ActionInputSchema = {
  action: "destroy",
  common: [ENTITY_INPUT, DELAY_INPUT],
  params: [],
};

const FLASH_SCHEMA: ActionInputSchema = {
  action: "flash",
  common: [TARGET_INPUT, DELAY_INPUT, DURATION_INPUT, EASING_INPUT],
  params: [
    {
      type: "color",
      key: "color",
      label: "Color",
      default: "#E8A851",
    },
  ],
};

const WAIT_SCHEMA: ActionInputSchema = {
  action: "wait",
  common: [DURATION_INPUT],
  params: [],
};

const PLAY_SOUND_SCHEMA: ActionInputSchema = {
  action: "playSound",
  common: [DELAY_INPUT],
  params: [
    {
      type: "string",
      key: "sound",
      label: "Sound",
      placeholder: "asset path",
    },
    {
      type: "float",
      key: "volume",
      label: "Volume",
      min: 0,
      max: 1,
      step: 0.1,
      default: 1,
    },
  ],
};

const SET_ANIMATION_SCHEMA: ActionInputSchema = {
  action: "setAnimation",
  common: [ENTITY_INPUT, DELAY_INPUT],
  params: [
    {
      type: "string",
      key: "state",
      label: "State",
      placeholder: "idle, walk, attack, ...",
    },
  ],
};

const FOLLOW_ROUTE_SCHEMA: ActionInputSchema = {
  action: "followRoute",
  common: [ENTITY_INPUT, DELAY_INPUT, DURATION_INPUT, EASING_INPUT],
  params: [
    { type: "route-ref", key: "route", label: "Route", placeholder: "corridor-north, ..." },
    { type: "waypoint-ref", key: "from", label: "From waypoint", placeholder: "(start)" },
    { type: "waypoint-ref", key: "to", label: "To waypoint", placeholder: "(end)" },
    { type: "bool", key: "reverse", label: "Reverse", default: false },
    { type: "string", key: "animationDuring", label: "Anim. during", placeholder: "walk, run, ..." },
    { type: "string", key: "animationOnArrival", label: "Anim. arrival", placeholder: "idle, ..." },
  ],
};

// Structural actions — no params, they contain nested children
const PARALLEL_SCHEMA: ActionInputSchema = {
  action: "parallel",
  common: [],
  params: [],
};

const ON_ARRIVE_SCHEMA: ActionInputSchema = {
  action: "onArrive",
  common: [],
  params: [],
};

const ON_INTERRUPT_SCHEMA: ActionInputSchema = {
  action: "onInterrupt",
  common: [],
  params: [],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Map of action name → input schema. */
const ACTION_SCHEMAS: Map<string, ActionInputSchema> = new Map([
  ["move", MOVE_SCHEMA],
  ["fly", FLY_SCHEMA],
  ["spawn", SPAWN_SCHEMA],
  ["destroy", DESTROY_SCHEMA],
  ["flash", FLASH_SCHEMA],
  ["wait", WAIT_SCHEMA],
  ["playSound", PLAY_SOUND_SCHEMA],
  ["setAnimation", SET_ANIMATION_SCHEMA],
  ["followRoute", FOLLOW_ROUTE_SCHEMA],
  ["parallel", PARALLEL_SCHEMA],
  ["onArrive", ON_ARRIVE_SCHEMA],
  ["onInterrupt", ON_INTERRUPT_SCHEMA],
]);

/** Get the input schema for a given action. Returns null for unknown actions. */
export function getActionSchema(action: string): ActionInputSchema | null {
  return ACTION_SCHEMAS.get(action) ?? null;
}

/** Get all registered action names. */
export function getRegisteredActions(): string[] {
  return Array.from(ACTION_SCHEMAS.keys());
}
