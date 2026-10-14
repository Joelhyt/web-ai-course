// Run with: node --test (from pacman/)

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, start } from './game.js';
import {
  SCATTER_TARGETS,
  chooseDirection,
  countDot,
  elroyStage,
  ghostByName,
  ghostSpeed,
  moveGhost,
  targetTile,
  tilesAhead,
  updateRelease,
} from './ghosts.js';
import { levelSpec } from './config.js';

/** A game in chase mode, with Pac-Man standing on a tile and facing a way. */
function chase(pac = { x: 6, y: 5, dir: 'left' }) {
  const state = createGame({ startMs: 0 }, () => 0);
  start(state);
  state.mode = 'chase';
  Object.assign(state.pac, pac);
  return state;
}

function place(state, name, props) {
  const ghost = ghostByName(state, name);
  Object.assign(ghost, { state: 'active', ...props });
  return ghost;
}

test('in scatter each ghost aims for its own corner', () => {
  const state = chase();
  state.mode = 'scatter';
  for (const name of ['blinky', 'pinky', 'inky', 'clyde']) {
    assert.deepEqual(targetTile(state, ghostByName(state, name)), SCATTER_TARGETS[name]);
  }
});

test('Blinky aims straight at Pac-Man', () => {
  const state = chase();
  assert.deepEqual(targetTile(state, ghostByName(state, 'blinky')), { col: 6, row: 5 });
});

test('Pinky aims four tiles ahead, and four left as well when Pac-Man faces up', () => {
  const state = chase({ x: 6, y: 5, dir: 'right' });
  const pinky = ghostByName(state, 'pinky');
  assert.deepEqual(targetTile(state, pinky), { col: 10, row: 5 });
  state.pac.dir = 'up';
  assert.deepEqual(targetTile(state, pinky), { col: 2, row: 1 });
  assert.deepEqual(tilesAhead({ col: 6, row: 5 }, 'down', 4), { col: 6, row: 9 });
});

test("Inky doubles the line from Blinky to two tiles ahead of Pac-Man", () => {
  const state = chase({ x: 6, y: 5, dir: 'right' });
  place(state, 'blinky', { x: 3, y: 1, dir: 'left' });
  // Pivot (8, 5); from Blinky (3, 1) that is (+5, +4), doubled to (13, 9).
  assert.deepEqual(targetTile(state, ghostByName(state, 'inky')), { col: 13, row: 9 });
});

test('Clyde chases from afar but heads for his corner within eight tiles', () => {
  const state = chase({ x: 6, y: 5, dir: 'left' });
  const clyde = place(state, 'clyde', { x: 21, y: 26, dir: 'up' });
  assert.deepEqual(targetTile(state, clyde), { col: 6, row: 5 });
  Object.assign(clyde, { x: 6, y: 8 });
  assert.deepEqual(targetTile(state, clyde), SCATTER_TARGETS.clyde);
});

test('ghosts take the exit nearest their target, and never turn back on their own', () => {
  const state = chase({ x: 1, y: 5, dir: 'left' });
  // At the junction (6, 5): exits up, left, down, right. Coming from the left
  // (heading right), left is the way back and is ruled out even though the
  // target lies that way.
  const blinky = place(state, 'blinky', { x: 6, y: 5, dir: 'right' });
  const dir = chooseDirection(state, blinky);
  assert.notEqual(dir, 'left');
  // Up (6, 4) and down (6, 6) are both 5.1 tiles from (1, 5); up wins the tie.
  assert.equal(dir, 'up');
});

test('in scatter and chase ghosts cannot turn up from the four tiles above the house and the start', () => {
  const state = chase({ x: 12, y: 1, dir: 'left' });
  // (12, 11) has exits up, left and right. Pac-Man is straight up.
  const blinky = place(state, 'blinky', { x: 12, y: 11, dir: 'left' });
  assert.equal(chooseDirection(state, blinky), 'left');
  // Frightened ghosts are not bound by it.
  blinky.frightened = true;
  state.rng = () => 0; // "up" first
  assert.equal(chooseDirection(state, blinky), 'up');
});

test('frightened ghosts turn at random, or to the next open exit in order', () => {
  const state = chase();
  const blinky = place(state, 'blinky', { x: 1, y: 5, dir: 'up', frightened: true });
  // At (1, 5) heading up: exits up and right; down would be back.
  state.rng = () => 0.3; // "left" — a wall, so the next in order: down — back, so right
  assert.equal(chooseDirection(state, blinky), 'right');
  state.rng = () => 0; // "up"
  assert.equal(chooseDirection(state, blinky), 'up');
});

test('Cruise Elroy: with few dots left Blinky speeds up and ignores scatter', () => {
  const state = chase();
  state.mode = 'scatter';
  const blinky = place(state, 'blinky', { x: 1, y: 5, dir: 'up' });
  const spec = levelSpec(1);
  assert.equal(ghostSpeed(state, blinky), spec.ghost);

  state.dotsLeft = 20;
  assert.equal(elroyStage(state), 1);
  assert.equal(ghostSpeed(state, blinky), spec.elroy1);
  assert.deepEqual(targetTile(state, blinky), { col: 6, row: 5 });
  state.dotsLeft = 10;
  assert.equal(ghostSpeed(state, blinky), spec.elroy2);

  // After a lost life it waits until Clyde has left the house.
  state.elroySuspended = true;
  assert.equal(elroyStage(state), 0);
});

test('ghosts slow down in the tunnel', () => {
  const state = chase();
  const blinky = place(state, 'blinky', { x: 2, y: 14, dir: 'left' });
  assert.equal(ghostSpeed(state, blinky), levelSpec(1).tunnel);
});

test('on level 1 Pinky leaves at once, Inky after 30 dots and Clyde after 60 more', () => {
  const state = chase();
  updateRelease(state);
  assert.equal(ghostByName(state, 'pinky').state, 'leaving');

  for (let i = 0; i < 29; i += 1) countDot(state);
  updateRelease(state);
  assert.equal(ghostByName(state, 'inky').state, 'house');
  countDot(state);
  updateRelease(state);
  assert.equal(ghostByName(state, 'inky').state, 'leaving');

  for (let i = 0; i < 60; i += 1) countDot(state);
  updateRelease(state);
  assert.equal(ghostByName(state, 'clyde').state, 'leaving');
});

test('a ghost leaves anyway when Pac-Man goes four seconds without eating', () => {
  const state = chase();
  updateRelease(state); // Pinky
  state.dotTimer = 0;
  for (let i = 0; i < 235; i += 1) updateRelease(state);
  assert.equal(ghostByName(state, 'inky').state, 'house');
  for (let i = 0; i < 10; i += 1) updateRelease(state); // past four seconds
  assert.equal(ghostByName(state, 'inky').state, 'leaving');
});

test('after a lost life the house empties by the shared counter: 7, then 17', () => {
  const state = chase();
  state.globalDots = 0;
  for (let i = 0; i < 6; i += 1) countDot(state);
  updateRelease(state);
  assert.equal(ghostByName(state, 'pinky').state, 'house');
  countDot(state);
  updateRelease(state);
  assert.equal(ghostByName(state, 'pinky').state, 'leaving');
  for (let i = 0; i < 10; i += 1) countDot(state);
  updateRelease(state);
  assert.equal(ghostByName(state, 'inky').state, 'leaving');
  assert.equal(state.globalDots, 17);
});

test('a leaving ghost walks out through the door and turns left', () => {
  const state = chase();
  const inky = ghostByName(state, 'inky');
  inky.state = 'leaving';
  for (let i = 0; i < 600 && inky.state === 'leaving'; i += 1) moveGhost(state, inky);
  assert.equal(inky.state, 'active');
  assert.equal(inky.dir, 'left');
  assert.deepEqual({ x: inky.x, y: inky.y }, { x: 13.5, y: 11 });
});

test('eaten eyes find their way back, are revived in the house and come out again', () => {
  const state = chase();
  const clyde = place(state, 'clyde', { x: 1, y: 29, dir: 'right', state: 'eyes' });
  const seen = new Set();
  for (let i = 0; i < 2000 && !(seen.has('leaving') && clyde.state === 'active'); i += 1) {
    moveGhost(state, clyde);
    seen.add(clyde.state);
  }
  assert.ok(seen.has('entering'));
  assert.ok(seen.has('leaving'));
  assert.equal(clyde.state, 'active');
  assert.equal(clyde.frightened, false);
});
