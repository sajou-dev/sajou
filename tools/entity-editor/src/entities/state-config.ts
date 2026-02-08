/**
 * State config module.
 *
 * Shown when a state tab is active. Controls:
 * - Type toggle (static / spritesheet)
 * - Asset binding (from asset browser selection)
 * - Spritesheet params (frameSize, frameCount, frameRow, fps, loop)
 * - Source rect params (x, y, w, h) for static sprites
 * - Triggers preview updates on changes
 */

import {
  getState,
  subscribe,
  getSelectedEntity,
  getSelectedState,
  updateState,
} from "../app-state.js";
import type { SpritesheetState, StaticState } from "../app-state.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const stateConfigEl = document.getElementById("state-config")!;
const stateType = document.getElementById("state-type") as HTMLSelectElement;
const stateAssetName = document.getElementById("state-asset-name")!;
const btnClearAsset = document.getElementById("btn-clear-asset")!;

const spritesheetParams = document.getElementById("spritesheet-params")!;
const inputFrameSize = document.getElementById("input-frame-size") as HTMLInputElement;
const inputFrameCount = document.getElementById("input-frame-count") as HTMLInputElement;
const inputFrameRow = document.getElementById("input-frame-row") as HTMLInputElement;
const inputFps = document.getElementById("input-fps") as HTMLInputElement;
const inputLoop = document.getElementById("input-loop") as HTMLInputElement;

const sourceRectParams = document.getElementById("source-rect-params")!;
const inputUseSourceRect = document.getElementById("input-use-source-rect") as HTMLInputElement;
const sourceRectFields = document.getElementById("source-rect-fields")!;
const inputSrX = document.getElementById("input-sr-x") as HTMLInputElement;
const inputSrY = document.getElementById("input-sr-y") as HTMLInputElement;
const inputSrW = document.getElementById("input-sr-w") as HTMLInputElement;
const inputSrH = document.getElementById("input-sr-h") as HTMLInputElement;
const validationWarnings = document.getElementById("validation-warnings")!;

// ---------------------------------------------------------------------------
// Image dimension cache (for validation)
// ---------------------------------------------------------------------------

/** Cached image dimensions, keyed by asset path. */
export const imageDimensions = new Map<string, { width: number; height: number }>();

/** Load and cache image dimensions from an asset's object URL. */
export function getImageDimensions(
  assetPath: string,
): { width: number; height: number } | null {
  // Return cached if available
  const cached = imageDimensions.get(assetPath);
  if (cached) return cached;

  // Find the object URL from state
  const asset = getState().assets.find((a) => a.path === assetPath);
  if (!asset) return null;

  // Load asynchronously and cache
  const img = new Image();
  img.src = asset.objectUrl;
  img.onload = () => {
    imageDimensions.set(assetPath, { width: img.naturalWidth, height: img.naturalHeight });
    // Re-render to show validation after dimensions are known
    render();
  };

  return null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validate the current state config and show warnings. */
function validateAndShowWarnings(): void {
  const visualState = getSelectedState();
  if (!visualState) {
    validationWarnings.hidden = true;
    return;
  }

  const warnings: Array<{ message: string; isError: boolean }> = [];

  // Check missing asset
  if (!visualState.asset) {
    warnings.push({
      message: "No asset bound. Click a file in the Assets panel to bind it to this state.",
      isError: false,
    });
  }

  if (visualState.type === "spritesheet" && visualState.asset) {
    const ss = visualState as SpritesheetState;
    const dims = getImageDimensions(visualState.asset);

    if (dims) {
      // Check frameCount vs image width
      const expectedCols = Math.floor(dims.width / ss.frameSize);
      if (ss.frameCount > expectedCols) {
        warnings.push({
          message: `frameCount is ${ss.frameCount} but the image is ${dims.width}px wide with frameSize ${ss.frameSize}px, so only ${expectedCols} columns fit. Reduce frameCount to ${expectedCols}.`,
          isError: true,
        });
      }

      // Check frameRow vs image height
      const maxRows = Math.floor(dims.height / ss.frameSize);
      if (ss.frameRow >= maxRows) {
        warnings.push({
          message: `frameRow is ${ss.frameRow} but the image is ${dims.height}px tall with frameSize ${ss.frameSize}px, so only rows 0-${maxRows - 1} exist.`,
          isError: true,
        });
      }

      // Suggest auto-detected frame count
      if (ss.frameCount < expectedCols && expectedCols > 0) {
        warnings.push({
          message: `Tip: image width (${dims.width}px) / frameSize (${ss.frameSize}px) = ${expectedCols} columns. You're using ${ss.frameCount}.`,
          isError: false,
        });
      }
    }
  }

  if (visualState.type === "static" && visualState.asset) {
    const st = visualState as StaticState;
    const dims = getImageDimensions(visualState.asset);

    if (dims && st.sourceRect) {
      // Check sourceRect bounds
      if (st.sourceRect.x + st.sourceRect.w > dims.width) {
        warnings.push({
          message: `sourceRect exceeds image width: x(${st.sourceRect.x}) + w(${st.sourceRect.w}) = ${st.sourceRect.x + st.sourceRect.w}px but image is ${dims.width}px wide.`,
          isError: true,
        });
      }
      if (st.sourceRect.y + st.sourceRect.h > dims.height) {
        warnings.push({
          message: `sourceRect exceeds image height: y(${st.sourceRect.y}) + h(${st.sourceRect.h}) = ${st.sourceRect.y + st.sourceRect.h}px but image is ${dims.height}px tall.`,
          isError: true,
        });
      }
    }
  }

  if (warnings.length === 0) {
    validationWarnings.hidden = true;
    return;
  }

  validationWarnings.hidden = false;
  validationWarnings.innerHTML = warnings
    .map(
      (w) =>
        `<div class="validation-warning${w.isError ? " validation-error" : ""}">` +
        `<span class="warn-icon">${w.isError ? "\u26D4" : "\u26A0"}</span>` +
        `<span>${w.message}</span>` +
        `</div>`,
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

let rendering = false;

function render(): void {
  rendering = true;
  const state = getState();
  const visualState = getSelectedState();

  if (!visualState || !state.selectedStateName) {
    stateConfigEl.hidden = true;
    rendering = false;
    return;
  }

  stateConfigEl.hidden = false;
  stateType.value = visualState.type;

  // Asset name display
  if (visualState.asset) {
    const parts = visualState.asset.split("/");
    stateAssetName.textContent = parts[parts.length - 1] ?? visualState.asset;
    stateAssetName.title = visualState.asset;
    stateAssetName.classList.add("bound");
  } else {
    stateAssetName.textContent = "click an asset to bind";
    stateAssetName.title = "Click an asset in the Assets panel to bind it to this state";
    stateAssetName.classList.remove("bound");
  }

  // Show validation warnings
  validateAndShowWarnings();

  // Show/hide type-specific params
  if (visualState.type === "spritesheet") {
    spritesheetParams.hidden = false;
    sourceRectParams.hidden = true;

    const ss = visualState as SpritesheetState;
    inputFrameSize.value = String(ss.frameSize);
    inputFrameCount.value = String(ss.frameCount);
    inputFrameRow.value = String(ss.frameRow);
    inputFps.value = String(ss.fps);
    inputLoop.checked = ss.loop;
  } else {
    spritesheetParams.hidden = true;
    sourceRectParams.hidden = false;

    const st = visualState as StaticState;
    const hasSR = !!st.sourceRect;
    inputUseSourceRect.checked = hasSR;
    sourceRectFields.hidden = !hasSR;
    if (st.sourceRect) {
      inputSrX.value = String(st.sourceRect.x);
      inputSrY.value = String(st.sourceRect.y);
      inputSrW.value = String(st.sourceRect.w);
      inputSrH.value = String(st.sourceRect.h);
    }
  }

  rendering = false;
}

// ---------------------------------------------------------------------------
// Mutation helpers
// ---------------------------------------------------------------------------

/** Mutate the current visual state and trigger a re-render. */
function mutateCurrentState(fn: () => void): void {
  if (rendering) return;
  fn();
  updateState({});
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/** Initialize the state config module. */
export function initStateConfig(): void {
  // Type toggle
  stateType.addEventListener("change", () => {
    mutateCurrentState(() => {
      const state = getState();
      const entity = getSelectedEntity();
      if (!entity || !state.selectedStateName) return;

      const current = entity.states[state.selectedStateName];
      if (!current) return;

      const newType = stateType.value as "static" | "spritesheet";
      if (current.type === newType) return;

      if (newType === "spritesheet") {
        entity.states[state.selectedStateName] = {
          type: "spritesheet",
          asset: current.asset,
          frameSize: 192,
          frameCount: 6,
          frameRow: 0,
          fps: 10,
          loop: true,
        };
      } else {
        entity.states[state.selectedStateName] = {
          type: "static",
          asset: current.asset,
        };
      }
    });
  });

  // Clear asset
  btnClearAsset.addEventListener("click", () => {
    mutateCurrentState(() => {
      const vs = getSelectedState();
      if (vs) vs.asset = "";
    });
  });

  // Spritesheet params
  inputFrameSize.addEventListener("input", () => {
    mutateCurrentState(() => {
      const vs = getSelectedState();
      if (vs?.type === "spritesheet") {
        (vs as SpritesheetState).frameSize = Math.max(1, Number(inputFrameSize.value));
      }
    });
  });

  inputFrameCount.addEventListener("input", () => {
    mutateCurrentState(() => {
      const vs = getSelectedState();
      if (vs?.type === "spritesheet") {
        (vs as SpritesheetState).frameCount = Math.max(1, Number(inputFrameCount.value));
      }
    });
  });

  inputFrameRow.addEventListener("input", () => {
    mutateCurrentState(() => {
      const vs = getSelectedState();
      if (vs?.type === "spritesheet") {
        (vs as SpritesheetState).frameRow = Math.max(0, Number(inputFrameRow.value));
      }
    });
  });

  inputFps.addEventListener("input", () => {
    mutateCurrentState(() => {
      const vs = getSelectedState();
      if (vs?.type === "spritesheet") {
        (vs as SpritesheetState).fps = Math.max(1, Number(inputFps.value));
      }
    });
  });

  inputLoop.addEventListener("change", () => {
    mutateCurrentState(() => {
      const vs = getSelectedState();
      if (vs?.type === "spritesheet") {
        (vs as SpritesheetState).loop = inputLoop.checked;
      }
    });
  });

  // Source rect
  inputUseSourceRect.addEventListener("change", () => {
    mutateCurrentState(() => {
      const vs = getSelectedState();
      if (vs?.type === "static") {
        const st = vs as StaticState;
        if (inputUseSourceRect.checked) {
          st.sourceRect = { x: 0, y: 0, w: 64, h: 64 };
        } else {
          delete st.sourceRect;
        }
      }
    });
  });

  const srInputs = [inputSrX, inputSrY, inputSrW, inputSrH];
  const srKeys = ["x", "y", "w", "h"] as const;

  for (let i = 0; i < srInputs.length; i++) {
    const input = srInputs[i]!;
    const key = srKeys[i]!;
    input.addEventListener("input", () => {
      mutateCurrentState(() => {
        const vs = getSelectedState();
        if (vs?.type === "static" && (vs as StaticState).sourceRect) {
          (vs as StaticState).sourceRect![key] = Math.max(0, Number(input.value));
        }
      });
    });
  }

  subscribe(render);
  render();
}
