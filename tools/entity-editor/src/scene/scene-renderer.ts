/**
 * Scene renderer module.
 *
 * Syncs SceneState to PixiJS display objects. Subscribes to state
 * changes and diffs the display list to update the canvas.
 * Includes grid overlay and scene boundary.
 */

import { Graphics, Sprite, Texture, Text, TextStyle, Assets } from "pixi.js";
import { getState, subscribe } from "../app-state.js";
import { getLayers } from "./scene-canvas.js";

// ---------------------------------------------------------------------------
// Texture cache
// ---------------------------------------------------------------------------

const textureCache = new Map<string, Texture>();

/** Find the object URL for an asset path. */
function findAssetUrl(assetPath: string): string | null {
  const asset = getState().assets.find((a) => a.path === assetPath);
  return asset?.objectUrl ?? null;
}

/** Load and cache a texture from an asset path. */
async function loadTexture(assetPath: string): Promise<Texture | null> {
  const cached = textureCache.get(assetPath);
  if (cached) return cached;

  const url = findAssetUrl(assetPath);
  if (!url) return null;

  try {
    const tex = await Assets.load<Texture>(url);
    tex.source.scaleMode = "nearest";
    textureCache.set(assetPath, tex);
    return tex;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ground rendering (simple color fill)
// ---------------------------------------------------------------------------

let groundGraphics: Graphics | null = null;

/** Render the ground layer as a solid color fill. */
function renderGround(): void {
  const layers = getLayers();
  if (!layers) return;

  const { scene } = getState();

  if (!groundGraphics) {
    groundGraphics = new Graphics();
    layers.ground.addChild(groundGraphics);
  }
  groundGraphics.clear();
  groundGraphics.rect(0, 0, scene.sceneWidth, scene.sceneHeight);
  groundGraphics.fill(scene.ground.color);
}

// ---------------------------------------------------------------------------
// Scene boundary
// ---------------------------------------------------------------------------

let boundaryGraphics: Graphics | null = null;

/** Render the scene boundary outline. */
function renderBoundary(): void {
  const layers = getLayers();
  if (!layers) return;

  const { scene } = getState();

  if (!boundaryGraphics) {
    boundaryGraphics = new Graphics();
    layers.selection.addChild(boundaryGraphics);
  }

  boundaryGraphics.clear();
  boundaryGraphics.rect(0, 0, scene.sceneWidth, scene.sceneHeight);
  boundaryGraphics.stroke({ width: 1, color: "#555555", alpha: 0.5 });
}

// ---------------------------------------------------------------------------
// Grid rendering
// ---------------------------------------------------------------------------

let gridGraphics: Graphics | null = null;

/** Render grid overlay if enabled. */
function renderGrid(): void {
  const layers = getLayers();
  if (!layers) return;

  const { scene, sceneEditor } = getState();

  if (!gridGraphics) {
    gridGraphics = new Graphics();
    layers.selection.addChild(gridGraphics);
  }

  gridGraphics.clear();

  if (!sceneEditor.showGrid) return;

  const size = sceneEditor.gridSize;

  for (let x = 0; x <= scene.sceneWidth; x += size) {
    gridGraphics.moveTo(x, 0);
    gridGraphics.lineTo(x, scene.sceneHeight);
  }
  for (let y = 0; y <= scene.sceneHeight; y += size) {
    gridGraphics.moveTo(0, y);
    gridGraphics.lineTo(scene.sceneWidth, y);
  }
  gridGraphics.stroke({ width: 0.5, color: "#ffffff", alpha: 0.12 });
}

// ---------------------------------------------------------------------------
// Decoration rendering
// ---------------------------------------------------------------------------

/** Map of decoration ID → Sprite for fast lookup. */
const decorSprites = new Map<string, Sprite>();

/** Render all decorations. */
async function renderDecorations(): Promise<void> {
  const layers = getLayers();
  if (!layers) return;

  const { scene } = getState();
  const currentIds = new Set(scene.decorations.map((d) => d.id));

  // Remove sprites that no longer exist
  for (const [id, sprite] of decorSprites) {
    if (!currentIds.has(id)) {
      layers.decorations.removeChild(sprite);
      sprite.destroy();
      decorSprites.delete(id);
    }
  }

  // Add/update sprites
  for (const decor of scene.decorations) {
    let sprite = decorSprites.get(decor.id);

    if (!sprite) {
      const tex = await loadTexture(decor.asset);
      if (!tex) continue;
      sprite = new Sprite(tex);
      sprite.label = decor.id;
      layers.decorations.addChild(sprite);
      decorSprites.set(decor.id, sprite);
    }

    sprite.x = decor.x;
    sprite.y = decor.y;
    sprite.width = decor.displayWidth;
    sprite.height = decor.displayHeight;
    sprite.rotation = (decor.rotation * Math.PI) / 180;
    sprite.zIndex = decor.layer;
    sprite.anchor.set(0.5, 0.5);
  }

  layers.decorations.sortChildren();
}

// ---------------------------------------------------------------------------
// Position rendering
// ---------------------------------------------------------------------------

/** Map of position name → { circle, label } display objects. */
const positionMarkers = new Map<string, { circle: Graphics; label: Text }>();

const POSITION_STYLE = new TextStyle({
  fontSize: 11,
  fontFamily: "monospace",
  fill: "#ffffff",
  stroke: { color: "#000000", width: 2 },
});

/** Render all named positions. */
function renderPositions(): void {
  const layers = getLayers();
  if (!layers) return;

  const { scene, sceneEditor } = getState();
  const currentNames = new Set(Object.keys(scene.positions));

  // Remove markers that no longer exist
  for (const [name, marker] of positionMarkers) {
    if (!currentNames.has(name)) {
      layers.positions.removeChild(marker.circle);
      layers.positions.removeChild(marker.label);
      marker.circle.destroy();
      marker.label.destroy();
      positionMarkers.delete(name);
    }
  }

  // Add/update markers
  for (const [name, pos] of Object.entries(scene.positions)) {
    let marker = positionMarkers.get(name);

    const isSelected = sceneEditor.selectedType === "position" && sceneEditor.selectedIds.includes(name);
    const markerColor = pos.color ?? "#f0c040";
    const strokeColor = isSelected ? "#79c0ff" : "#ffffff";
    const fillColor = isSelected ? "#58a6ff" : markerColor;

    if (!marker) {
      const circle = new Graphics();
      const label = new Text({ text: name, style: POSITION_STYLE });
      label.anchor.set(0.5, -0.5);
      layers.positions.addChild(circle);
      layers.positions.addChild(label);
      marker = { circle, label };
      positionMarkers.set(name, marker);
    }

    marker.circle.clear();
    marker.circle.circle(0, 0, 8);
    marker.circle.fill(fillColor);
    marker.circle.stroke({ width: 2, color: strokeColor });
    marker.circle.position.set(pos.x, pos.y);

    marker.label.text = name;
    marker.label.position.set(pos.x, pos.y);
  }
}

// ---------------------------------------------------------------------------
// Route rendering
// ---------------------------------------------------------------------------

let routeGraphics: Graphics | null = null;

/** Render all routes as dashed lines between positions. */
function renderRoutes(): void {
  const layers = getLayers();
  if (!layers) return;

  const { scene } = getState();

  if (!routeGraphics) {
    routeGraphics = new Graphics();
    layers.routes.addChild(routeGraphics);
  }

  routeGraphics.clear();

  for (const route of scene.routes) {
    const from = scene.positions[route.from];
    const to = scene.positions[route.to];
    if (!from || !to) continue;

    // Draw dashed line
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dashLen = 8;
    const gapLen = 4;
    const steps = Math.floor(dist / (dashLen + gapLen));

    for (let i = 0; i < steps; i++) {
      const t0 = (i * (dashLen + gapLen)) / dist;
      const t1 = Math.min(1, (i * (dashLen + gapLen) + dashLen) / dist);
      routeGraphics.moveTo(from.x + dx * t0, from.y + dy * t0);
      routeGraphics.lineTo(from.x + dx * t1, from.y + dy * t1);
    }
    routeGraphics.stroke({ width: 2, color: "#58a6ff", alpha: 0.7 });
  }
}

// ---------------------------------------------------------------------------
// Wall rendering (legacy)
// ---------------------------------------------------------------------------

let wallGraphics: Graphics | null = null;

/** Render all walls. */
function renderWalls(): void {
  const layers = getLayers();
  if (!layers) return;

  const { scene } = getState();

  if (!wallGraphics) {
    wallGraphics = new Graphics();
    layers.walls.addChild(wallGraphics);
  }

  wallGraphics.clear();

  for (const wall of scene.walls) {
    if (wall.points.length < 2) continue;
    const first = wall.points[0]!;
    wallGraphics.moveTo(first.x, first.y);
    for (let i = 1; i < wall.points.length; i++) {
      const pt = wall.points[i]!;
      wallGraphics.lineTo(pt.x, pt.y);
    }
    wallGraphics.stroke({ width: wall.thickness, color: wall.color });
  }
}

// ---------------------------------------------------------------------------
// Selection overlay
// ---------------------------------------------------------------------------

let selectionGraphics: Graphics | null = null;

/** Render selection highlights. */
function renderSelection(): void {
  const layers = getLayers();
  if (!layers) return;

  const { scene, sceneEditor } = getState();

  if (!selectionGraphics) {
    selectionGraphics = new Graphics();
    layers.selection.addChild(selectionGraphics);
  }

  selectionGraphics.clear();

  if (sceneEditor.selectedType === "decoration") {
    for (const id of sceneEditor.selectedIds) {
      const decor = scene.decorations.find((d) => d.id === id);
      if (!decor) continue;

      const hw = decor.displayWidth / 2;
      const hh = decor.displayHeight / 2;
      selectionGraphics.rect(decor.x - hw - 2, decor.y - hh - 2, decor.displayWidth + 4, decor.displayHeight + 4);
      selectionGraphics.stroke({ width: 1, color: "#58a6ff" });

      // Resize handles (4 corners)
      const corners = [
        { x: decor.x - hw, y: decor.y - hh },
        { x: decor.x + hw, y: decor.y - hh },
        { x: decor.x - hw, y: decor.y + hh },
        { x: decor.x + hw, y: decor.y + hh },
      ];
      for (const c of corners) {
        selectionGraphics.rect(c.x - 3, c.y - 3, 6, 6);
        selectionGraphics.fill("#58a6ff");
      }
    }
  }

  if (sceneEditor.selectedType === "wall") {
    for (const id of sceneEditor.selectedIds) {
      const wall = scene.walls.find((w) => w.id === id);
      if (!wall || wall.points.length < 2) continue;

      for (const pt of wall.points) {
        selectionGraphics.circle(pt.x, pt.y, 4);
        selectionGraphics.fill("#58a6ff");
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Full render
// ---------------------------------------------------------------------------

let renderScheduled = false;

/** Schedule a full render on next frame. */
function scheduleRender(): void {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderGround();
    void renderDecorations();
    renderPositions();
    renderRoutes();
    renderWalls();
    renderSelection();
    renderBoundary();
    renderGrid();
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the scene renderer. */
export function initSceneRenderer(): void {
  subscribe(scheduleRender);
  scheduleRender();
}
