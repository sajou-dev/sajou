/**
 * Easing functions for the choreographer timing system.
 *
 * An easing function maps a raw progress value t ∈ [0, 1] to an eased
 * output, typically also in [0, 1]. The choreographer computes raw progress
 * from elapsed time / duration, then applies the easing before emitting
 * action commands.
 */

/**
 * A pure function that maps linear progress to eased progress.
 *
 * @param t - Raw progress in [0, 1] where 0 = start, 1 = end.
 * @returns Eased progress, typically in [0, 1].
 */
export type EasingFn = (t: number) => number;

/** Constant speed — no acceleration or deceleration. */
export function linear(t: number): number {
  return t;
}

/** Accelerate from rest (slow start, fast end). Quadratic. */
export function easeIn(t: number): number {
  return t * t;
}

/** Decelerate to rest (fast start, slow end). Quadratic. */
export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Smooth S-curve — accelerate then decelerate. Cubic. */
export function easeInOut(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Parabolic arc — peaks at t=0.5 then returns.
 * Useful for projectile trajectories (fly action with arc easing).
 * Returns the Y offset (0 → 1 → 0), not the X progress.
 * Themes use this alongside linear X progress to create arc motion.
 */
export function arc(t: number): number {
  return 4 * t * (1 - t);
}

/** Name of a built-in easing function. */
export type EasingName = "linear" | "easeIn" | "easeOut" | "easeInOut" | "arc";

/** Registry of built-in easing functions, keyed by name. */
export const EASING_FUNCTIONS: Readonly<Record<EasingName, EasingFn>> = {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  arc,
};

/**
 * Look up an easing function by name.
 * Returns `undefined` if the name is not a built-in easing.
 */
export function getEasing(name: string): EasingFn | undefined {
  return EASING_FUNCTIONS[name as EasingName];
}
