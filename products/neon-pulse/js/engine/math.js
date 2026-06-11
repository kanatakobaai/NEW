// Small math helpers for the game.
export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Smallest signed angle difference between two angles (radians), in (-PI, PI].
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d < -Math.PI) d += TAU;
  if (d > Math.PI) d -= TAU;
  return d;
}

// Normalize angle into [0, TAU).
export function normAngle(a) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

// Ease helpers for juice.
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInQuad = (t) => t * t;
