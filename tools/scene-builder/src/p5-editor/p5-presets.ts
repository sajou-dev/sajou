/**
 * Built-in sketch presets (p5.js and Three.js).
 *
 * Each preset is a complete P5SketchDef ready to be cloned and added
 * to the sketch editor state.
 */

import type { P5SketchDef, SketchMode } from "./p5-types.js";

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
// 4. Bar Chart (Three.js) — animated 3D bar chart
// ---------------------------------------------------------------------------

const BAR_CHART_SOURCE = `// @param: barCount, slider, min: 3, max: 12, step: 1
// @param: maxHeight, slider, min: 1, max: 5
// @param: speed, slider, min: 0.1, max: 3.0
// @bind: intensity

function setup(ctx) {
  const count = Math.round(ctx.sajou.barCount ?? 6);
  const bars = [];
  const mats = [];
  const targets = [];

  for (let i = 0; i < count; i++) {
    const geo = new ctx.THREE.BoxGeometry(0.6, 1, 0.6);
    geo.translate(0, 0.5, 0); // pivot at base
    const mat = new ctx.THREE.MeshStandardMaterial({ color: 0xe8a851 });
    const mesh = new ctx.THREE.Mesh(geo, mat);
    mesh.position.x = (i - (count - 1) / 2) * 0.9;
    ctx.scene.add(mesh);
    bars.push(mesh);
    mats.push(mat);
    targets.push(0.5 + Math.random() * 2);
  }

  const light = new ctx.THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(3, 5, 4);
  ctx.scene.add(light);
  ctx.scene.add(new ctx.THREE.AmbientLight(0x303040, 0.6));

  // Ground plane
  const ground = new ctx.THREE.Mesh(
    new ctx.THREE.PlaneGeometry(12, 8),
    new ctx.THREE.MeshStandardMaterial({ color: 0x14141f })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ctx.scene.add(ground);

  ctx.camera.position.set(0, 4, 6);
  ctx.camera.lookAt(0, 1, 0);

  return { bars, mats, targets, nextSwap: 0 };
}

function draw(ctx, state) {
  const speed = ctx.sajou.speed ?? 1.0;
  const maxH = ctx.sajou.maxHeight ?? 3;
  const t = ctx.sajou._time;

  // Swap targets periodically
  if (t > state.nextSwap) {
    for (let i = 0; i < state.targets.length; i++) {
      state.targets[i] = 0.3 + Math.random() * maxH;
    }
    state.nextSwap = t + 1.5 / speed;
  }

  for (let i = 0; i < state.bars.length; i++) {
    const target = state.targets[i];
    const current = state.bars[i].scale.y;
    state.bars[i].scale.y += (target - current) * ctx.sajou._deltaTime * 3 * speed;
  }
}
`;

// ---------------------------------------------------------------------------
// 5. City Block (Three.js) — procedural buildings
// ---------------------------------------------------------------------------

const CITY_BLOCK_SOURCE = `// @param: density, slider, min: 3, max: 8, step: 1
// @param: maxFloors, slider, min: 2, max: 15, step: 1
// @param: activity, slider, min: 0, max: 1
// @bind: activity

function setup(ctx) {
  const density = Math.round(ctx.sajou.density ?? 5);
  const maxF = Math.round(ctx.sajou.maxFloors ?? 8);
  const buildings = [];

  for (let x = 0; x < density; x++) {
    for (let z = 0; z < density; z++) {
      const floors = 1 + Math.floor(Math.random() * maxF);
      const h = floors * 0.4;
      const w = 0.5 + Math.random() * 0.3;
      const d = 0.5 + Math.random() * 0.3;
      const geo = new ctx.THREE.BoxGeometry(w, h, d);
      geo.translate(0, h / 2, 0);
      const mat = new ctx.THREE.MeshStandardMaterial({
        color: new ctx.THREE.Color().setHSL(0, 0, 0.15 + Math.random() * 0.1),
      });
      const mesh = new ctx.THREE.Mesh(geo, mat);
      mesh.position.set(
        (x - (density - 1) / 2) * 1.2,
        0,
        (z - (density - 1) / 2) * 1.2
      );
      ctx.scene.add(mesh);
      buildings.push({ mesh, floors, h });
    }
  }

  // Windows as emissive points
  const winGeo = new ctx.THREE.SphereGeometry(0.03, 4, 4);
  const windows = [];
  for (const b of buildings) {
    for (let f = 0; f < b.floors; f++) {
      for (let s = 0; s < 2; s++) {
        const winMat = new ctx.THREE.MeshBasicMaterial({ color: 0xe8a851 });
        const win = new ctx.THREE.Mesh(winGeo, winMat);
        const side = s === 0 ? 0.3 : -0.3;
        win.position.set(
          b.mesh.position.x + side * (Math.random() > 0.5 ? 1 : -1),
          0.2 + f * 0.4,
          b.mesh.position.z + side * (Math.random() > 0.5 ? 1 : -1)
        );
        win.visible = Math.random() > 0.5;
        ctx.scene.add(win);
        windows.push(win);
      }
    }
  }

  const light = new ctx.THREE.DirectionalLight(0x8888cc, 0.4);
  light.position.set(5, 8, 3);
  ctx.scene.add(light);
  ctx.scene.add(new ctx.THREE.AmbientLight(0x202030, 0.5));

  // Ground
  const ground = new ctx.THREE.Mesh(
    new ctx.THREE.PlaneGeometry(20, 20),
    new ctx.THREE.MeshStandardMaterial({ color: 0x0e0e16 })
  );
  ground.rotation.x = -Math.PI / 2;
  ctx.scene.add(ground);

  ctx.camera.position.set(4, 5, 6);
  ctx.camera.lookAt(0, 1.5, 0);

  return { buildings, windows, nextFlicker: 0 };
}

function draw(ctx, state) {
  const activity = ctx.sajou.activity ?? 0.5;
  const t = ctx.sajou._time;

  if (t > state.nextFlicker) {
    for (const w of state.windows) {
      w.visible = Math.random() < activity;
    }
    state.nextFlicker = t + 0.3;
  }
}
`;

// ---------------------------------------------------------------------------
// 6. Orbit Ring (Three.js) — orbiting objects
// ---------------------------------------------------------------------------

const ORBIT_RING_SOURCE = `// @param: count, slider, min: 3, max: 16, step: 1
// @param: radius, slider, min: 1, max: 5
// @param: speed, slider, min: 0.1, max: 3.0
// @param: spread, slider, min: 0, max: 1
// @bind: speed

function setup(ctx) {
  const count = Math.round(ctx.sajou.count ?? 8);
  const radius = ctx.sajou.radius ?? 2.5;
  const agents = [];

  // Central sphere
  const centerGeo = new ctx.THREE.IcosahedronGeometry(0.3, 1);
  const centerMat = new ctx.THREE.MeshStandardMaterial({
    color: 0xe8a851,
    emissive: 0xe8a851,
    emissiveIntensity: 0.3,
  });
  const center = new ctx.THREE.Mesh(centerGeo, centerMat);
  ctx.scene.add(center);

  // Orbiting agents
  for (let i = 0; i < count; i++) {
    const geo = new ctx.THREE.IcosahedronGeometry(0.12, 0);
    const hue = i / count;
    const mat = new ctx.THREE.MeshStandardMaterial({
      color: new ctx.THREE.Color().setHSL(hue, 0.7, 0.6),
      emissive: new ctx.THREE.Color().setHSL(hue, 0.5, 0.2),
    });
    const mesh = new ctx.THREE.Mesh(geo, mat);
    ctx.scene.add(mesh);
    agents.push({
      mesh,
      angle: (i / count) * Math.PI * 2,
      yOffset: (Math.random() - 0.5) * 0.5,
      orbitRadius: radius + (Math.random() - 0.5) * 0.5,
    });
  }

  // Ring guide (wireframe torus)
  const ring = new ctx.THREE.Mesh(
    new ctx.THREE.TorusGeometry(radius, 0.01, 8, 64),
    new ctx.THREE.MeshBasicMaterial({ color: 0x333340 })
  );
  ring.rotation.x = Math.PI / 2;
  ctx.scene.add(ring);

  const light = new ctx.THREE.DirectionalLight(0xffffff, 1);
  light.position.set(3, 4, 5);
  ctx.scene.add(light);
  ctx.scene.add(new ctx.THREE.AmbientLight(0x303040, 0.6));

  ctx.camera.position.set(0, 3, 5);
  ctx.camera.lookAt(0, 0, 0);

  return { agents, center, ring };
}

function draw(ctx, state) {
  const speed = ctx.sajou.speed ?? 1.0;
  const spread = ctx.sajou.spread ?? 0.3;
  const dt = ctx.sajou._deltaTime;

  state.center.rotation.y += dt * 0.5;

  for (const a of state.agents) {
    a.angle += dt * speed * 0.8;
    const r = a.orbitRadius;
    a.mesh.position.set(
      Math.cos(a.angle) * r,
      a.yOffset * spread,
      Math.sin(a.angle) * r
    );
    a.mesh.rotation.y += dt * 2;
  }
}
`;

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

/** A preset entry with factory function. */
export interface P5Preset {
  /** Display name. */
  name: string;
  /** Short description. */
  description: string;
  /** Runtime mode (default: "p5"). */
  mode?: SketchMode;
  /** Factory that creates a fresh sketch definition. */
  create: () => P5SketchDef;
}

/** All built-in sketch presets (p5.js + Three.js). */
export const P5_PRESETS: readonly P5Preset[] = [
  // -- p5.js presets --
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
  // -- Three.js presets --
  {
    name: "Bar Chart",
    description: "Animated 3D bar chart",
    mode: "threejs",
    create: () => ({
      id: crypto.randomUUID(),
      name: "Bar Chart",
      source: BAR_CHART_SOURCE,
      mode: "threejs",
      params: [
        { name: "barCount", type: "float", control: "slider", value: 6, defaultValue: 6, min: 3, max: 12, step: 1 },
        { name: "maxHeight", type: "float", control: "slider", value: 3, defaultValue: 3, min: 1, max: 5, step: 0.01 },
        { name: "speed", type: "float", control: "slider", value: 1, defaultValue: 1, min: 0.1, max: 3, step: 0.01 },
      ],
      width: 0,
      height: 0,
    }),
  },
  {
    name: "City Block",
    description: "Procedural buildings with windows",
    mode: "threejs",
    create: () => ({
      id: crypto.randomUUID(),
      name: "City Block",
      source: CITY_BLOCK_SOURCE,
      mode: "threejs",
      params: [
        { name: "density", type: "float", control: "slider", value: 5, defaultValue: 5, min: 3, max: 8, step: 1 },
        { name: "maxFloors", type: "float", control: "slider", value: 8, defaultValue: 8, min: 2, max: 15, step: 1 },
        { name: "activity", type: "float", control: "slider", value: 0.5, defaultValue: 0.5, min: 0, max: 1, step: 0.01 },
      ],
      width: 0,
      height: 0,
    }),
  },
  {
    name: "Orbit Ring",
    description: "Orbiting agents around a center",
    mode: "threejs",
    create: () => ({
      id: crypto.randomUUID(),
      name: "Orbit Ring",
      source: ORBIT_RING_SOURCE,
      mode: "threejs",
      params: [
        { name: "count", type: "float", control: "slider", value: 8, defaultValue: 8, min: 3, max: 16, step: 1 },
        { name: "radius", type: "float", control: "slider", value: 2.5, defaultValue: 2.5, min: 1, max: 5, step: 0.01 },
        { name: "speed", type: "float", control: "slider", value: 1, defaultValue: 1, min: 0.1, max: 3, step: 0.01 },
        { name: "spread", type: "float", control: "slider", value: 0.3, defaultValue: 0.3, min: 0, max: 1, step: 0.01 },
      ],
      width: 0,
      height: 0,
    }),
  },
] as const;
