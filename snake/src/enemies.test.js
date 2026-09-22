// Run with: node --test

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, tick, advanceClock, effectiveInterval } from './game.js';
import {
  advanceEnemies, enemyInterval, spawnCrawler, placeSleepers, stepToward,
} from './enemies.js';

const firstCell = () => 0;

// A hand-built floor: a 12x7 room with a rock pillar in the middle of it. The
// spawn distance is scaled down to match — the real 14 tiles is most of this
// arena — and the tests that care about that distance set it themselves. No
// lives, so being caught ends the run here instead of restarting the floor.
function arena(overrides = {}) {
  const state = createGame({
    cols: 12,
    rows: 7,
    mode: 'adventure',
    powerUpChance: 0,
    enemyChance: 0,
    startingLives: 0,
    enemySpawnDistance: 5,
    ...overrides,
  }, firstCell);

  const blocked = new Set();
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 12; x += 1) {
      const edge = x === 0 || y === 0 || x === 11 || y === 6;
      if (edge || (x === 6 && y === 3)) blocked.add(y * 12 + x);
    }
  }

  state.blocked = blocked;
  state.snake = [{ x: 2, y: 3 }, { x: 1, y: 3 }];
  state.direction = { x: 1, y: 0 };
  state.shards = [{ x: 9, y: 1 }];
  state.portal = { x: 9, y: 5 };
  state.enemies = [];
  state.grace = 0;
  state.status = 'running';
  return state;
}

function hunter(state, cells) {
  const enemy = {
    kind: 'crawler',
    body: cells,
    phase: 'hunting',
    phaseMs: 0,
    msLeft: state.config.enemyLifetime,
    accumulator: 0,
  };
  state.enemies.push(enemy);
  return enemy;
}

test('an enemy is always slower than the snake, at any speed', () => {
  const state = arena();

  for (const interval of [200, 120, 60, 40]) {
    assert.ok(
      enemyInterval(state, interval) > interval,
      `an enemy kept up at a ${interval}ms interval`,
    );
  }
});

test('slowing the snake down does not make enemies relatively faster', () => {
  const state = arena();
  state.effects.slow = 5000;

  // Tied to the snake's *current* interval, so a Slow never turns into a trap.
  assert.ok(enemyInterval(state, effectiveInterval(state)) > effectiveInterval(state));
});

test('a crawler surfaces motionless before it hunts', () => {
  const state = arena();
  const crawler = spawnCrawler(state, firstCell);
  state.enemies.push(crawler);
  const start = [...crawler.body];

  assert.equal(crawler.phase, 'waking');

  advanceEnemies(state, state.config.enemyWakeMs - 50, 120, firstCell);
  assert.deepEqual(crawler.body, start, 'it moved while it was still surfacing');

  advanceEnemies(state, 100, 120, firstCell);
  assert.equal(crawler.phase, 'hunting');
});

test('a crawler never surfaces next to you', () => {
  const state = arena({ cols: 60, rows: 45, enemySpawnDistance: 14 });
  state.blocked = new Set();
  state.snake = [{ x: 30, y: 22 }];

  for (let i = 0; i < 200; i += 1) {
    const crawler = spawnCrawler(state, Math.random);
    const head = crawler.body[0];
    const distance = Math.abs(head.x - 30) + Math.abs(head.y - 22);
    assert.ok(
      distance >= state.config.enemySpawnDistance,
      `surfaced ${distance} tiles away, minimum is ${state.config.enemySpawnDistance}`,
    );
  }
});

test('a hunting enemy closes the distance, and paths around rock', () => {
  const state = arena();
  // Directly across the pillar from the snake, so a greedy chaser would wedge.
  const enemy = hunter(state, [{ x: 8, y: 3 }, { x: 9, y: 3 }]);
  const before = Math.abs(enemy.body[0].x - state.snake[0].x);

  for (let i = 0; i < 6; i += 1) advanceEnemies(state, 400, 120, firstCell);

  assert.ok(
    Math.abs(enemy.body[0].x - state.snake[0].x) < before,
    'the enemy made no progress toward the snake',
  );
  assert.ok(
    !state.blocked.has(enemy.body[0].y * 12 + enemy.body[0].x),
    'the enemy walked into rock',
  );
});

test('an enemy body never overlaps rock', () => {
  const state = arena();
  const enemy = hunter(state, [{ x: 9, y: 3 }, { x: 10, y: 3 }]);

  for (let i = 0; i < 40; i += 1) {
    advanceEnemies(state, 200, 120, firstCell);
    for (const seg of enemy.body) {
      assert.ok(!state.blocked.has(seg.y * 12 + seg.x), `segment inside rock at ${seg.x},${seg.y}`);
    }
  }
});

test('an enemy expires and is cleared away', () => {
  const state = arena();
  const enemy = hunter(state, [{ x: 9, y: 5 }, { x: 10, y: 5 }]);
  enemy.msLeft = 300;

  advanceEnemies(state, 200, 120, firstCell);
  assert.equal(state.enemies.length, 1);

  advanceEnemies(state, 200, 120, firstCell);
  assert.deepEqual(state.enemies, [], 'it should have faded out of existence');
});

test('walking into an enemy ends the run', () => {
  const state = arena();
  hunter(state, [{ x: 3, y: 3 }, { x: 4, y: 3 }]);

  tick(state, firstCell);

  assert.equal(state.status, 'over');
});

test('ghost phases through enemies but not through rock', () => {
  const state = arena();
  hunter(state, [{ x: 3, y: 3 }, { x: 4, y: 3 }]);
  state.effects.ghost = 5000;

  tick(state, firstCell);
  assert.equal(state.status, 'running', 'Ghost should carry the snake through a worm');
  assert.deepEqual(state.snake[0], { x: 3, y: 3 });

  // The pillar is still the pillar.
  state.snake = [{ x: 5, y: 3 }, { x: 4, y: 3 }];
  tick(state, firstCell);
  assert.equal(state.status, 'over');
});

test('an enemy catching the snake ends the run, unless it is ghosting', () => {
  const state = arena();
  const enemy = hunter(state, [{ x: 4, y: 3 }, { x: 5, y: 3 }]);
  state.snake = [{ x: 3, y: 3 }, { x: 2, y: 3 }];

  const caught = advanceEnemies(state, 1000, 120, firstCell);
  assert.equal(caught, true);
  assert.ok(enemy.body.some((seg) => seg.x === 3 && seg.y === 3));

  const ghosting = arena();
  hunter(ghosting, [{ x: 4, y: 3 }, { x: 5, y: 3 }]);
  ghosting.snake = [{ x: 3, y: 3 }, { x: 2, y: 3 }];
  ghosting.effects.ghost = 5000;
  advanceClock(ghosting, 1000, firstCell);
  assert.equal(ghosting.status, 'running');
});

test('sleepers stay asleep until you come close', () => {
  const state = arena();
  const sleeper = {
    kind: 'sleeper',
    body: [{ x: 9, y: 5 }, { x: 10, y: 5 }],
    phase: 'dormant',
    phaseMs: 0,
    msLeft: state.config.sleeperHuntMs,
    accumulator: 0,
  };
  state.enemies.push(sleeper);
  const start = [...sleeper.body];

  advanceEnemies(state, 5000, 120, firstCell);
  assert.equal(sleeper.phase, 'dormant');
  assert.deepEqual(sleeper.body, start);

  // A dormant sleeper is scenery: walking into one is safe.
  state.snake = [{ x: 9, y: 5 }, { x: 8, y: 5 }];
  state.direction = { x: 0, y: 0 };
  assert.equal(state.status, 'running');

  state.snake = [{ x: 7, y: 5 }, { x: 6, y: 5 }];
  advanceEnemies(state, 100, 120, firstCell);
  assert.equal(sleeper.phase, 'waking');
});

test('no floor is inhabited before the depth enemies start at', () => {
  const state = arena();

  for (let depth = 1; depth < state.config.enemyFromDepth; depth += 1) {
    assert.deepEqual(placeSleepers(state, depth, Math.random), []);
  }
  assert.ok(placeSleepers(state, state.config.enemyFromDepth, Math.random).length > 0);
});

test('nothing surfaces during the landing grace', () => {
  const state = arena({ enemyChance: 1000, enemyCooldown: 0 });
  state.depth = 9;
  state.grace = 2000;

  advanceEnemies(state, 500, 120, firstCell);
  assert.deepEqual(state.enemies, []);

  state.grace = 0;
  advanceEnemies(state, 500, 120, firstCell);
  assert.equal(state.enemies.length, 1);
});

test('the number of hunters is capped by the depth', () => {
  for (const [depth, cap] of [[3, 1], [6, 2], [12, 2], [30, 2]]) {
    const state = arena({
      enemyChance: 1000, enemyCooldown: 0, cols: 60, rows: 45, enemySpawnDistance: 14,
    });
    state.blocked = new Set();
    state.snake = [{ x: 30, y: 22 }];
    state.depth = depth;

    for (let i = 0; i < 60; i += 1) advanceEnemies(state, 500, 120, () => 0.5);

    const hunters = state.enemies.filter((e) => e.kind === 'crawler').length;
    assert.ok(hunters <= cap, `depth ${depth} produced ${hunters} hunters, cap is ${cap}`);
  }
});

test('stepToward gives up rather than hanging when the snake is walled off', () => {
  const state = arena();
  // Seal the enemy into the bottom-right corner.
  for (const cell of [{ x: 9, y: 4 }, { x: 10, y: 4 }, { x: 8, y: 5 }]) {
    state.blocked.add(cell.y * 12 + cell.x);
  }
  const enemy = hunter(state, [{ x: 10, y: 5 }, { x: 9, y: 5 }]);

  assert.equal(stepToward(state, enemy, state.snake[0]), null);
});

test('a surfacing worm is a warning, not yet a threat', () => {
  const state = arena();
  const crawler = spawnCrawler(state, firstCell);
  crawler.body = [{ x: 3, y: 3 }, { x: 4, y: 3 }];
  state.enemies.push(crawler);
  assert.equal(crawler.phase, 'waking');

  // Straight through it while it is still coming up.
  tick(state, firstCell);
  assert.equal(state.status, 'running');

  // And lethal the moment it starts hunting.
  crawler.phase = 'hunting';
  state.snake = [{ x: 2, y: 3 }, { x: 1, y: 3 }];
  crawler.body = [{ x: 3, y: 3 }, { x: 4, y: 3 }];
  tick(state, firstCell);
  assert.equal(state.status, 'over');
});

// --- Biting -----------------------------------------------------------------

test('a worm reaching your body takes the tail, not the run', () => {
  const state = arena();
  state.snake = [{ x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 4 }, { x: 1, y: 4 }];
  const enemy = hunter(state, [{ x: 4, y: 3 }, { x: 5, y: 3 }]);

  advanceEnemies(state, 1000, 120, firstCell);

  assert.equal(state.status, 'running');
  assert.equal(state.lives, 0, 'a bite must not spend a life');
  assert.deepEqual(state.snake, [{ x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }]);
  assert.equal(state.scraps.length, 2, 'the severed segments are left dissolving');
  assert.equal(enemy.phase, 'feeding');
  assert.equal(state.invulnerable, state.config.biteImmunityMs);
});

test('a bite never leaves the snake shorter than the minimum', () => {
  const state = arena();
  state.snake = [{ x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }];
  hunter(state, [{ x: 4, y: 3 }, { x: 5, y: 3 }]);

  advanceEnemies(state, 1000, 120, firstCell);

  assert.equal(state.snake.length, state.config.minSnakeLength);
  assert.equal(state.status, 'running');
});

test('only the worm’s head bites — its body is just a worm in the way', () => {
  const state = arena();
  state.snake = [{ x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }];
  // Its head is already past the snake, so the tail it drags is what overlaps.
  const enemy = hunter(state, [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }]);
  enemy.accumulator = 0;

  const length = state.snake.length;
  advanceEnemies(state, 100, 120, firstCell);

  assert.equal(state.snake.length, length, 'a body overlap should do nothing at all');
  assert.equal(state.scraps.length, 0);
});

test('a feeding worm holds still and is safe to brush past', () => {
  const state = arena();
  state.snake = [{ x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 4 }];
  const enemy = hunter(state, [{ x: 4, y: 3 }, { x: 5, y: 3 }]);

  advanceEnemies(state, 1000, 120, firstCell);
  assert.equal(enemy.phase, 'feeding');
  const parked = enemy.body.map((seg) => ({ ...seg }));

  advanceEnemies(state, state.config.enemyFeedMs - 100, 120, firstCell);
  assert.deepEqual(enemy.body, parked, 'it moved while it was eating');

  // Driving into it while it eats is safe, where a hunting worm would kill.
  state.snake = [{ x: enemy.body[0].x - 1, y: enemy.body[0].y }, { x: enemy.body[0].x - 2, y: enemy.body[0].y }];
  state.direction = { x: 1, y: 0 };
  state.invulnerable = 0;
  tick(state, firstCell);
  assert.equal(state.status, 'running');

  advanceEnemies(state, 200, 120, firstCell);
  assert.equal(enemy.phase, 'hunting', 'and it goes back to hunting afterwards');
});

test('the immunity after a bite stops you being chewed twice over', () => {
  const state = arena();
  state.snake = [{ x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 4 }, { x: 1, y: 4 }];
  hunter(state, [{ x: 4, y: 3 }, { x: 5, y: 3 }]);
  const second = hunter(state, [{ x: 4, y: 2 }, { x: 5, y: 2 }]);

  advanceEnemies(state, 1000, 120, firstCell);
  const afterFirst = state.snake.length;

  // The other worm is right on top of the snake, and gets nothing for it.
  second.body[0] = { x: 3, y: 3 };
  advanceEnemies(state, 400, 120, firstCell);

  assert.equal(state.snake.length, afterFirst);
  assert.equal(state.status, 'running');
});

test('a head-on meeting still costs a life', () => {
  const state = arena({ startingLives: 2 });
  state.snake = [{ x: 3, y: 3 }, { x: 2, y: 3 }];
  hunter(state, [{ x: 4, y: 3 }, { x: 5, y: 3 }]);

  const caught = advanceEnemies(state, 1000, 120, firstCell);

  assert.equal(caught, true, 'reaching the head is the one contact that costs you');
});
