/**
 * Simulator control bar — compact inline UI for scenario playback.
 *
 * Inserted between the sources area and raw log in the signal view.
 * Provides scenario selection, play/pause/stop, speed control, and progress.
 */

import { SCENARIOS } from "../simulator/presets.js";
import type { Scenario } from "../simulator/types.js";
import type { SimulatorState } from "../simulator/simulator-runner.js";
import {
  play,
  pause,
  resume,
  stop,
  setSpeed,
  getSimulatorProgress,
  onSimulatorProgress,
} from "../simulator/simulator-runner.js";

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

let barEl: HTMLElement | null = null;
let selectEl: HTMLSelectElement | null = null;
let playBtn: HTMLButtonElement | null = null;
let pauseBtn: HTMLButtonElement | null = null;
let stopBtn: HTMLButtonElement | null = null;
let speedSlider: HTMLInputElement | null = null;
let speedLabel: HTMLSpanElement | null = null;
let progressLabel: HTMLSpanElement | null = null;
let progressBar: HTMLElement | null = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Create and return the simulator bar element.
 * Call once during signal-view init.
 */
export function createSimulatorBar(): HTMLElement {
  barEl = document.createElement("div");
  barEl.className = "sv-simulator-bar";

  // ── Label ──
  const label = document.createElement("span");
  label.className = "sv-simulator-label";
  label.textContent = "SIM";
  barEl.appendChild(label);

  // ── Scenario select ──
  selectEl = document.createElement("select");
  selectEl.className = "sv-simulator-select";
  for (const [name, scenario] of SCENARIOS) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = scenario.name;
    opt.title = scenario.description;
    selectEl.appendChild(opt);
  }
  barEl.appendChild(selectEl);

  // ── Play button ──
  playBtn = document.createElement("button");
  playBtn.className = "sv-simulator-btn sv-simulator-btn--play";
  playBtn.textContent = "\u25B6"; // ▶
  playBtn.title = "Play";
  playBtn.addEventListener("click", onPlay);
  barEl.appendChild(playBtn);

  // ── Pause button ──
  pauseBtn = document.createElement("button");
  pauseBtn.className = "sv-simulator-btn sv-simulator-btn--pause";
  pauseBtn.textContent = "\u23F8"; // ⏸
  pauseBtn.title = "Pause";
  pauseBtn.style.display = "none";
  pauseBtn.addEventListener("click", onPause);
  barEl.appendChild(pauseBtn);

  // ── Stop button ──
  stopBtn = document.createElement("button");
  stopBtn.className = "sv-simulator-btn sv-simulator-btn--stop";
  stopBtn.textContent = "\u25A0"; // ■
  stopBtn.title = "Stop";
  stopBtn.disabled = true;
  stopBtn.addEventListener("click", onStop);
  barEl.appendChild(stopBtn);

  // ── Separator ──
  const sep = document.createElement("span");
  sep.className = "sv-simulator-sep";
  barEl.appendChild(sep);

  // ── Speed control ──
  const speedGroup = document.createElement("span");
  speedGroup.className = "sv-simulator-speed";

  speedLabel = document.createElement("span");
  speedLabel.className = "sv-simulator-speed-label";
  speedLabel.textContent = "1\u00D7";
  speedGroup.appendChild(speedLabel);

  speedSlider = document.createElement("input");
  speedSlider.type = "range";
  speedSlider.className = "sv-simulator-speed-slider";
  speedSlider.min = "0.25";
  speedSlider.max = "4";
  speedSlider.step = "0.25";
  speedSlider.value = "1";
  speedSlider.title = "Playback speed";
  speedSlider.addEventListener("input", onSpeedChange);
  speedGroup.appendChild(speedSlider);

  barEl.appendChild(speedGroup);

  // ── Separator ──
  const sep2 = document.createElement("span");
  sep2.className = "sv-simulator-sep";
  barEl.appendChild(sep2);

  // ── Progress ──
  progressLabel = document.createElement("span");
  progressLabel.className = "sv-simulator-progress-label";
  progressLabel.textContent = "—";
  barEl.appendChild(progressLabel);

  // ── Progress bar (thin bottom line) ──
  progressBar = document.createElement("div");
  progressBar.className = "sv-simulator-progress-bar";
  const progressFill = document.createElement("div");
  progressFill.className = "sv-simulator-progress-fill";
  progressBar.appendChild(progressFill);
  barEl.appendChild(progressBar);

  // ── Listen for runner progress ──
  onSimulatorProgress((progress) => {
    updateUI(progress.state, progress.stepIndex, progress.totalSteps);
  });

  return barEl;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function onPlay(): void {
  const progress = getSimulatorProgress();
  if (progress.state === "paused") {
    resume();
    return;
  }

  const selectedName = selectEl?.value ?? "";
  const scenario: Scenario | undefined = SCENARIOS.get(selectedName);
  if (!scenario) return;
  play(scenario);
}

function onPause(): void {
  pause();
}

function onStop(): void {
  stop();
}

function onSpeedChange(): void {
  if (!speedSlider || !speedLabel) return;
  const val = parseFloat(speedSlider.value);
  setSpeed(val);
  speedLabel.textContent = `${val}\u00D7`;
}

// ---------------------------------------------------------------------------
// UI update
// ---------------------------------------------------------------------------

function updateUI(simState: SimulatorState, step: number, total: number): void {
  if (!playBtn || !pauseBtn || !stopBtn || !progressLabel || !progressBar || !selectEl) return;

  const isPlaying = simState === "playing";
  const isPaused = simState === "paused";
  const isActive = isPlaying || isPaused;

  // Toggle play/pause buttons
  playBtn.style.display = isPlaying ? "none" : "";
  pauseBtn.style.display = isPlaying ? "" : "none";
  playBtn.textContent = isPaused ? "\u25B6" : "\u25B6"; // ▶
  playBtn.title = isPaused ? "Resume" : "Play";

  // Stop button
  stopBtn.disabled = !isActive;

  // Disable scenario select while playing
  selectEl.disabled = isActive;

  // Progress label
  if (isActive) {
    progressLabel.textContent = `${step}/${total}`;
  } else if (total > 0 && step >= total) {
    progressLabel.textContent = "done";
  } else {
    progressLabel.textContent = "\u2014"; // —
  }

  // Progress bar fill
  const fill = progressBar.querySelector(".sv-simulator-progress-fill") as HTMLElement | null;
  if (fill) {
    const pct = total > 0 ? (step / total) * 100 : 0;
    fill.style.width = `${pct}%`;
  }
}
