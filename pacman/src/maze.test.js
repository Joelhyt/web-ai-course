// Run with: node --test (from pacman/)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAZE_ROWS,
  WIDTH,
  HEIGHT,
  countDots,
  createMaze,
  isOpen,
  isTunnel,
  stepToCentre,
  tileOf,
  wallSegments,
  wrapX,
} from './maze.js';

test('the maze is the arcade one: 28 by 31 with 240 dots and 4 energizers', () => {
  assert.equal(MAZE_ROWS.length, HEIGHT);
  for (const row of MAZE_ROWS) assert.equal(row.length, WIDTH);
  assert.deepEqual(countDots(createMaze()), { dots: 240, energizers: 4, total: 244 });
});

test('the door is shut to steering actors, and the tunnel wraps', () => {
  const maze = createMaze();
  assert.equal(isOpen(maze, 13, 12), false);
  assert.equal(isOpen(maze, 14, 12), false);
  assert.equal(isOpen(maze, -1, 14), true);
  assert.equal(isOpen(maze, 28, 14), true);
  assert.equal(isOpen(maze, 0, 13), false);
  assert.equal(isOpen(maze, 5, -1), false);
  assert.equal(wrapX(-1), 27);
  assert.equal(wrapX(28), 0);
  assert.equal(isTunnel(-1, 14), true);
  assert.equal(isTunnel(6, 14), false);
  assert.deepEqual(tileOf({ x: -0.4, y: 14 }), { col: 0, row: 14 });
});

test('the house is floor, the space outside the walls is not', () => {
  const { reachable } = createMaze();
  assert.equal(reachable[14][13], true); // inside the house
  assert.equal(reachable[14][0], true); // the tunnel
  assert.equal(reachable[11][2], false); // beside the house, outside the walls
  assert.equal(reachable[0][0], false); // wall
});

test('walls are drawn along the outline of each block, not through it', () => {
  const segments = wallSegments(createMaze());
  const has = (s) => segments.some((t) => t.join() === s.join());
  // The 4×3 block in the top left: its outline through the wall-tile centres…
  assert.ok(has([2, 2, 3, 2]));
  assert.ok(has([2, 2, 2, 3]));
  assert.ok(has([5, 3, 5, 4]));
  assert.ok(has([3, 4, 4, 4]));
  // …but nothing across its middle.
  assert.ok(!has([3, 3, 4, 3]));
  assert.ok(!has([3, 2, 3, 3]));
  // Every segment joins two wall tiles.
  for (const [x1, y1, x2, y2] of segments) {
    assert.equal(MAZE_ROWS[y1][x1], '#');
    assert.equal(MAZE_ROWS[y2][x2], '#');
  }
});

test('stepToCentre stops at the next centre and straightens a cut corner', () => {
  const actor = { x: 13.5, y: 23.3, dir: 'left' };
  let step = stepToCentre(actor, 0.2);
  assert.equal(step.reached, false);
  assert.ok(Math.abs(actor.x - 13.3) < 1e-9);
  assert.ok(Math.abs(actor.y - 23.1) < 1e-9);

  step = stepToCentre(actor, 5);
  assert.equal(step.reached, true);
  assert.ok(Math.abs(step.used - 0.3) < 1e-9);
  assert.deepEqual(actor, { x: 13, y: 23, dir: 'left' });

  // From a centre, the next centre is a whole tile away.
  step = stepToCentre(actor, 5);
  assert.equal(step.used, 1);
  assert.equal(actor.x, 12);
});

test('walking off one side of the tunnel comes back on the other', () => {
  const actor = { x: 0, y: 14, dir: 'left' };
  stepToCentre(actor, 1);
  assert.equal(actor.x, 27);
  actor.dir = 'right';
  stepToCentre(actor, 1);
  stepToCentre(actor, 1);
  assert.equal(actor.x, 1);
});
