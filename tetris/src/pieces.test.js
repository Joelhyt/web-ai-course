// Run with: node --test (from tetris/)

import test from 'node:test';
import assert from 'node:assert/strict';

import { PIECE_TYPES, SHAPES, pieceCells, kicksFor } from './pieces.js';

const key = (cells) => cells.map(({ x, y }) => `${x},${y}`).sort().join(' ');

test('every piece has four cells in all four rotation states', () => {
  for (const type of PIECE_TYPES) {
    for (let r = 0; r < 4; r += 1) assert.equal(pieceCells(type, r).length, 4, `${type}${r}`);
  }
});

test('rotation states follow SRS', () => {
  // T pointing right: the stem down the middle column, the nub to the right.
  assert.equal(key(pieceCells('T', 1)), key([{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }]));
  // I's four states are row 1, column 2, row 2, column 1 of its 4x4 box.
  assert.ok(pieceCells('I', 0).every((c) => c.y === 1));
  assert.ok(pieceCells('I', 1).every((c) => c.x === 2));
  assert.ok(pieceCells('I', 2).every((c) => c.y === 2));
  assert.ok(pieceCells('I', 3).every((c) => c.x === 1));
});

test('O looks the same in every state; the others have distinct ones', () => {
  const o = new Set([0, 1, 2, 3].map((r) => key(pieceCells('O', r))));
  assert.equal(o.size, 1);
  for (const type of ['J', 'L', 'T']) {
    assert.equal(new Set([0, 1, 2, 3].map((r) => key(pieceCells(type, r)))).size, 4, type);
  }
  assert.equal(SHAPES.I.size, 4);
  assert.equal(SHAPES.T.size, 3);
});

test('kick tables cover every quarter turn with five tests starting in place', () => {
  const turns = [[0, 1], [1, 0], [1, 2], [2, 1], [2, 3], [3, 2], [3, 0], [0, 3]];
  for (const type of ['I', 'T']) {
    for (const [from, to] of turns) {
      const kicks = kicksFor(type, from, to);
      assert.equal(kicks.length, 5, `${type} ${from}>${to}`);
      assert.deepEqual({ ...kicks[0] }, { x: 0, y: 0 });
    }
  }
  assert.equal(kicksFor('O', 0, 1).length, 1);
});

test('kick offsets are flipped into y-down board coordinates', () => {
  // The SRS table's 0>R third test is (-1, +1) with y up: left one, up one.
  assert.deepEqual({ ...kicksFor('T', 0, 1)[2] }, { x: -1, y: -1 });
  assert.deepEqual({ ...kicksFor('I', 0, 1)[4] }, { x: 1, y: -2 });
});
