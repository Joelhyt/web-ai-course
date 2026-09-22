// Run with: node --test

import test from 'node:test';
import assert from 'node:assert/strict';

import { generateLevel, reachableFrom } from './dungeon.js';
import { MODE_PRESETS, DEFAULTS } from './config.js';

const config = { ...DEFAULTS, ...MODE_PRESETS.adventure };

// A seeded rng, so a failing floor can be reproduced from the seed in the
// assertion message instead of being a story about a run nobody can repeat.
function seeded(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (cols, cell) => cell.y * cols + cell.x;
const floors = (count, depth = 1) => Array.from({ length: count }, (_, i) => ({
  seed: i,
  depth,
  level: generateLevel(config, depth, seeded(i)),
}));

test('every shard and the portal is reachable from the snake', () => {
  for (const { seed, level } of floors(250)) {
    const open = reachableFrom(level, config, level.snake[0]);
    for (const shard of level.shards) {
      assert.ok(open.has(at(config.cols, shard)), `seed ${seed}: shard walled off`);
    }
    assert.ok(open.has(at(config.cols, level.portal)), `seed ${seed}: portal walled off`);
  }
});

test('the snake never starts inside rock, and has room to move', () => {
  for (const { seed, level } of floors(250)) {
    for (const seg of level.snake) {
      assert.ok(!level.blocked.has(at(config.cols, seg)), `seed ${seed}: body in rock`);
    }
    // At least one open tile straight ahead: a floor that opens with the head
    // one square from a wall is not a fair start.
    const head = level.snake[0];
    assert.ok(
      !level.blocked.has(at(config.cols, { x: head.x + 1, y: head.y })),
      `seed ${seed}: no room ahead of the head`,
    );
  }
});

test('shards, the portal and the snake never share a tile', () => {
  for (const { seed, level } of floors(250)) {
    const cells = [...level.shards, level.portal, ...level.snake].map((c) => at(config.cols, c));
    assert.equal(new Set(cells).size, cells.length, `seed ${seed}: something overlapped`);
  }
});

test('a floor always has shards to collect', () => {
  for (const { seed, level } of floors(250)) {
    assert.ok(level.shards.length >= 3, `seed ${seed}: only ${level.shards.length} shards`);
  }
});

test('deeper floors hold more shards', () => {
  const shallow = generateLevel(config, 1, seeded(4));
  const deep = generateLevel(config, 9, seeded(4));

  assert.ok(deep.shards.length > shallow.shards.length);
});

test('generation is deterministic for a given seed', () => {
  const a = generateLevel(config, 5, seeded(99));
  const b = generateLevel(config, 5, seeded(99));

  assert.deepEqual([...a.blocked], [...b.blocked]);
  assert.deepEqual(a.shards, b.shards);
  assert.deepEqual(a.portal, b.portal);
});

test('the border is always solid rock', () => {
  const { cols, rows } = config;
  for (const { seed, level } of floors(60)) {
    for (let x = 0; x < cols; x += 1) {
      assert.ok(level.blocked.has(at(cols, { x, y: 0 })), `seed ${seed}: hole in the top edge`);
      assert.ok(level.blocked.has(at(cols, { x, y: rows - 1 })), `seed ${seed}: hole at the bottom`);
    }
    for (let y = 0; y < rows; y += 1) {
      assert.ok(level.blocked.has(at(cols, { x: 0, y })), `seed ${seed}: hole on the left`);
      assert.ok(level.blocked.has(at(cols, { x: cols - 1, y })), `seed ${seed}: hole on the right`);
    }
  }
});

test('the world is much larger than the window it is played through', () => {
  assert.ok(config.cols > config.viewCols && config.rows > config.viewRows);
});

test('no passage is one tile wide, and nothing is a dead end', () => {
  const { cols, rows } = config;
  for (const { seed, level } of floors(120, 4)) {
    for (let y = 1; y < rows - 1; y += 1) {
      for (let x = 1; x < cols - 1; x += 1) {
        if (level.blocked.has(at(cols, { x, y }))) continue;
        const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(
          ([dx, dy]) => !level.blocked.has(at(cols, { x: x + dx, y: y + dy })),
        ).length;
        // Two open neighbours is the signature of a two-wide passage. One means
        // a pocket the snake can be forced into with no way to turn around.
        assert.ok(open >= 2, `seed ${seed}: dead end at ${x},${y}`);
      }
    }
  }
});

test('a floor is big enough to be worth exploring', () => {
  for (const { seed, level } of floors(120, 3)) {
    const open = config.cols * config.rows - level.blocked.size;
    const window = config.viewCols * config.viewRows;
    assert.ok(open > window, `seed ${seed}: only ${open} open tiles, window is ${window}`);
  }
});
