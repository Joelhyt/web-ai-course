// Run with: node --test (from lander/)

import test from 'node:test';
import assert from 'node:assert/strict';

import { WORLD, ZOOM } from './config.js';
import { createCamera, updateCamera } from './camera.js';
import { flatTerrain, landerAbove } from './testing.js';

/** A flying state over flat ground at 20 m, the lander's feet `height` m up. */
function flying(height, props = {}) {
  return { status: 'flying', terrain: flatTerrain(20), lander: landerAbove(20, height, props) };
}

/** Lets the camera settle: a few seconds of frames. */
function settle(camera, state) {
  for (let i = 0; i < 300; i += 1) updateCamera(camera, state, 1000 / 60);
  return camera;
}

const close = (a, b, tolerance = 1e-3) => Math.abs(a - b) <= tolerance;

test('high up, the whole world is in view', () => {
  const camera = settle(createCamera(), flying(150));
  assert.equal(camera.zoomed, false);
  assert.ok(close(camera.zoom, 1));
  assert.ok(close(camera.cx, WORLD.width / 2) && close(camera.cy, WORLD.height / 2));
});

test('near the ground it zooms in on the lander, with the ground below in view', () => {
  const state = flying(ZOOM.inBelow - 1);
  const camera = settle(createCamera(), state);
  assert.equal(camera.zoomed, true);
  assert.ok(close(camera.zoom, ZOOM.factor));
  assert.ok(close(camera.cx, state.lander.x));
  // The view's bottom edge is below the ground and its top above the lander.
  const half = WORLD.height / ZOOM.factor / 2;
  assert.ok(camera.cy - half < 20);
  assert.ok(camera.cy + half > state.lander.y + 7);
});

test('it zooms in below one height and out above a higher one, so it does not flicker', () => {
  const camera = createCamera();
  const state = flying(ZOOM.inBelow + 5);
  settle(camera, state);
  assert.equal(camera.zoomed, false);

  state.lander = landerAbove(20, ZOOM.inBelow - 1);
  updateCamera(camera, state, 16);
  assert.equal(camera.zoomed, true);
  // Back up between the two thresholds: still zoomed.
  state.lander = landerAbove(20, (ZOOM.inBelow + ZOOM.outAbove) / 2);
  updateCamera(camera, state, 16);
  assert.equal(camera.zoomed, true);
  state.lander = landerAbove(20, ZOOM.outAbove + 1);
  updateCamera(camera, state, 16);
  assert.equal(camera.zoomed, false);
});

test('the zoom glides rather than jumps', () => {
  const camera = createCamera();
  const state = flying(150);
  updateCamera(camera, state, 16);
  state.lander = landerAbove(20, 10);
  updateCamera(camera, state, 16);
  assert.ok(camera.zoom > 1 && camera.zoom < ZOOM.factor);
});

test('a landing stays zoomed in; a new round cuts straight back out', () => {
  const state = flying(5);
  const camera = settle(createCamera(), state);
  state.status = 'landed';
  settle(camera, state);
  assert.equal(camera.zoomed, true);

  // Next round: new terrain, the lander back up high.
  state.status = 'flying';
  state.terrain = flatTerrain(20);
  state.lander = landerAbove(20, 200);
  updateCamera(camera, state, 16);
  assert.equal(camera.zoom, 1);
});

test('following the lander across the side of the world takes the short way', () => {
  const state = flying(10, { x: WORLD.width - 2 });
  const camera = settle(createCamera(), state);
  assert.ok(close(camera.cx, WORLD.width - 2));
  // It drifts over the edge to x = 1: the view moves 3 m on, not 397 m back.
  state.lander.x = 1;
  updateCamera(camera, state, 16);
  const moved = Math.min(Math.abs(camera.cx - (WORLD.width - 2)), WORLD.width - Math.abs(camera.cx - (WORLD.width - 2)));
  assert.ok(moved < 3);
  settle(camera, state);
  assert.ok(close(camera.cx, 1));
});

test('the zoomed view never looks past the top or bottom of the world', () => {
  const state = flying(5);
  state.terrain = flatTerrain(10);
  state.lander = landerAbove(10, 5);
  const camera = settle(createCamera(), state);
  const half = WORLD.height / ZOOM.factor / 2;
  assert.ok(camera.cy - half >= -1e-6);
});
