// The moon's surface: a seeded height map with flat landing pads. No DOM.
//
// The ground is `segments` straight pieces across the world's width, so its
// height is a function of x. Nothing can overhang, which keeps both the
// generator and the contact checks simple.

import { TERRAIN, WORLD } from './config.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Out-of-range heights bounce back off the limit rather than being cut flat at
// it, which would leave stretches that look like pads but are not.
function fold(v, lo, hi) {
  if (v > hi) return clamp(2 * hi - v, lo, hi);
  if (v < lo) return clamp(2 * lo - v, lo, hi);
  return v;
}

/** x folded back into the world, which wraps around at its sides. */
export function wrapX(x) {
  return ((x % WORLD.width) + WORLD.width) % WORLD.width;
}

/** A pad's width in metres on a given round: a little narrower every round, down to a floor. */
export function padWidth(multiplier, round, settings = TERRAIN) {
  const base = settings.padWidths[multiplier];
  return Math.max(settings.minPadWidths[multiplier], base * settings.padShrink ** (round - 1));
}

/**
 * Midpoint displacement: start from the two ends, then repeatedly put a point
 * halfway between each pair, nudged by a random amount that shrinks at every
 * finer level. The ends share one height, so the wrap is seamless.
 */
function heightMap(rng, settings) {
  const { segments: n, minHeight, maxHeight } = settings;
  const heights = new Array(n + 1);
  const middle = (minHeight + maxHeight) / 2;
  heights[0] = fold(middle + (rng() * 2 - 1) * 40, minHeight, maxHeight);
  heights[n] = heights[0];
  let amplitude = settings.amplitude;
  for (let size = n; size > 1; size /= 2) {
    for (let i = 0; i < n; i += size) {
      const average = (heights[i] + heights[i + size]) / 2;
      heights[i + size / 2] = fold(average + (rng() * 2 - 1) * amplitude, minHeight, maxHeight);
    }
    amplitude *= settings.roughness;
  }
  return heights;
}

/**
 * Flattens 3 or 4 pads into the height map: a wide 2×, one or two 3× and a
 * narrow 5×. Pads keep a gap between them and stay clear of the wrap seam, and
 * the ground just beyond each end is lowered to a little below the pad if it
 * was higher, so a lander on the pad never has its body in a hillside, and the
 * pad's edge stays visible.
 */
function placePads(heights, rng, round, settings) {
  const n = settings.segments;
  const step = WORLD.width / n;
  const clearance = Math.ceil(settings.padClearance / step);
  const multipliers = rng() < 0.5 ? [2, 3, 5] : [2, 3, 3, 5];
  const pads = [];

  for (const multiplier of multipliers) {
    const cells = Math.ceil(padWidth(multiplier, round, settings) / step);
    const lowest = clearance + 1;
    const highest = n - clearance - 1 - cells;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const i0 = lowest + Math.floor(rng() * (highest - lowest + 1));
      const i1 = i0 + cells;
      const x0 = i0 * step;
      const x1 = i1 * step;
      const clash = pads.some((p) => x0 < p.x1 + settings.padGap && x1 > p.x0 - settings.padGap);
      if (clash) continue;

      let sum = 0;
      for (let i = i0; i <= i1; i += 1) sum += heights[i];
      const height = sum / (cells + 1);
      for (let i = i0; i <= i1; i += 1) heights[i] = height;
      const beside = Math.max(settings.minHeight, height - settings.padStep);
      for (let k = 1; k <= clearance; k += 1) {
        heights[i0 - k] = Math.min(heights[i0 - k], beside);
        heights[i1 + k] = Math.min(heights[i1 + k], beside);
      }
      pads.push({ x0, x1, height, multiplier });
      break;
    }
  }
  return pads.sort((a, b) => a.x0 - b.x0);
}

/** A round's terrain: { heights, step, pads }. The same rng sequence gives the same terrain. */
export function generateTerrain(rng, round = 1, settings = TERRAIN) {
  const heights = heightMap(rng, settings);
  const pads = placePads(heights, rng, round, settings);
  return { heights, step: WORLD.width / settings.segments, pads };
}

/** The ground's height under x, between the two nearest points of the height map. */
export function groundHeight(terrain, x) {
  const f = wrapX(x) / terrain.step;
  const i = Math.min(Math.floor(f), terrain.heights.length - 2);
  const t = f - i;
  return terrain.heights[i] * (1 - t) + terrain.heights[i + 1] * t;
}

/** The pad under x, or null. */
export function padAt(terrain, x) {
  const w = wrapX(x);
  return terrain.pads.find((p) => w >= p.x0 && w <= p.x1) ?? null;
}

/**
 * Whether a point moving in a straight line from (x0, y0) to (x1, y1) during
 * one step meets the ground. Besides the end point, every height-map vertex the
 * path passes over is checked, so a fast lander cannot slip through the tip of
 * a narrow peak between two steps.
 */
export function pathTouchesGround(terrain, x0, y0, x1, y1) {
  if (y1 <= groundHeight(terrain, x1)) return true;
  if (x0 === x1) return false;
  const n = terrain.heights.length - 1;
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  for (let k = Math.ceil(lo / terrain.step); k * terrain.step <= hi; k += 1) {
    const xv = k * terrain.step;
    const y = y0 + ((xv - x0) / (x1 - x0)) * (y1 - y0);
    const vertex = terrain.heights[((k % n) + n) % n];
    if (vertex >= y) return true;
  }
  return false;
}
