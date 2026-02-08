/**
 * Preview renderer module.
 *
 * Renders a live preview of the currently selected entity state
 * using PixiJS. Shows static sprites or animated spritesheets
 * with the configured parameters in real time.
 */

import {
  Application,
  Sprite,
  AnimatedSprite,
  Texture,
  Rectangle,
  Assets,
  Container,
} from "pixi.js";
import {
  getState,
  subscribe,
  getSelectedEntity,
  getSelectedState,
} from "./app-state.js";
import type { SpritesheetState, StaticState } from "./app-state.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let app: Application | null = null;
let currentSprite: Container | null = null;
let lastAssetKey = "";
let lastTextureUrl = "";
let loadedTexture: Texture | null = null;

const container = document.getElementById("preview-container")!;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the PixiJS application for previews. */
async function createApp(): Promise<Application> {
  const pixiApp = new Application();
  await pixiApp.init({
    width: 400,
    height: 240,
    backgroundAlpha: 0,
    antialias: false,
  });
  container.appendChild(pixiApp.canvas);
  return pixiApp;
}

/** Clear the current preview sprite. */
function clearPreview(): void {
  if (!app) return;
  if (currentSprite) {
    app.stage.removeChild(currentSprite);
    currentSprite.destroy();
    currentSprite = null;
  }
}

/** Find the object URL for an asset path. */
function findAssetUrl(assetPath: string): string | null {
  const assets = getState().assets;
  const asset = assets.find((a) => a.path === assetPath);
  return asset?.objectUrl ?? null;
}

/** Load a texture from an object URL, with caching. */
async function loadTexture(url: string): Promise<Texture | null> {
  if (url === lastTextureUrl && loadedTexture) {
    return loadedTexture;
  }

  try {
    // Clear previous cache entry to force reload
    if (lastTextureUrl && Assets.cache.has(lastTextureUrl)) {
      Assets.cache.remove(lastTextureUrl);
    }

    const tex = await Assets.load<Texture>(url);
    tex.source.scaleMode = "nearest";
    lastTextureUrl = url;
    loadedTexture = tex;
    return tex;
  } catch {
    return null;
  }
}

/** Slice frames from a spritesheet texture. */
function sliceFrames(
  texture: Texture,
  frameSize: number,
  frameCount: number,
  frameRow: number,
): Texture[] {
  const frames: Texture[] = [];
  const y = frameRow * frameSize;
  for (let i = 0; i < frameCount; i++) {
    frames.push(
      new Texture({
        source: texture.source,
        frame: new Rectangle(i * frameSize, y, frameSize, frameSize),
      }),
    );
  }
  return frames;
}

// ---------------------------------------------------------------------------
// Render preview
// ---------------------------------------------------------------------------

/** Update the preview canvas with the current state. */
async function renderPreview(): Promise<void> {
  if (!app) {
    app = await createApp();
  }

  const entity = getSelectedEntity();
  const visualState = getSelectedState();

  // Build a cache key to avoid unnecessary reloads
  const state = getState();
  const assetKey = JSON.stringify({
    id: state.selectedEntityId,
    state: state.selectedStateName,
    vs: visualState,
  });

  if (assetKey === lastAssetKey) return;
  lastAssetKey = assetKey;

  clearPreview();

  if (!entity || !visualState || !visualState.asset) return;

  const url = findAssetUrl(visualState.asset);
  if (!url) return;

  const texture = await loadTexture(url);
  if (!texture) return;

  const dw = entity.displayWidth;
  const dh = entity.displayHeight;

  if (visualState.type === "spritesheet") {
    const ss = visualState as SpritesheetState;
    const frames = sliceFrames(texture, ss.frameSize, ss.frameCount, ss.frameRow);
    if (frames.length === 0) return;

    const anim = new AnimatedSprite(frames);
    anim.width = dw;
    anim.height = dh;
    anim.anchor.set(0.5, 0.5);
    anim.animationSpeed = ss.fps / 60;
    anim.loop = ss.loop;
    anim.position.set(app.screen.width / 2, app.screen.height / 2);
    anim.play();

    app.stage.addChild(anim);
    currentSprite = anim;
  } else {
    const st = visualState as StaticState;
    let displayTexture = texture;

    if (st.sourceRect) {
      displayTexture = new Texture({
        source: texture.source,
        frame: new Rectangle(st.sourceRect.x, st.sourceRect.y, st.sourceRect.w, st.sourceRect.h),
      });
    }

    const sprite = new Sprite(displayTexture);
    sprite.width = dw;
    sprite.height = dh;
    sprite.anchor.set(0.5, 0.5);
    sprite.position.set(app.screen.width / 2, app.screen.height / 2);

    app.stage.addChild(sprite);
    currentSprite = sprite;
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the preview renderer. */
export function initPreviewRenderer(): void {
  subscribe(() => {
    void renderPreview();
  });
}
