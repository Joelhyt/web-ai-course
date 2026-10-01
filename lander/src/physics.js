// The lander's motion and its contact with the ground. No DOM.
//
// Angles are in degrees from upright, positive leaning right (clockwise), so
// thrust at a positive angle pushes the lander to the right.

import { FEET, LANDER_POINTS, LIMITS, PHYSICS, WORLD } from './config.js';
import { groundHeight, padAt, pathTouchesGround, wrapX } from './terrain.js';

const RAD = Math.PI / 180;

/** The outline points in world coordinates (x not wrapped), feet first. */
export function landerPoints(lander) {
  const a = lander.angle * RAD;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return LANDER_POINTS.map((p) => ({
    x: lander.x + p.x * cos + p.y * sin,
    y: lander.y - p.x * sin + p.y * cos,
  }));
}

/**
 * One fixed step of flight. Semi-implicit Euler: speeds change first, then
 * position moves by the new speed, which keeps a lander hovering on thrust
 * steady instead of slowly drifting. Returns the fuel burnt.
 *
 * controls: { left, right, thrust } booleans. With no fuel the engine is dead,
 * but the lander still turns: the arcade's attitude jets need no fuel.
 */
export function stepLander(lander, controls, fuel, dt, physics = PHYSICS) {
  const turn = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  lander.angle = Math.max(
    -physics.maxTilt,
    Math.min(physics.maxTilt, lander.angle + turn * physics.rotationSpeed * dt),
  );

  const burn = Math.min(fuel, physics.fuelBurn * dt);
  lander.thrusting = Boolean(controls.thrust) && fuel > 0;
  // A tank running dry part-way through a step gives that part of the push.
  const power = lander.thrusting ? physics.thrust * (burn / (physics.fuelBurn * dt)) : 0;
  const a = lander.angle * RAD;
  lander.vx += power * Math.sin(a) * dt;
  lander.vy += (power * Math.cos(a) - physics.gravity) * dt;
  lander.x += lander.vx * dt;
  lander.y += lander.vy * dt;

  // The ceiling: climbing past the top of the world just stops the climb.
  if (lander.y > WORLD.height) {
    lander.y = WORLD.height;
    lander.vy = Math.min(lander.vy, 0);
  }
  return lander.thrusting ? burn : 0;
}

export function wrapLander(lander) {
  lander.x = wrapX(lander.x);
}

/**
 * Which outline points met the ground while moving from `before` to `after`
 * (two copies of the lander, x unwrapped). Null when none did.
 */
export function contact(terrain, before, after) {
  const from = landerPoints(before);
  const to = landerPoints(after);
  const hits = to.map((p, i) => pathTouchesGround(terrain, from[i].x, from[i].y, p.x, p.y));
  if (!hits.some(Boolean)) return null;
  return { feet: hits.slice(0, FEET), body: hits.slice(FEET).some(Boolean) };
}

function within(lander, limits) {
  return (
    -lander.vy <= limits.vertical &&
    Math.abs(lander.vx) <= limits.horizontal &&
    Math.abs(lander.angle) <= limits.tilt
  );
}

/**
 * The outcome of a touchdown: 'good', 'hard' or 'crash', and the pad if it was
 * a landing. A landing needs both feet over the same pad and nothing but the
 * feet touching; then the speeds and tilt decide between good, hard and crash.
 */
export function judge(terrain, lander, touch, limits = LIMITS) {
  const [left, right] = landerPoints(lander);
  const pad = padAt(terrain, left.x);
  const onPad = pad !== null && pad === padAt(terrain, right.x);
  if (touch.body || !onPad) return { outcome: 'crash', pad: null };
  if (within(lander, limits.good)) return { outcome: 'good', pad };
  if (within(lander, limits.hard)) return { outcome: 'hard', pad };
  return { outcome: 'crash', pad: null };
}

/** Height of the lowest foot above the ground directly beneath it. */
export function altitude(terrain, lander) {
  const feet = landerPoints(lander).slice(0, FEET);
  return Math.min(...feet.map((p) => p.y - groundHeight(terrain, p.x)));
}
