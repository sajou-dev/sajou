/**
 * Scene renderer module.
 *
 * Syncs SceneState → Three.js entities. Subscribes to state changes
 * and diffs the entity list to add/remove/update Three.js meshes.
 * Editor overlays are drawn on the Canvas2D overlay via overlay-renderer.
 *
 * Entity meshes are horizontal PlaneGeometry (lying on XZ plane) with
 * MeshBasicMaterial for flat 2D rendering in the top-down camera.
 */

import * as THREE from "three";
import { loadTexture, getCachedTexture, getCachedTextureSize, setUVFrame } from "@sajou/stage";
import { getSceneState, subscribeScene } from "../state/scene-state.js";
import { subscribeEditor } from "../state/editor-state.js";
import { getEntityStore, subscribeEntities } from "../state/entity-store.js";
import { getAssetStore, subscribeAssets } from "../state/asset-store.js";
import { isRunModeActive } from "../run-mode/run-mode-state.js";
import { getThreeScene, setOverlayDrawCallback, redrawOverlay, getController, onControllerChange } from "./canvas.js";
import { computeBillboardAngle, type CameraController } from "./camera-controller.js";
import {
  renderZoneGrid,
  renderSelection,
  renderPositions,
  renderRoutes,
  renderRouteCreationPreview,
  renderTopologyOverlay,
  renderBindingHighlight,
  renderActorBadges,
} from "./overlay-renderer.js";
import { drawGuideLines } from "../tools/guide-lines.js";
import type { PlacedEntity, EntityEntry, SceneLayer } from "../types.js";

// ---------------------------------------------------------------------------
// Depth helpers
// ---------------------------------------------------------------------------

/** Y-offset step per depth unit. Encodes (layerOrder, zIndex) into Y position. */
const DEPTH_Y_STEP = 0.001;

/** Convert layer order + zIndex to a Y offset for depth sorting. */
function depthToY(layerOrder: number, zIndex: number): number {
  return (layerOrder * 10000 + zIndex) * DEPTH_Y_STEP;
}

// ---------------------------------------------------------------------------
// Entity mesh record
// ---------------------------------------------------------------------------

/** Three.js representation of a placed entity. */
export interface EntityMeshRecord {
  readonly group: THREE.Group;
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly placedId: string;
  /** Dimensions at creation time — used to detect when geometry must be rebuilt. */
  readonly createdWidth: number;
  readonly createdHeight: number;
}

/** Map of PlacedEntity.id → Three.js mesh record. */
const entityRecords = new Map<string, EntityMeshRecord>();

// ---------------------------------------------------------------------------
// Texture helpers
// ---------------------------------------------------------------------------

/** Find the object URL for an asset path from the asset store. */
function findAssetUrl(assetPath: string): string | null {
  const asset = getAssetStore().assets.find((a) => a.path === assetPath);
  return asset?.objectUrl ?? null;
}

/**
 * Load and cache a Three.js texture from an asset path.
 * Uses the stage texture-loader (NearestFilter, blob URL support).
 */
async function loadEntityTexture(assetPath: string): Promise<THREE.Texture | null> {
  const cached = getCachedTexture(assetPath);
  if (cached) return cached;

  const url = findAssetUrl(assetPath);
  if (!url) return null;

  return loadTexture(assetPath, url);
}

// ---------------------------------------------------------------------------
// Layer helpers
// ---------------------------------------------------------------------------

function buildLayerMap(): Map<string, SceneLayer> {
  const { layers } = getSceneState();
  const map = new Map<string, SceneLayer>();
  for (const l of layers) map.set(l.id, l);
  return map;
}

/** Resolve entity definition. */
function getEntityDef(entityId: string): EntityEntry | null {
  const store = getEntityStore();
  return store.entities[entityId] ?? null;
}

// ---------------------------------------------------------------------------
// Entity management (Three.js)
// ---------------------------------------------------------------------------

/**
 * Get a Three.js entity mesh record by PlacedEntity ID.
 * Used by three-adapter for run-mode.
 */
export function getEntityRecord(placedId: string): EntityMeshRecord | null {
  return entityRecords.get(placedId) ?? null;
}

/**
 * Get a cached Three.js texture by asset path.
 * Used by three-adapter for spritesheet frame slicing.
 */
export function getCachedEntityTexture(assetPath: string): THREE.Texture | null {
  return getCachedTexture(assetPath);
}

/** Create a new entity mesh for a placed entity. */
function createEntityMesh(
  placed: PlacedEntity,
  def: EntityEntry,
): EntityMeshRecord {
  const scene = getThreeScene();
  if (!scene) throw new Error("Three.js scene not initialized");

  const w = def.displayWidth;
  const h = def.displayHeight;
  const ax = def.defaults.anchor?.[0] ?? 0.5;
  const ay = def.defaults.anchor?.[1] ?? 0.5;

  // Horizontal plane: PlaneGeometry in XZ plane
  const geom = new THREE.PlaneGeometry(w, h);
  geom.rotateX(-Math.PI / 2);

  // Anchor offset: shift geometry so anchor point is at group origin
  const offsetX = (0.5 - ax) * w;
  const offsetZ = (0.5 - ay) * h;
  geom.translate(offsetX, 0, offsetZ);

  const material = new THREE.MeshBasicMaterial({
    color: def.fallbackColor || "#666666",
    transparent: true,
    alphaTest: 0.01,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  });

  const mesh = new THREE.Mesh(geom, material);
  mesh.userData["entityId"] = placed.id;

  const group = new THREE.Group();
  group.add(mesh);

  scene.add(group);

  const record: EntityMeshRecord = {
    group,
    mesh,
    material,
    placedId: placed.id,
    createdWidth: w,
    createdHeight: h,
  };

  entityRecords.set(placed.id, record);
  return record;
}

/** Apply transforms from PlacedEntity to Three.js group/material. */
function applyEntityTransform(
  record: EntityMeshRecord,
  placed: PlacedEntity,
  _def: EntityEntry,
  layer: SceneLayer | undefined,
): void {
  const { group, mesh, material } = record;

  // Position: scene (x, y) → world (x, depthY, z)
  const layerOrder = layer?.order ?? 0;
  group.position.set(placed.x, depthToY(layerOrder, placed.zIndex), placed.y);

  // Rotation: 2D rotation → Y-axis rotation
  group.rotation.y = -(placed.rotation * Math.PI) / 180;

  // Cylindrical billboard: stand the entity upright and face the camera.
  //
  // The geometry was baked flat (rotateX -PI/2) → lies in XZ.
  // To stand it up: Rx(PI/2), then rotate around Y to face camera: Ry(angle).
  // Euler order 'YXZ' gives: Ry * Rx * Rz = Ry(angle) * Rx(PI/2).
  //
  // After standing up, the anchor Z-offset maps to -Y, so the mesh
  // sinks below ground. Compensate with mesh.position.y = h * (1 - ay).
  const ctrl = getController();
  if (ctrl && ctrl.mode === "isometric") {
    const angle = computeBillboardAngle(ctrl.camera);
    mesh.rotation.set(Math.PI / 2, angle, 0, "YXZ");
    const h = _def.displayHeight;
    const ay = _def.defaults.anchor?.[1] ?? 0.5;
    mesh.position.y = h * (1 - ay);

    // In iso, the billboard height is along Y, width is split across X/Z.
    // Use uniform scale so width and height scale equally.
    // flipH negates X+Z together; flipV negates Y.
    const sx = placed.flipH ? -placed.scale : placed.scale;
    const sy = placed.flipV ? -placed.scale : placed.scale;
    group.scale.set(sx, sy, sx);
  } else {
    mesh.rotation.set(0, 0, 0, "YXZ");
    mesh.position.y = 0;

    // Top-down: width = X, height = Z, depth = Y (always 1)
    const sx = placed.flipH ? -placed.scale : placed.scale;
    const sz = placed.flipV ? -placed.scale : placed.scale;
    group.scale.set(sx, 1, sz);
  }

  // Opacity
  material.opacity = placed.opacity;

  // Visibility
  group.visible = placed.visible;
}

/** Remove an entity mesh from the scene. */
function removeEntityMesh(placedId: string): void {
  const record = entityRecords.get(placedId);
  if (!record) return;

  const scene = getThreeScene();
  if (scene) scene.remove(record.group);

  record.mesh.geometry.dispose();
  record.material.dispose();
  entityRecords.delete(placedId);
}

/** Render all placed entities — diff against current Three.js state. */
async function renderEntities(): Promise<void> {
  const scene = getThreeScene();
  if (!scene) return;

  const { entities } = getSceneState();
  const layerMap = buildLayerMap();
  const currentIds = new Set(entities.map((e) => e.id));

  // Remove entities that no longer exist
  for (const [id] of entityRecords) {
    if (!currentIds.has(id)) {
      removeEntityMesh(id);
    }
  }

  // Add/update entities
  for (const placed of entities) {
    const layer = layerMap.get(placed.layerId);
    const layerHidden = layer ? !layer.visible : false;

    if (!placed.visible || layerHidden) {
      const existing = entityRecords.get(placed.id);
      if (existing) existing.group.visible = false;
      continue;
    }

    const def = getEntityDef(placed.entityId);
    if (!def) {
      // No entity definition — show fallback
      let record = entityRecords.get(placed.id);
      if (!record) {
        const fallbackDef: EntityEntry = {
          id: placed.entityId,
          tags: [],
          displayWidth: 32,
          displayHeight: 32,
          fallbackColor: "#666666",
          defaults: {},
          visual: { type: "sprite", source: "" },
        };
        record = createEntityMesh(placed, fallbackDef);
      }
      if (!isRunModeActive()) {
        applyEntityTransform(record, placed, def ?? {
          id: "", tags: [], displayWidth: 32, displayHeight: 32,
          fallbackColor: "#666666", defaults: {}, visual: { type: "sprite", source: "" },
        }, layer);
      }
      record.group.visible = true;
      continue;
    }

    const assetPath = def.visual.source;
    const tex = await loadEntityTexture(assetPath);

    let record = entityRecords.get(placed.id);

    // Recreate mesh if entity definition dimensions changed
    if (record && (record.createdWidth !== def.displayWidth || record.createdHeight !== def.displayHeight)) {
      removeEntityMesh(placed.id);
      record = undefined;
    }

    if (!record) {
      record = createEntityMesh(placed, def);
    }

    if (tex) {
      // Apply texture
      record.material.map = tex;
      record.material.color.set(0xffffff); // Reset tint when texture is loaded
      record.material.needsUpdate = true;

      // Spritesheet frame slicing
      if (def.visual.type === "spritesheet") {
        const visual = def.visual;
        const animName = placed.activeState;
        const anim = visual.animations[animName];
        const texSize = getCachedTextureSize(assetPath);

        if (anim && anim.frames.length > 0 && texSize) {
          const cols = visual.frameWidth > 0 ? Math.floor(texSize.width / visual.frameWidth) : 0;
          if (cols > 0) {
            const frameIndex = anim.frames[0]!;
            const fx = (frameIndex % cols) * visual.frameWidth;
            const fy = Math.floor(frameIndex / cols) * visual.frameHeight;

            if (fx + visual.frameWidth <= texSize.width && fy + visual.frameHeight <= texSize.height) {
              setUVFrame(
                record.mesh, fx, fy,
                visual.frameWidth, visual.frameHeight,
                texSize.width, texSize.height,
              );
            }
          }
        }
      }

      // Static sprite sourceRect cropping
      if (def.visual.type === "sprite" && def.visual.sourceRect) {
        const sr = def.visual.sourceRect;
        const texSize = getCachedTextureSize(assetPath);
        if (texSize) {
          setUVFrame(record.mesh, sr.x, sr.y, sr.w, sr.h, texSize.width, texSize.height);
        }
      }
    }

    // Apply transforms (skip during run-mode — sink manages transforms)
    if (!isRunModeActive()) {
      applyEntityTransform(record, placed, def, layer);
    }
    record.group.visible = true;
  }
}

// ---------------------------------------------------------------------------
// Billboarding
// ---------------------------------------------------------------------------

/** Apply billboard rotation + Y-lift to all existing entity meshes for a given controller. */
function applyBillboard(ctrl: CameraController): void {
  const { entities } = getSceneState();
  const placedMap = new Map(entities.map((e) => [e.id, e]));

  if (ctrl.mode === "isometric") {
    const angle = computeBillboardAngle(ctrl.camera);
    for (const [, record] of entityRecords) {
      record.mesh.rotation.set(Math.PI / 2, angle, 0, "YXZ");
      const placed = placedMap.get(record.placedId);
      if (placed) {
        const def = getEntityDef(placed.entityId);
        const h = def?.displayHeight ?? record.createdHeight;
        const ay = def?.defaults.anchor?.[1] ?? 0.5;
        record.mesh.position.y = h * (1 - ay);
      }
    }
  } else {
    for (const [, record] of entityRecords) {
      record.mesh.rotation.set(0, 0, 0, "YXZ");
      record.mesh.position.y = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Overlay drawing orchestration
// ---------------------------------------------------------------------------

/** Draw all scene overlays on the Canvas2D context. */
function drawSceneOverlays(
  ctx: CanvasRenderingContext2D,
  _currentZoom: number,
  _px: number,
  _py: number,
): void {
  const ctrl = getController();
  if (!ctrl) return;

  const t = ctrl.getOverlayTransform();
  const effectiveZoom = ctrl.getEffectiveZoom();

  // Scene-coordinate overlays (use full affine transform for iso support)
  ctx.save();
  ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);

  renderZoneGrid(ctx, effectiveZoom);
  renderPositions(ctx, effectiveZoom);
  renderRoutes(ctx, effectiveZoom);
  renderRouteCreationPreview(ctx, effectiveZoom);
  renderTopologyOverlay(ctx, effectiveZoom);
  renderSelection(ctx, effectiveZoom);
  renderBindingHighlight(ctx, effectiveZoom);
  renderActorBadges(ctx, effectiveZoom);
  drawGuideLines(ctx, effectiveZoom);

  ctx.restore();
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
    void renderEntities();
    redrawOverlay();
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the scene renderer. Subscribes to all relevant state stores. */
export function initSceneRenderer(): void {
  // Register overlay draw callback with canvas
  setOverlayDrawCallback(drawSceneOverlays);

  // Billboard all meshes when camera controller changes (top-down ↔ iso)
  onControllerChange((ctrl) => {
    applyBillboard(ctrl);
    scheduleRender();
  });

  subscribeScene(scheduleRender);
  subscribeEditor(scheduleRender);
  subscribeEntities(scheduleRender);
  subscribeAssets(scheduleRender);
  scheduleRender();
}
