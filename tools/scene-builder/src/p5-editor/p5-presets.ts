/**
 * Built-in p5.js sketch presets.
 *
 * Each preset is a complete P5SketchDef ready to be cloned and added
 * to the p5 editor state.
 */

import type { P5SketchDef } from "./p5-types.js";

// ---------------------------------------------------------------------------
// 1. Particles — bouncing particles
// ---------------------------------------------------------------------------

const PARTICLES_SOURCE = `// @param: count, slider, min: 5, max: 200, step: 1
// @param: speed, slider, min: 0.1, max: 5.0
// @param: size, slider, min: 2, max: 20

let particles = [];

p.setup = function() {
  p.createCanvas(p.sajou._width, p.sajou._height);
  const n = p.sajou.count ?? 50;
  for (let i = 0; i < n; i++) {
    particles.push({
      x: p.random(p.width),
      y: p.random(p.height),
      vx: p.random(-2, 2),
      vy: p.random(-2, 2),
    });
  }
};

p.draw = function() {
  const spd = p.sajou.speed ?? 1.0;
  const sz = p.sajou.size ?? 6;
  const target = Math.round(p.sajou.count ?? 50);

  // Adjust particle count
  while (particles.length < target) {
    particles.push({
      x: p.random(p.width),
      y: p.random(p.height),
      vx: p.random(-2, 2),
      vy: p.random(-2, 2),
    });
  }
  if (particles.length > target) particles.length = target;

  p.background(7, 7, 12, 30);
  p.noStroke();
  p.fill(232, 168, 81, 200);

  for (const pt of particles) {
    pt.x += pt.vx * spd;
    pt.y += pt.vy * spd;

    if (pt.x < 0 || pt.x > p.width) pt.vx *= -1;
    if (pt.y < 0 || pt.y > p.height) pt.vy *= -1;

    p.circle(pt.x, pt.y, sz);
  }
};
`;

// ---------------------------------------------------------------------------
// 2. Wave — animated sine wave
// ---------------------------------------------------------------------------

const WAVE_SOURCE = `// @param: speed, slider, min: 0.1, max: 5.0
// @param: amplitude, slider, min: 10, max: 200
// @param: frequency, slider, min: 0.5, max: 10.0

p.setup = function() {
  p.createCanvas(p.sajou._width, p.sajou._height);
};

p.draw = function() {
  const spd = p.sajou.speed ?? 1.0;
  const amp = p.sajou.amplitude ?? 80;
  const freq = p.sajou.frequency ?? 3.0;

  p.background(7, 7, 12);
  p.noFill();
  p.strokeWeight(2);

  const layers = 4;
  for (let l = 0; l < layers; l++) {
    const alpha = p.map(l, 0, layers, 255, 60);
    p.stroke(232, 168, 81, alpha);

    p.beginShape();
    for (let x = 0; x <= p.width; x += 4) {
      const phase = p.frameCount * 0.02 * spd + l * 0.8;
      const y = p.height / 2 +
        p.sin((x / p.width) * freq * p.TWO_PI + phase) * amp * (1 - l * 0.15);
      p.vertex(x, y);
    }
    p.endShape();
  }
};
`;

// ---------------------------------------------------------------------------
// 3. Grid — mouse-reactive grid
// ---------------------------------------------------------------------------

const GRID_SOURCE = `// @param: scale, slider, min: 10, max: 80, step: 1
// @param: reactivity, slider, min: 0.0, max: 1.0

p.setup = function() {
  p.createCanvas(p.sajou._width, p.sajou._height);
};

p.draw = function() {
  const sc = p.sajou.scale ?? 30;
  const react = p.sajou.reactivity ?? 0.5;

  p.background(7, 7, 12);
  p.noStroke();

  const cols = Math.ceil(p.width / sc);
  const rows = Math.ceil(p.height / sc);

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = i * sc + sc / 2;
      const cy = j * sc + sc / 2;

      const d = p.dist(p.mouseX, p.mouseY, cx, cy);
      const maxDist = p.width * 0.5;
      const influence = p.constrain(1 - d / maxDist, 0, 1) * react;

      const sz = sc * 0.3 + influence * sc * 0.5;
      const alpha = 40 + influence * 200;

      p.fill(232, 168, 81, alpha);
      p.circle(cx, cy, sz);
    }
  }
};
`;

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

/** A preset entry with factory function. */
export interface P5Preset {
  name: string;
  description: string;
  create: () => P5SketchDef;
}

/** All built-in p5.js sketch presets. */
export const P5_PRESETS: readonly P5Preset[] = [
  {
    name: "Particles",
    description: "Bouncing particles with speed control",
    create: () => ({
      id: crypto.randomUUID(),
      name: "Particles",
      source: PARTICLES_SOURCE,
      params: [
        { name: "count", type: "float", control: "slider", value: 50, defaultValue: 50, min: 5, max: 200, step: 1 },
        { name: "speed", type: "float", control: "slider", value: 1.0, defaultValue: 1.0, min: 0.1, max: 5.0, step: 0.01 },
        { name: "size", type: "float", control: "slider", value: 6, defaultValue: 6, min: 2, max: 20, step: 0.01 },
      ],
      width: 0,
      height: 0,
    }),
  },
  {
    name: "Wave",
    description: "Animated sine wave layers",
    create: () => ({
      id: crypto.randomUUID(),
      name: "Wave",
      source: WAVE_SOURCE,
      params: [
        { name: "speed", type: "float", control: "slider", value: 1.0, defaultValue: 1.0, min: 0.1, max: 5.0, step: 0.01 },
        { name: "amplitude", type: "float", control: "slider", value: 80, defaultValue: 80, min: 10, max: 200, step: 0.01 },
        { name: "frequency", type: "float", control: "slider", value: 3.0, defaultValue: 3.0, min: 0.5, max: 10.0, step: 0.01 },
      ],
      width: 0,
      height: 0,
    }),
  },
  {
    name: "Grid",
    description: "Mouse-reactive dot grid",
    create: () => ({
      id: crypto.randomUUID(),
      name: "Grid",
      source: GRID_SOURCE,
      params: [
        { name: "scale", type: "float", control: "slider", value: 30, defaultValue: 30, min: 10, max: 80, step: 1 },
        { name: "reactivity", type: "float", control: "slider", value: 0.5, defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
      ],
      width: 0,
      height: 0,
    }),
  },
] as const;
