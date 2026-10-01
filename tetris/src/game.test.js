// Run with: node --test (from tetris/)
// game.js is pure ESM with no DOM references, so it imports straight into Node.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  start,
  advanceClock,
  shift,
  rotate,
  hardDrop,
  holdPiece,
  setSoftDrop,
  togglePause,
  activeCells,
  ghostY,
  gravityInterval,
  clearLabel,
} from './game.js';
import { PIECE_TYPES } from './pieces.js';

const BOTTOM = 39;

/**
 * A running game whose next pieces are `types`, in order. The countdown is
 * skipped so the first piece is already on the board.
 */
function play(types = ['T'], settings = {}, rows = []) {
  const state = createGame({ countdownMs: 0, ...settings }, () => 0);
  setRows(state, rows);
  state.queue = [...types, ...state.queue];
  start(state);
  return state;
}

/** Fills the bottom of the board from strings, top row first. X is a mino. */
function setRows(state, rows) {
  rows.forEach((row, i) => {
    const y = BOTTOM - (rows.length - 1 - i);
    state.board[y] = [...row].map((char) => (char === '.' ? null : 'G'));
  });
}

/** Puts the active piece somewhere directly, as if it had fallen there. */
function place(state, type, rotation, x, y) {
  state.active = { type, rotation, x, y };
  state.lastAction = 'fall';
}

const cellKey = (cells) => cells.map(({ x, y }) => `${x},${y}`).sort().join(' ');

// ---------------------------------------------------------------------------
// Randomiser and spawning
// ---------------------------------------------------------------------------

test('every bag of seven holds one of each piece', () => {
  const state = createGame({}, Math.random);
  const seen = [];
  for (let i = 0; i < 70; i += 1) {
    seen.push(state.queue.shift());
    if (state.queue.length < 12) state.queue.push(...createGame({}, Math.random).queue);
  }
  for (let bag = 0; bag < 10; bag += 1) {
    assert.deepEqual([...seen.slice(bag * 7, bag * 7 + 7)].sort(), [...PIECE_TYPES].sort());
  }
});

test('the preview queue never runs short', () => {
  const state = play(['I', 'I', 'I', 'I', 'I', 'I', 'I', 'I']);
  for (let i = 0; i < 20; i += 1) {
    assert.ok(state.queue.length >= state.config.previewCount);
    state.board = state.board.map((row) => row.fill(null));
    hardDrop(state);
  }
});

test('pieces spawn centred and drop straight into view', () => {
  const t = play(['T']);
  assert.equal(cellKey(activeCells(t)), cellKey([{ x: 4, y: 19 }, { x: 3, y: 20 }, { x: 4, y: 20 }, { x: 5, y: 20 }]));

  const i = play(['I']);
  assert.equal(cellKey(activeCells(i)), cellKey([3, 4, 5, 6].map((x) => ({ x, y: 20 }))));

  const o = play(['O']);
  assert.deepEqual(activeCells(o).map((c) => c.x).sort(), [4, 4, 5, 5]);
});

test('nothing spawns until the countdown ends', () => {
  const state = createGame({}, () => 0);
  start(state);
  assert.equal(state.status, 'countdown');
  assert.equal(state.active, null);
  advanceClock(state, state.config.countdownMs - 1);
  assert.equal(state.active, null);
  advanceClock(state, 1);
  assert.equal(state.status, 'running');
  assert.ok(state.active);
  assert.equal(state.elapsed, 0, 'the clock starts at GO, not at READY');
});

test('a spawn overlapping the stack is a block out', () => {
  const state = createGame({ countdownMs: 0 }, () => 0);
  state.board[19][4] = 'G';
  state.board[20][4] = 'G';
  state.queue.unshift('T');
  start(state);
  assert.equal(state.status, 'over');
});

test('a piece locking entirely above the board is a lock out', () => {
  // A stack up to the top of the visible board, with a hole so no row clears.
  const rows = Array.from({ length: 20 }, () => 'XXXXXXXXX.');
  const state = play(['O', 'O'], {}, rows);
  assert.equal(state.status, 'running', 'the O still fits in the buffer');
  hardDrop(state);
  assert.equal(state.status, 'over');
});

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

test('walls stop sideways movement', () => {
  const state = play(['T']);
  let moves = 0;
  while (shift(state, -1)) moves += 1;
  assert.equal(moves, 3);
  assert.equal(Math.min(...activeCells(state).map((c) => c.x)), 0);
  moves = 0;
  while (shift(state, 1)) moves += 1;
  assert.equal(moves, 7);
});

test('nothing moves unless the game is running', () => {
  const state = play(['T']);
  togglePause(state);
  assert.equal(shift(state, 1), false);
  assert.equal(rotate(state, 1), false);
  assert.equal(hardDrop(state), false);
  assert.equal(holdPiece(state), false);
});

test('gravity drops one row a second at level 1', () => {
  assert.equal(gravityInterval(1), 1000);
  const state = play(['T']);
  const y = state.active.y;
  advanceClock(state, 999);
  assert.equal(state.active.y, y);
  advanceClock(state, 1);
  assert.equal(state.active.y, y + 1);
});

test('gravity speeds up with the level', () => {
  for (let level = 2; level <= 15; level += 1) {
    assert.ok(gravityInterval(level) < gravityInterval(level - 1));
  }
});

test('fast gravity steps row by row instead of falling through the stack', () => {
  const state = play(['T'], { startLevel: 15 }, ['XXXXXXXXX.']);
  advanceClock(state, 200);
  assert.equal(Math.max(...activeCells(state).map((c) => c.y)), BOTTOM - 1);
});

test('soft drop moves at once and then runs twenty times faster', () => {
  const state = play(['T']);
  const y = state.active.y;
  setSoftDrop(state, true);
  assert.equal(state.active.y, y + 1);
  assert.equal(state.score, 1);
  advanceClock(state, 50);
  assert.equal(state.active.y, y + 2);
  assert.equal(state.score, 2);
  setSoftDrop(state, false);
  advanceClock(state, 50);
  assert.equal(state.active.y, y + 2);
});

test('hard drop lands on the stack, locks and scores two a row', () => {
  const state = play(['T', 'O']);
  const rows = ghostY(state) - state.active.y;
  hardDrop(state);
  assert.equal(state.score, rows * 2);
  assert.equal(state.board[BOTTOM][3], 'T');
  assert.equal(state.board[BOTTOM][5], 'T');
  assert.equal(state.board[BOTTOM - 1][4], 'T');
  assert.equal(state.active.type, 'O');
});

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

test('rotation cycles through the four states', () => {
  const state = play(['T']);
  for (const expected of [1, 2, 3, 0]) {
    assert.ok(rotate(state, 1));
    assert.equal(state.active.rotation, expected);
  }
  assert.ok(rotate(state, -1));
  assert.equal(state.active.rotation, 3);
});

test('an I against the left wall kicks out to rotate', () => {
  const state = play(['I']);
  rotate(state, 1); // vertical, in column x + 2
  while (shift(state, -1));
  assert.equal(state.active.x, -2);
  assert.ok(rotate(state, 1));
  assert.equal(state.active.rotation, 2);
  assert.equal(state.lastKick, 2, 'the first two tests stay in the wall; the third moves right two');
  assert.equal(state.active.x, 0);
});

test('a rotation with no kick that fits is refused', () => {
  // A vertical I at the bottom of a one-wide shaft: every clockwise kick lands
  // the flat I on a row of the shaft, so it cannot turn at all.
  const shaft = Array.from({ length: 6 }, () => 'XXXX.XXXXX');
  const state = play(['I'], {}, shaft);
  place(state, 'I', 1, 2, BOTTOM - 3);
  const before = { ...state.active };
  assert.equal(rotate(state, 1), false);
  assert.deepEqual(state.active, before);
});

// ---------------------------------------------------------------------------
// Lock delay
// ---------------------------------------------------------------------------

test('a grounded piece locks after the lock delay', () => {
  const state = play(['T', 'O']);
  state.active.y = ghostY(state);
  advanceClock(state, 499);
  assert.equal(state.pieces, 0);
  advanceClock(state, 1);
  assert.equal(state.pieces, 1);
});

test('moving on the ground restarts the lock timer', () => {
  const state = play(['T', 'O']);
  state.active.y = ghostY(state);
  advanceClock(state, 400);
  assert.ok(shift(state, 1));
  advanceClock(state, 400);
  assert.equal(state.pieces, 0);
  assert.equal(state.lockResets, 1);
});

test('the lock timer stops resetting after fifteen moves', () => {
  const state = play(['T', 'O']);
  state.active.y = ghostY(state);
  for (let i = 0; i < 15; i += 1) {
    advanceClock(state, 100);
    assert.ok(shift(state, i % 2 ? -1 : 1));
  }
  assert.equal(state.lockResets, 15);
  advanceClock(state, 300);
  assert.ok(shift(state, 1), 'the piece can still move…');
  advanceClock(state, 200);
  assert.equal(state.pieces, 1, '…but the timer ran on and it locked');
});

test('falling to a new lowest row gives the resets back', () => {
  const state = play(['T', 'O'], {}, ['XXX...XXXX']);
  // Resting on the ledge, all resets spent.
  state.active.x = 0;
  state.active.y = ghostY(state);
  state.lowestY = state.active.y;
  state.lockResets = 15;
  // Slide over the gap and drop into it.
  while (shift(state, 1) && state.active.x < 3);
  advanceClock(state, 999);
  advanceClock(state, 1); // gravity pulls it into the gap
  assert.equal(state.lockResets, 0);
  assert.equal(state.pieces, 0);
});

// ---------------------------------------------------------------------------
// Clearing and scoring
// ---------------------------------------------------------------------------

// Four rows with the left column open, over one that will not clear.
const TETRIS_WELL = ['.XXXXXXXXX', '.XXXXXXXXX', '.XXXXXXXXX', '.XXXXXXXXX', 'XXXXXXXXX.'];

function dropIntoLeftWell(state) {
  rotate(state, 1);
  while (shift(state, -1));
  hardDrop(state);
}

test('a tetris scores 800 at level 1 and removes four rows', () => {
  const state = play(['I', 'O'], {}, TETRIS_WELL);
  state.score = 0;
  const before = state.score;
  dropIntoLeftWell(state);
  const dropPoints = state.score - before - 800;
  assert.ok(dropPoints > 0 && dropPoints % 2 === 0);
  assert.equal(state.lines, 4);
  assert.equal(state.lastClear.lines, 4);
  assert.equal(state.lastClear.points, 800);
  assert.deepEqual(state.board[BOTTOM].map((c) => c !== null), [...'XXXXXXXXX.'].map((c) => c === 'X'));
  assert.ok(state.board[BOTTOM - 1].every((c) => c === null));
});

test('clears scale with the level', () => {
  const state = play(['I', 'O'], { startLevel: 3 }, TETRIS_WELL);
  dropIntoLeftWell(state);
  assert.equal(state.lastClear.points, 2400);
});

test('back-to-back tetrises earn half as much again, plus the combo', () => {
  const well = [...TETRIS_WELL.slice(0, 4), ...TETRIS_WELL];
  const state = play(['I', 'I', 'O'], {}, well);
  dropIntoLeftWell(state);
  assert.equal(state.lastClear.backToBack, false);
  dropIntoLeftWell(state);
  assert.equal(state.lastClear.backToBack, true);
  assert.equal(state.lastClear.combo, 1);
  assert.equal(state.lastClear.points, 800 * 1.5 + 50);
});

test('an easy clear breaks back-to-back', () => {
  const state = play(['I', 'I', 'I'], {}, [
    '.XXXXXXXXX', // one row: a single
    '.XXXXXXXXX', '.XXXXXXXXX', '.XXXXXXXXX', '.XXXXXXXXX',
    'XXXXXXXXX.',
  ]);
  dropIntoLeftWell(state);
  assert.equal(state.lastClear.lines, 4);
  assert.equal(state.backToBack, true);
  // The next I clears the one row left: a single.
  dropIntoLeftWell(state);
  assert.equal(state.lastClear.lines, 1);
  assert.equal(state.backToBack, false);
});

test('a lock that clears nothing ends the combo', () => {
  const state = play(['I', 'O', 'O'], {}, TETRIS_WELL);
  dropIntoLeftWell(state);
  assert.equal(state.combo, 0);
  hardDrop(state);
  assert.equal(state.combo, -1);
});

test('emptying the board is a perfect clear', () => {
  const state = play(['I', 'O'], {}, ['.XXXXXXXXX', '.XXXXXXXXX', '.XXXXXXXXX', '.XXXXXXXXX']);
  dropIntoLeftWell(state);
  assert.equal(state.lastClear.perfect, true);
  assert.equal(state.lastClear.points, 800 + 2000);
});

// The classic T-spin double slot, with an overhang at the top left.
const TSD_SLOT = [
  'XXXX......',
  'XXX...XXXX',
  'XXXX.XXXXX',
];

test('rotating a T into a covered slot is a T-spin', () => {
  const state = play(['T', 'O'], {}, TSD_SLOT);
  place(state, 'T', 3, 3, BOTTOM - 2);
  assert.ok(rotate(state, -1));
  assert.equal(state.lastKick, 0);
  hardDrop(state);
  assert.equal(state.lastClear.tspin, 'full');
  assert.equal(state.lastClear.lines, 2);
  assert.equal(state.lastClear.points, 1200);
  assert.equal(clearLabel(state.lastClear), 'T-SPIN DOUBLE');
  assert.equal(state.backToBack, true);
});

test('the same slot filled without a rotation is a plain double', () => {
  const state = play(['T', 'O'], {}, TSD_SLOT);
  place(state, 'T', 2, 3, BOTTOM - 2);
  hardDrop(state);
  assert.equal(state.lastClear.tspin, null);
  assert.equal(state.lastClear.points, 300);
  assert.equal(state.backToBack, false);
});

test('a T kicked into a corner without its front covered is a mini', () => {
  const state = play(['T', 'O'], {}, ['.X........']);
  place(state, 'T', 0, 0, BOTTOM - 2);
  assert.ok(rotate(state, 1));
  assert.equal(state.lastKick, 1);
  hardDrop(state);
  assert.equal(state.lastClear.tspin, 'mini');
  assert.equal(state.lastClear.lines, 0);
  assert.equal(state.score, 100);
  assert.equal(clearLabel(state.lastClear), 'T-SPIN MINI');
});

// ---------------------------------------------------------------------------
// Hold
// ---------------------------------------------------------------------------

test('hold swaps once per piece', () => {
  const state = play(['T', 'I', 'O']);
  assert.ok(holdPiece(state));
  assert.equal(state.hold, 'T');
  assert.equal(state.active.type, 'I');
  assert.equal(holdPiece(state), false, 'no second hold for the same piece');
  hardDrop(state);
  assert.equal(state.active.type, 'O');
  assert.ok(holdPiece(state));
  assert.equal(state.active.type, 'T');
  assert.equal(state.hold, 'O');
  assert.equal(state.active.rotation, 0, 'a held piece comes back in its spawn state');
});

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

test('marathon levels up every ten lines', () => {
  const state = play(['I', 'O'], {}, TETRIS_WELL);
  state.lines = 8;
  dropIntoLeftWell(state);
  assert.equal(state.lines, 12);
  assert.equal(state.level, 2);
});

test('sprint keeps level 1 gravity', () => {
  const state = play(['I', 'O'], { mode: 'sprint' }, TETRIS_WELL);
  state.lines = 8;
  dropIntoLeftWell(state);
  assert.equal(state.level, 1);
});

test('reaching the line goal wins the round', () => {
  for (const [mode, goal] of [['marathon', 150], ['sprint', 40]]) {
    const state = play(['I', 'O'], { mode }, TETRIS_WELL);
    assert.equal(state.config.lineGoal, goal);
    state.lines = goal - 4;
    dropIntoLeftWell(state);
    assert.equal(state.status, 'won', mode);
    assert.equal(state.active, null);
  }
});

test('the round clock runs only while playing', () => {
  const state = play(['T']);
  advanceClock(state, 300);
  togglePause(state);
  advanceClock(state, 5000);
  togglePause(state);
  advanceClock(state, 200);
  assert.equal(state.elapsed, 500);
});

test('clear labels', () => {
  assert.equal(clearLabel({ lines: 1, tspin: null }), 'SINGLE');
  assert.equal(clearLabel({ lines: 4, tspin: null }), 'TETRIS');
  assert.equal(clearLabel({ lines: 0, tspin: 'full' }), 'T-SPIN');
  assert.equal(clearLabel({ lines: 1, tspin: 'mini' }), 'T-SPIN MINI SINGLE');
});
