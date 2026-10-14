// Run with: node --test (from pacman/)
// game.js is pure ESM with no DOM references, so it imports straight into Node.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  start,
  advanceClock,
  steer,
  togglePause,
  frightFlashing,
  deathMs,
} from './game.js';
import { ghostByName } from './ghosts.js';
import { TICK_MS, levelSpec } from './config.js';

/** A running game, past READY. With `ghosts: false` the maze is Pac-Man's alone. */
function play({ ghosts = true, ...settings } = {}) {
  const state = createGame({ startMs: 0, readyMs: 0, ...settings }, () => 0);
  start(state);
  if (!ghosts) state.ghosts = [];
  return state;
}

function run(state, ticks) {
  for (let i = 0; i < ticks; i += 1) advanceClock(state, TICK_MS);
}

function runUntil(state, done, limit = 2000) {
  for (let i = 0; i < limit && !done(); i += 1) advanceClock(state, TICK_MS);
  assert.ok(done(), 'condition never met');
}

function clearDots(state) {
  for (const row of state.maze.dots) row.fill(0);
  state.dotsLeft = 0;
}

function putDot(state, col, row, value = 1) {
  state.maze.dots[row][col] = value;
  state.dotsLeft += 1;
}

test('a game waits on the ready screen, counts down, then runs', () => {
  const state = createGame({ startMs: 1000 });
  assert.equal(state.status, 'ready');
  advanceClock(state, 500);
  assert.equal(state.status, 'ready');
  start(state);
  assert.equal(state.status, 'countdown');
  advanceClock(state, 999);
  assert.equal(state.status, 'countdown');
  advanceClock(state, 1);
  assert.equal(state.status, 'running');
  assert.equal(state.lives, 3);
});

test('Pac-Man sets off left and eats the dots in his way', () => {
  const state = play({ ghosts: false });
  run(state, 30);
  assert.ok(state.pac.x < 13.5);
  assert.ok(state.score >= 10);
  assert.equal(state.score % 10, 0);
  assert.equal(state.dotsLeft, 244 - state.score / 10);
});

test('eating stops him a frame per dot, so a lane of dots is slower than an empty one', () => {
  const empty = play({ ghosts: false });
  clearDots(empty);
  putDot(empty, 1, 1); // somewhere far away, so the level is not cleared
  const full = play({ ghosts: false });
  run(empty, 40);
  run(full, 40);
  assert.ok(full.pac.x > empty.pac.x);
});

test('a turn pressed early is taken at the next junction', () => {
  const state = play({ ghosts: false });
  Object.assign(state.pac, { x: 9, y: 5, dir: 'left' });
  steer(state, 'up');
  runUntil(state, () => state.pac.dir === 'up');
  // The first lane up is at column 6.
  run(state, 10);
  assert.equal(state.pac.x, 6);
  assert.ok(state.pac.y < 5);
});

test('he can take a turn a little before the centre and cut the corner', () => {
  const state = play({ ghosts: false });
  Object.assign(state.pac, { x: 6.3, y: 5, dir: 'left' });
  steer(state, 'up');
  run(state, 1);
  assert.equal(state.pac.dir, 'up');
  assert.ok(state.pac.x < 6.3 && state.pac.x >= 6);
  assert.ok(state.pac.y < 5);
  run(state, 5);
  assert.equal(state.pac.x, 6);
});

test('but not from too far away', () => {
  const state = play({ ghosts: false });
  Object.assign(state.pac, { x: 6.5, y: 5, dir: 'left' });
  // 6.5 is equally far from 6 and 7; (7, 4) is wall.
  steer(state, 'up');
  run(state, 1);
  assert.equal(state.pac.dir, 'left');
});

test('he can turn back anywhere', () => {
  const state = play({ ghosts: false });
  Object.assign(state.pac, { x: 8.6, y: 5, dir: 'left' });
  steer(state, 'right');
  run(state, 1);
  assert.equal(state.pac.dir, 'right');
  assert.ok(state.pac.x > 8.6);
});

test('he stops at a wall and sets off again when steered', () => {
  const state = play({ ghosts: false });
  Object.assign(state.pac, { x: 1, y: 2, dir: 'up' });
  run(state, 30);
  assert.deepEqual([state.pac.x, state.pac.y, state.pac.moving], [1, 1, false]);
  steer(state, 'right');
  run(state, 10);
  assert.ok(state.pac.x > 1);
});

test('he goes through the tunnel', () => {
  const state = play({ ghosts: false });
  Object.assign(state.pac, { x: 1, y: 14, dir: 'left' });
  run(state, 30);
  assert.ok(state.pac.x > 20);
  assert.equal(state.pac.dir, 'left');
});

test('an energizer scores 50, turns the ghosts blue and turns them around', () => {
  const state = play();
  const blinky = ghostByName(state, 'blinky');
  Object.assign(state.pac, { x: 1, y: 4, dir: 'up' });
  state.maze.dots[4][1] = 0; // the dot he is standing on
  const before = state.score;
  runUntil(state, () => state.frightTimer > 0);
  assert.equal(state.score - before, 50);
  assert.equal(blinky.frightened, true);
  // Blinky started heading left; the energizer turned him around.
  assert.equal(blinky.dir, 'right');
  assert.ok(state.frightTimer > levelSpec(1).frightMs - 100);
});

test('ghosts eaten on one energizer score 200, 400, 800, 1600, each with a pause', () => {
  const state = play();
  clearDots(state);
  putDot(state, 1, 29);
  state.frightTimer = 5000;
  for (const ghost of state.ghosts) {
    Object.assign(ghost, { x: 6, y: 5, dir: 'up', state: 'active', frightened: true });
  }
  Object.assign(state.pac, { x: 6.2, y: 5, dir: 'left' });

  const points = [];
  for (let i = 0; i < 4; i += 1) {
    runUntil(state, () => state.freeze);
    points.push(state.freeze.points);
    const score = state.score;
    run(state, 30); // still frozen
    assert.equal(state.score, score);
    runUntil(state, () => !state.freeze);
  }
  assert.deepEqual(points, [200, 400, 800, 1600]);
  assert.equal(state.score, 3000);
  assert.ok(state.ghosts.every((g) => g.state === 'eyes' || g.state === 'entering'));
});

test('being caught costs a life and sends everyone home', () => {
  const state = play();
  const blinky = ghostByName(state, 'blinky');
  Object.assign(blinky, { x: 6, y: 5, dir: 'right' });
  Object.assign(state.pac, { x: 7, y: 5, dir: 'left' });
  runUntil(state, () => state.status !== 'running', 30);
  assert.equal(state.status, 'dying');
  advanceClock(state, deathMs(state.config));
  assert.equal(state.lives, 2);
  assert.equal(state.status, 'running'); // readyMs is 0 here
  assert.deepEqual([state.pac.x, state.pac.y], [13.5, 23]);
  assert.deepEqual([blinky.x, blinky.y], [13.5, 11]);
  assert.equal(state.globalDots, 0);
  assert.equal(state.elroySuspended, true);
});

test('losing the last life ends the game', () => {
  const state = play();
  state.lives = 1;
  Object.assign(ghostByName(state, 'blinky'), { x: 6, y: 5, dir: 'right' });
  Object.assign(state.pac, { x: 7, y: 5, dir: 'left' });
  runUntil(state, () => state.status === 'dying', 30);
  advanceClock(state, deathMs(state.config));
  assert.equal(state.status, 'over');
  assert.equal(state.lives, 0);
});

test('eating the last dot clears the level and the next one starts full', () => {
  const state = play({ ghosts: false, clearMs: 1000 });
  clearDots(state);
  putDot(state, 12, 23);
  runUntil(state, () => state.status === 'cleared');
  assert.equal(state.dotsLeft, 0);
  advanceClock(state, 1000);
  assert.equal(state.level, 2);
  assert.equal(state.dotsLeft, 244);
  assert.equal(state.ghosts.length, 4);
  assert.equal(state.status, 'running');
});

test('one extra life at 10,000 points', () => {
  const state = play({ ghosts: false });
  state.score = 9990;
  runUntil(state, () => state.score >= 10000);
  assert.equal(state.lives, 4);
  state.score = 19990;
  runUntil(state, () => state.score >= 20000);
  assert.equal(state.lives, 4);
});

test('a fruit appears after 70 dots, and is worth its level\'s points', () => {
  const state = play({ ghosts: false });
  state.dotsEaten = 69;
  runUntil(state, () => state.fruit);
  assert.equal(state.fruit.name, 'cherries');
  Object.assign(state.pac, { x: 16, y: 17, dir: 'left' });
  const before = state.score;
  runUntil(state, () => !state.fruit);
  assert.equal(state.score - before, 100);
  assert.equal(state.popups.length, 1);
});

test('an uneaten fruit goes away after a while', () => {
  const state = play({ ghosts: false, fruitMs: 500 });
  state.dotsEaten = 69;
  runUntil(state, () => state.fruit);
  run(state, 31);
  assert.equal(state.fruit, null);
});

test('the ghosts scatter for seven seconds, then chase', () => {
  const state = play();
  assert.equal(state.mode, 'scatter');
  run(state, 7 * 60 - 1);
  assert.equal(state.mode, 'scatter');
  run(state, 2);
  assert.equal(state.mode, 'chase');
});

test('the scatter and chase clock stops while the ghosts are frightened', () => {
  const state = play();
  state.frightTimer = 1e9;
  run(state, 8 * 60);
  assert.equal(state.mode, 'scatter');
  assert.equal(state.modeTimer, 0);
});

test('fright ends with the ghosts flashing', () => {
  const state = play();
  for (const ghost of state.ghosts) ghost.frightened = true;
  state.frightTimer = 2100; // level 1 flashes five times in the last 2 s
  assert.equal(frightFlashing(state), false);
  state.frightTimer = 1900;
  assert.equal(frightFlashing(state), true);
  state.frightTimer = 50;
  run(state, 4);
  assert.equal(state.frightTimer, 0);
  assert.ok(state.ghosts.every((g) => !g.frightened));
});

test('nothing moves while paused', () => {
  const state = play();
  togglePause(state);
  const x = state.pac.x;
  run(state, 60);
  assert.equal(state.pac.x, x);
  togglePause(state);
  run(state, 1);
  assert.notEqual(state.pac.x, x);
});

test('from level 19 energizers no longer frighten, but still turn the ghosts round', () => {
  const state = play();
  state.level = 19;
  const blinky = ghostByName(state, 'blinky');
  Object.assign(state.pac, { x: 1, y: 4, dir: 'up' });
  runUntil(state, () => state.maze.dots[3][1] === 0);
  assert.equal(blinky.frightened, false);
  assert.equal(state.frightTimer, 0);
  assert.equal(blinky.dir, 'right');
});
