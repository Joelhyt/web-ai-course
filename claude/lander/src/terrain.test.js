// Run with: node --test (from lander/)

import test from 'node:test';
import assert from 'node:assert/strict';

import { TERRAIN, WORLD } from './config.js';
import { generateTerrain, groundHeight, padAt, padWidth, pathTouchesGround, wrapX } from './terrain.js';
import { flatTerrain, seeded } from './testing.js';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

test('the same seed gives the same terrain, another seed another', () => {
  assert.deepEqual(generateTerrain(seeded(7)), generateTerrain(seeded(7)));
  assert.notDeepEqual(generateTerrain(seeded(7)).heights, generateTerrain(seeded(8)).heights);
});

test('heights stay in bounds and the two ends meet, so the wrap is seamless', () => {
  for (const seed of SEEDS) {
    const { heights } = generateTerrain(seeded(seed));
    assert.equal(heights.length, TERRAIN.segments + 1);
    assert.equal(heights[0], heights[TERRAIN.segments]);
    for (const h of heights) assert.ok(h >= TERRAIN.minHeight && h <= TERRAIN.maxHeight);
  }
});

test('every terrain has 3 or 4 pads: a 2×, a 5× and one or two 3×', () => {
  const counts = new Set();
  for (const seed of SEEDS) {
    const { pads } = generateTerrain(seeded(seed));
    counts.add(pads.length);
    const multipliers = pads.map((p) => p.multiplier).sort();
    assert.ok(
      multipliers.join() === '2,3,5' || multipliers.join() === '2,3,3,5',
      `seed ${seed}: ${multipliers}`,
    );
  }
  assert.deepEqual([...counts].sort(), [3, 4]);
});

test('pads are flat, wide enough, apart, clear of the seam, with nothing beside them higher', () => {
  for (const seed of SEEDS) {
    const round = 1 + (seed % 12);
    const terrain = generateTerrain(seeded(seed), round);
    const { heights, step, pads } = terrain;
    pads.forEach((pad, i) => {
      assert.ok(pad.x1 - pad.x0 >= padWidth(pad.multiplier, round) - 1e-9);
      assert.ok(pad.x0 >= TERRAIN.padClearance && pad.x1 <= WORLD.width - TERRAIN.padClearance);
      for (let x = pad.x0; x <= pad.x1; x += step / 2) {
        assert.ok(Math.abs(groundHeight(terrain, x) - pad.height) < 1e-9);
      }
      for (let d = 0; d <= TERRAIN.padClearance; d += 1) {
        assert.ok(groundHeight(terrain, pad.x0 - d) <= pad.height + 1e-9);
        assert.ok(groundHeight(terrain, pad.x1 + d) <= pad.height + 1e-9);
      }
      if (i > 0) assert.ok(pad.x0 - pads[i - 1].x1 >= TERRAIN.padGap);
    });
    assert.equal(heights[0], heights[heights.length - 1]);
  }
});

test('pads narrow a little each round, down to a floor', () => {
  assert.equal(padWidth(5, 1), TERRAIN.padWidths[5]);
  assert.ok(padWidth(5, 2) < padWidth(5, 1));
  assert.equal(padWidth(5, 50), TERRAIN.minPadWidths[5]);
  assert.equal(padWidth(2, 50), TERRAIN.minPadWidths[2]);
});

test('the ground is interpolated between points, and wraps', () => {
  const terrain = flatTerrain(20);
  terrain.heights[1] = 40;
  assert.equal(groundHeight(terrain, terrain.step / 2), 30);
  assert.equal(groundHeight(terrain, WORLD.width + terrain.step), 40);
  assert.equal(groundHeight(terrain, -WORLD.width + terrain.step), 40);
  assert.equal(wrapX(-1), WORLD.width - 1);
  assert.equal(padAt(terrain, 120).multiplier, 2);
  assert.equal(padAt(terrain, 520).multiplier, 2);
  assert.equal(padAt(terrain, 160), null);
});

test('a point is on the ground once it reaches it', () => {
  const terrain = flatTerrain(20);
  assert.equal(pathTouchesGround(terrain, 50, 21, 50, 20.5), false);
  assert.equal(pathTouchesGround(terrain, 50, 21, 50, 20), true);
  assert.equal(pathTouchesGround(terrain, 50, 21, 50, 15), true);
});

test('a fast sideways pass over a narrow peak still hits it', () => {
  const terrain = flatTerrain(20);
  terrain.heights[20] = 60; // a spike one vertex wide, at x = 62.5
  const x = 20 * terrain.step;
  // From one side of the spike to the other in one step, both ends in the clear.
  assert.ok(groundHeight(terrain, x - 3) < 50 && groundHeight(terrain, x + 3) < 50);
  assert.equal(pathTouchesGround(terrain, x - 3, 50, x + 3, 50), true);
  assert.equal(pathTouchesGround(terrain, x - 3, 70, x + 3, 70), false);
});
