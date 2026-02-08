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
} from "./app-state.js";
import type { SpritesheetState, StaticState } from "./app-state.js";

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
    stateAssetName.textContent = "none";
    stateAssetName.title = "Click an asset in the browser to bind it";
    stateAssetName.classList.remove("bound");
  }

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
