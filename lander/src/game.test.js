// Run with: node --test (from lander/)
// game.js is pure ESM with no DOM references, so it imports straight into Node.

import test from 'node:test';
import assert from 'node:assert/strict';

import { advanceClock, createGame, setControls, start, togglePause } from './game.js';
import { FUEL, ROUND, SCORING, TICK_MS, WORLD } from './config.js';
import { flatTerrain, landerAbove, seeded } from './testing.js';

function run(state, ticks) {
  for (let i = 0; i < ticks; i += 1) advanceClock(state, TICK_MS);
}

function runUntil(state, done, limit = 6000) {
  for (let i = 0; i < limit && !done(); i += 1) advanceClock(state, TICK_MS);
  assert.ok(done(), 'condition never met');
}

/** A flying game over flat ground at 20 m, the lander placed as asked. */
function approach(lander, settings = {}) {
  const state = createGame({ resultMs: 1000, ...settings }, seeded(3));
  start(state);
  state.terrain = flatTerrain(20);
  state.lander = landerAbove(20, 0.1, lander);
  return state;
}

const touchedDown = (state) => state.status !== 'flying';

test('a game waits on the ready screen, then flies', () => {
  const state = createGame({}, seeded(1));
  assert.equal(state.status, 'ready');
  const x = state.lander.x;
  advanceClock(state, 500);
  assert.equal(state.lander.x, x);
  start(state);
  assert.equal(state.status, 'flying');
  run(state, 30);
  assert.notEqual(state.lander.x, x);
  assert.ok(state.lander.y < ROUND.startAltitude);
});

test('each round starts high up near a side, drifting toward the other', () => {
  for (let seed = 1; seed < 30; seed += 1) {
    const { lander } = createGame({}, seeded(seed));
    assert.equal(lander.y, ROUND.startAltitude);
    const fromLeft = lander.x < WORLD.width / 2;
    assert.equal(fromLeft, lander.vx > 0);
    assert.ok(Math.abs(lander.vx) >= ROUND.startDrift[0] && Math.abs(lander.vx) <= ROUND.startDrift[1]);
  }
});

test('a good landing scores 50 × the pad plus the fuel bonus, and gives fuel back', () => {
  const state = approach({ vy: -1.5 });
  runUntil(state, () => touchedDown(state));
  assert.equal(state.status, 'landed');
  assert.equal(state.result.outcome, 'good');
  assert.equal(state.result.multiplier, 2);
  assert.equal(state.score, SCORING.good * 2 + Math.floor(FUEL.start / SCORING.fuelPerPoint));
  assert.equal(state.fuel, FUEL.start + FUEL.landingBonus);
  // Settled on the pad, at rest.
  assert.equal(state.lander.vy, 0);
  assert.ok(Math.abs(state.lander.y - (20 + 6)) < 1e-9);
});

test('a hard landing scores 15 × the pad and no fuel', () => {
  const state = approach({ vy: -3.2 });
  runUntil(state, () => touchedDown(state));
  assert.equal(state.result.outcome, 'hard');
  assert.equal(state.score, SCORING.hard * 2);
  assert.equal(state.fuel, FUEL.start);
});

test('a crash scores 5 and costs 250 fuel', () => {
  const state = approach({ vy: -6 });
  runUntil(state, () => touchedDown(state));
  assert.equal(state.status, 'crashed');
  assert.equal(state.score, SCORING.crash);
  assert.equal(state.fuel, FUEL.start - FUEL.crashPenalty);
});

test('a gentle touchdown off the pad is still a crash', () => {
  const state = approach({ x: 60, vy: -0.5 });
  runUntil(state, () => touchedDown(state));
  assert.equal(state.result.outcome, 'crash');
});

test('thrust can bring a fast descent down to a landing', () => {
  const state = approach({ vy: -12 });
  state.lander.y += 60;
  // A simple autopilot: burn whenever falling faster than 1.5 m/s.
  runUntil(state, () => {
    setControls(state, { thrust: state.lander.vy < -1.5 });
    return touchedDown(state);
  });
  assert.equal(state.result.outcome, 'good');
  assert.ok(state.fuel < FUEL.start + FUEL.landingBonus);
});

test('after the outcome shows, the next round starts on new terrain', () => {
  const state = approach({ vy: -1.5 });
  runUntil(state, () => touchedDown(state));
  const terrain = state.terrain;
  advanceClock(state, 999);
  assert.equal(state.status, 'landed');
  advanceClock(state, 1);
  assert.equal(state.status, 'flying');
  assert.equal(state.round, 2);
  assert.notEqual(state.terrain, terrain);
  assert.equal(state.lander.y, ROUND.startAltitude);
});

test('the game ends when a round finishes with no fuel left', () => {
  const state = approach({ vy: -6 }, { fuel: 200 });
  runUntil(state, () => touchedDown(state));
  assert.equal(state.fuel, 0);
  advanceClock(state, 1000);
  assert.equal(state.status, 'over');
});

test('running dry in flight kills the engine but the round plays out', () => {
  const state = approach({}, { fuel: 5 });
  state.lander.y += 100;
  setControls(state, { thrust: true });
  run(state, 60);
  assert.equal(state.fuel, 0);
  assert.equal(state.lander.thrusting, false);
  runUntil(state, () => touchedDown(state));
  assert.equal(state.status, 'crashed');
});

test('a good landing on an empty tank keeps the game going', () => {
  const state = approach({ vy: -1.5 }, { fuel: 0 });
  runUntil(state, () => touchedDown(state));
  assert.equal(state.fuel, FUEL.landingBonus);
  advanceClock(state, 1000);
  assert.equal(state.status, 'flying');
});

test('crossing the side of the world is not a touchdown', () => {
  const state = approach({ x: WORLD.width - 0.5, vx: 10, vy: 0 });
  state.lander.y += 50;
  run(state, 30);
  assert.equal(state.status, 'flying');
  assert.ok(state.lander.x > 0 && state.lander.x < 10);
});

test('nothing moves while paused', () => {
  const state = approach({ vy: -1 });
  state.lander.y += 50;
  togglePause(state);
  const y = state.lander.y;
  run(state, 60);
  assert.equal(state.lander.y, y);
  togglePause(state);
  run(state, 1);
  assert.notEqual(state.lander.y, y);
});
