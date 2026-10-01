// Run with: node --test (from lander/)

import test from 'node:test';
import assert from 'node:assert/strict';

import { LIMITS, PHYSICS, TICK_MS, WORLD } from './config.js';
import { altitude, contact, judge, landerPoints, stepLander, wrapLander } from './physics.js';
import { flatTerrain, landerAbove } from './testing.js';

const DT = TICK_MS / 1000;
const NONE = { left: false, right: false, thrust: false };
const close = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

function fly(lander, controls, seconds, fuel = 1000) {
  let left = fuel;
  for (let i = 0; i < Math.round(seconds * 60); i += 1) left -= stepLander(lander, controls, left, DT);
  return left;
}

test('free fall follows the Moon’s gravity', () => {
  const lander = { x: 50, y: 200, vx: 0, vy: 0, angle: 0 };
  fly(lander, NONE, 2);
  assert.ok(close(lander.vy, -PHYSICS.gravity * 2, 1e-9));
  // ½gt², give or take the half step semi-implicit Euler is off by.
  assert.ok(close(200 - lander.y, 0.5 * PHYSICS.gravity * 4, PHYSICS.gravity * 2 * DT));
});

test('thrust pushes along the lander’s axis', () => {
  const upright = { x: 50, y: 100, vx: 0, vy: 0, angle: 0 };
  fly(upright, { thrust: true }, 1);
  assert.ok(close(upright.vy, PHYSICS.thrust - PHYSICS.gravity, 1e-9));
  assert.equal(upright.vx, 0);

  const sideways = { x: 50, y: 100, vx: 0, vy: 0, angle: 90 };
  fly(sideways, { thrust: true }, 1);
  assert.ok(close(sideways.vx, PHYSICS.thrust, 1e-9));
  assert.ok(close(sideways.vy, -PHYSICS.gravity, 1e-9));
});

test('the lander turns at a fixed rate, up to its tilt limit', () => {
  const lander = { x: 50, y: 100, vx: 0, vy: 0, angle: 0 };
  fly(lander, { right: true }, 0.5);
  assert.ok(close(lander.angle, PHYSICS.rotationSpeed * 0.5, 1e-6));
  fly(lander, { right: true }, 5);
  assert.equal(lander.angle, PHYSICS.maxTilt);
  fly(lander, { left: true }, 5);
  assert.equal(lander.angle, -PHYSICS.maxTilt);
});

test('thrust burns fuel; with an empty tank the engine is dead', () => {
  const lander = { x: 50, y: 100, vx: 0, vy: 0, angle: 0 };
  const left = fly(lander, { thrust: true }, 3, 1000);
  assert.ok(close(left, 1000 - PHYSICS.fuelBurn * 3, 1e-6));

  const dry = { x: 50, y: 100, vx: 0, vy: 0, angle: 0 };
  assert.equal(stepLander(dry, { thrust: true }, 0, DT), 0);
  assert.equal(dry.thrusting, false);
  assert.ok(dry.vy < 0);

  // Coasting burns nothing.
  assert.equal(fly({ x: 50, y: 100, vx: 0, vy: 0, angle: 0 }, NONE, 1, 500), 500);
});

test('the last drop of fuel gives only its share of a step’s push', () => {
  const lander = { x: 50, y: 100, vx: 0, vy: 0, angle: 0 };
  const half = (PHYSICS.fuelBurn * DT) / 2;
  assert.ok(close(stepLander(lander, { thrust: true }, half, DT), half));
  assert.ok(close(lander.vy, (PHYSICS.thrust / 2 - PHYSICS.gravity) * DT));
});

test('the ceiling stops a climb', () => {
  const lander = { x: 50, y: WORLD.height - 1, vx: 0, vy: 20, angle: 0 };
  fly(lander, { thrust: true }, 1);
  assert.equal(lander.y, WORLD.height);
  assert.ok(lander.vy <= PHYSICS.thrust * DT);
});

test('the sides wrap', () => {
  const lander = { x: WORLD.width + 3, y: 100 };
  wrapLander(lander);
  assert.equal(lander.x, 3);
});

test('the outline turns with the lander', () => {
  const [left, right] = landerPoints({ x: 100, y: 50, angle: 0 });
  assert.deepEqual([left, right], [{ x: 95, y: 44 }, { x: 105, y: 44 }]);
  // Leaning right (clockwise), the left foot swings up and the right one down.
  const [l2, r2] = landerPoints({ x: 100, y: 50, angle: 20 });
  assert.ok(l2.y > 44 && r2.y < 44);
});

test('contact tells feet from body', () => {
  const terrain = flatTerrain(20);
  const before = landerAbove(20, 0.2);
  const after = { ...before, y: before.y - 0.4 };
  assert.deepEqual(contact(terrain, before, after), { feet: [true, true], body: false });
  assert.equal(contact(terrain, before, { ...before, y: before.y - 0.1 }), null);

  // Coming down on its side, the body hits the ground along with a foot.
  const tipped = landerAbove(20, 2, { angle: 90 });
  const dropped = { ...tipped, y: tipped.y - 6 };
  assert.equal(contact(terrain, tipped, dropped).body, true);
});

test('altitude is measured from the lowest foot', () => {
  assert.ok(close(altitude(flatTerrain(20), landerAbove(20, 12.5)), 12.5));
});

test('a touchdown is judged on speed, tilt and where the feet are', () => {
  const terrain = flatTerrain(20);
  const feet = { feet: [true, true], body: false };
  const on = (props) => judge(terrain, landerAbove(20, 0, props), feet).outcome;
  const { good, hard } = LIMITS;
  // Halfway between the good and the hard limits, and a little past the hard one.
  const mid = (key) => (good[key] + hard[key]) / 2;
  const past = (key) => hard[key] + 0.5;

  assert.equal(on({ vy: -good.vertical }), 'good');
  assert.equal(on({ vy: -good.vertical, vx: good.horizontal, angle: -good.tilt }), 'good');
  assert.equal(on({ vy: -mid('vertical') }), 'hard');
  assert.equal(on({ vy: -1, vx: mid('horizontal') }), 'hard');
  assert.equal(on({ vy: -1, angle: mid('tilt') }), 'hard');
  assert.equal(on({ vy: -past('vertical') }), 'crash');
  assert.equal(on({ vy: -1, vx: past('horizontal') }), 'crash');
  assert.equal(on({ vy: -1, angle: past('tilt') }), 'crash');
  // Off the pad, or one foot over its edge.
  assert.equal(on({ vy: -1, x: 60 }), 'crash');
  assert.equal(on({ vy: -1, x: 137 }), 'crash');
  // Anything but the feet touching.
  assert.equal(judge(terrain, landerAbove(20, 0), { feet: [true, true], body: true }).outcome, 'crash');
  assert.equal(judge(terrain, landerAbove(20, 0, { vy: -1 }), feet).pad.multiplier, 2);
});
