// Helpers shared by the tests. Not loaded by the game.

import { TERRAIN, WORLD } from './config.js';

export { seeded } from './random.js';

/**
 * Flat ground at `height` everywhere, with one 2× pad from x 100 to 140 and
 * any extra pads given. Easier to reason about in tests than generated terrain.
 */
export function flatTerrain(height = 20, pads = []) {
  return {
    heights: new Array(TERRAIN.segments + 1).fill(height),
    step: WORLD.width / TERRAIN.segments,
    pads: [{ x0: 100, x1: 140, height, multiplier: 2 }, ...pads],
  };
}

/** A lander with its feet `clearance` m above `ground`, upright and still unless told otherwise. */
export function landerAbove(ground, clearance, props = {}) {
  return { x: 120, y: ground + 6 + clearance, vx: 0, vy: 0, angle: 0, thrusting: false, ...props };
}
