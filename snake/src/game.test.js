// Run with: node --test snake/src/
// Node's built-in test runner needs no dependencies, and game.js is pure ESM
// with no DOM references, so it imports straight into Node.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGame,
  tick,
  queueDirection,
  spawnFood,
  spawnPowerUp,
  effectiveInterval,
} from './game.js';
import { POWER_UPS } from './config.js';

// Deterministic stand-in for Math.random: always picks the first free cell.
const firstCell = () => 0;

const cellsAt = (a, b) => a.x === b.x && a.y === b.y;

function runningGame(overrides = {}) {
  const state = createGame({ cols: 10, rows: 10, ...overrides }, firstCell);
  state.status = 'running';
  return state;
}

test('moving without food keeps the snake the same length', () => {
  const state = runningGame();
  const length = state.snake.length;

  tick(state, firstCell);

  assert.equal(state.snake.length, length);
  assert.deepEqual(state.snake[0], { x: 6, y: 5 });
  assert.equal(state.status, 'running');
});

test('eating grows the snake and raises the score', () => {
  const state = runningGame();
  state.food = { x: 6, y: 5 };

  tick(state, firstCell);

  assert.equal(state.snake.length, 4);
  assert.equal(state.score, 1);
});

test('a 180 degree reversal is rejected', () => {
  const state = runningGame();

  assert.equal(queueDirection(state, { x: -1, y: 0 }), false);
  assert.equal(state.pending.length, 0);
});

test('a reversal against a queued turn is rejected too', () => {
  const state = runningGame();

  assert.equal(queueDirection(state, { x: 0, y: -1 }), true);
  // Down would reverse the queued Up, which is what kills naive implementations.
  assert.equal(queueDirection(state, { x: 0, y: 1 }), false);
  assert.equal(state.pending.length, 1);
});

test('moving into the square the tail is vacating is legal', () => {
  const state = runningGame();
  state.snake = [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
    { x: 1, y: 2 },
  ];
  state.direction = { x: -1, y: 0 };
  state.food = { x: 9, y: 9 };
  state.pending = [{ x: 0, y: 1 }];

  tick(state, firstCell);

  assert.equal(state.status, 'running');
  assert.deepEqual(state.snake[0], { x: 1, y: 2 });
});

test('turning into the body ends the game', () => {
  const state = runningGame();
  state.snake = [
    { x: 2, y: 2 },
    { x: 2, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 2 },
    { x: 4, y: 2 },
  ];
  state.direction = { x: 0, y: -1 };
  state.food = { x: 9, y: 9 };
  state.pending = [{ x: 1, y: 0 }];

  tick(state, firstCell);

  assert.equal(state.status, 'over');
});

test('solid walls end the game', () => {
  const state = runningGame({ walls: 'solid' });
  state.snake = [{ x: 9, y: 5 }];
  state.direction = { x: 1, y: 0 };
  state.food = { x: 0, y: 0 };

  tick(state, firstCell);

  assert.equal(state.status, 'over');
});

test('wrap walls carry the snake to the far side', () => {
  const state = runningGame({ walls: 'wrap' });
  state.snake = [{ x: 9, y: 5 }];
  state.direction = { x: 1, y: 0 };
  state.food = { x: 0, y: 0 };

  tick(state, firstCell);

  assert.equal(state.status, 'running');
  assert.deepEqual(state.snake[0], { x: 0, y: 5 });
});

test('food never spawns on the snake', () => {
  const state = createGame({ cols: 4, rows: 4 }, firstCell);
  state.snake = [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
    { x: 3, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
  ];

  for (let i = 0; i < 300; i += 1) {
    const food = spawnFood(state);
    assert.ok(food, 'expected a free cell');
    assert.ok(
      !state.snake.some((seg) => seg.x === food.x && seg.y === food.y),
      `food landed on the snake at ${food.x},${food.y}`,
    );
  }
});

test('the tick interval shortens as the score grows and then clamps', () => {
  const state = runningGame({ baseInterval: 140, minInterval: 60, speedStep: 4 });
  state.food = { x: 6, y: 5 };

  tick(state, firstCell);
  assert.equal(state.tickInterval, 136);

  // Far enough along that the raw formula would drop below the floor.
  state.score = 100;
  state.food = { x: state.snake[0].x + 1, y: state.snake[0].y };
  tick(state, firstCell);
  assert.equal(state.tickInterval, 60);
});

test('filling the board wins the game', () => {
  const state = createGame({ cols: 2, rows: 2 }, firstCell);
  state.status = 'running';
  state.snake = [
    { x: 0, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ];
  state.direction = { x: 0, y: -1 };
  state.food = { x: 1, y: 0 };
  state.pending = [{ x: 1, y: 0 }];

  tick(state, firstCell);

  assert.equal(state.status, 'won');
  assert.equal(state.snake.length, 4);
  assert.equal(state.food, null);
});

// --- Power-ups --------------------------------------------------------------

// firstCell always returns 0, which would otherwise roll a power-up on every
// single tick; most tests above only run one or two ticks, and the cooldown a
// fresh game starts with keeps the board clear for them.
test('a fresh round starts with no collectible and a cooldown', () => {
  const state = runningGame();

  assert.equal(state.powerUp, null);
  assert.equal(state.powerUpCooldown, state.config.powerUpCooldown);
  assert.deepEqual(state.effects, { slow: 0, ghost: 0, magnet: 0 });
});

test('a collectible appears once the cooldown lapses, and never on the food', () => {
  const state = runningGame({ powerUpCooldown: 1, powerUpChance: 1 });
  state.food = { x: 0, y: 0 };

  tick(state, firstCell); // burns the last cooldown tick
  assert.equal(state.powerUp, null);

  tick(state, firstCell);
  assert.ok(state.powerUp);
  assert.ok(!cellsAt(state.powerUp, state.food));
  assert.ok(!state.snake.some((seg) => cellsAt(seg, state.powerUp)));
});

test('a collectible expires on its own and starts the cooldown again', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.food = { x: 9, y: 9 };
  state.powerUp = { type: 'slow', x: 0, y: 0, ticksLeft: 2 };

  tick(state, firstCell);
  assert.equal(state.powerUp.ticksLeft, 1);

  tick(state, firstCell);
  assert.equal(state.powerUp, null);
  assert.equal(state.powerUpCooldown, state.config.powerUpCooldown);
});

test('driving over a collectible activates its effect', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.food = { x: 9, y: 9 };
  state.powerUp = { type: 'ghost', x: 6, y: 5, ticksLeft: 20 };

  tick(state, firstCell);

  assert.equal(state.powerUp, null);
  // Collected at full duration, then one tick of it is spent straight away.
  assert.equal(state.effects.ghost, POWER_UPS.ghost.duration - 1);
});

test('slow stretches the tick interval without changing the underlying speed', () => {
  const state = runningGame({ slowFactor: 2, powerUpChance: 0 });

  assert.equal(effectiveInterval(state), state.tickInterval);
  state.effects.slow = 10;
  assert.equal(effectiveInterval(state), state.tickInterval * 2);
});

test('ghost lets the snake pass through its own body', () => {
  const body = () => [
    { x: 2, y: 2 },
    { x: 2, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 2 },
    { x: 4, y: 2 },
  ];

  const lethal = runningGame({ powerUpChance: 0 });
  lethal.snake = body();
  lethal.direction = { x: 0, y: -1 };
  lethal.food = { x: 9, y: 9 };
  lethal.pending = [{ x: 1, y: 0 }];
  tick(lethal, firstCell);
  assert.equal(lethal.status, 'over');

  const ghosting = runningGame({ powerUpChance: 0 });
  ghosting.snake = body();
  ghosting.direction = { x: 0, y: -1 };
  ghosting.food = { x: 9, y: 9 };
  ghosting.pending = [{ x: 1, y: 0 }];
  ghosting.effects.ghost = 5;
  tick(ghosting, firstCell);
  assert.equal(ghosting.status, 'running');
  assert.deepEqual(ghosting.snake[0], { x: 3, y: 2 });
});

test('ghost expiring restores the collision rule', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.snake = [
    { x: 2, y: 2 },
    { x: 2, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 2 },
    { x: 4, y: 2 },
  ];
  state.direction = { x: 0, y: -1 };
  state.food = { x: 9, y: 9 };
  state.effects.ghost = 1;

  // The last ghost tick carries the snake up and out of its own coil.
  tick(state, firstCell);
  assert.equal(state.status, 'running');
  assert.equal(state.effects.ghost, 0);

  // With the effect gone, the same coil and the same turn are lethal again.
  state.snake = [
    { x: 2, y: 2 },
    { x: 2, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 2 },
    { x: 4, y: 2 },
  ];
  state.direction = { x: 0, y: -1 };
  state.pending = [{ x: 1, y: 0 }];
  tick(state, firstCell);
  assert.equal(state.status, 'over');
});

test('magnet drags the food one square closer every other tick', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.snake = [{ x: 2, y: 2 }];
  state.direction = { x: 0, y: -1 }; // steering away from the food
  state.food = { x: 8, y: 2 };
  state.effects.magnet = 8;

  tick(state, firstCell);
  assert.deepEqual(state.food, { x: 7, y: 2 }, 'pulled on an even tick');

  tick(state, firstCell);
  assert.deepEqual(state.food, { x: 7, y: 2 }, 'held on the odd tick');
});

test('magnet never drags the food onto the snake', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.snake = [
    { x: 2, y: 2 },
    { x: 3, y: 2 },
    { x: 4, y: 2 },
    { x: 5, y: 2 },
  ];
  state.direction = { x: 0, y: -1 };
  state.food = { x: 6, y: 2 };
  state.effects.magnet = 8;

  tick(state, firstCell);

  assert.ok(
    !state.snake.some((seg) => cellsAt(seg, state.food)),
    `food landed on the snake at ${state.food.x},${state.food.y}`,
  );
});

test('effects count down and stop on their own', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.food = { x: 9, y: 9 };
  state.effects.slow = 2;

  tick(state, firstCell);
  assert.equal(state.effects.slow, 1);
  tick(state, firstCell);
  assert.equal(state.effects.slow, 0);
  tick(state, firstCell);
  assert.equal(state.effects.slow, 0, 'never goes negative');
});

test('a collectible in the last free square does not fake a win', () => {
  const state = createGame({ cols: 2, rows: 2, powerUpChance: 0 }, firstCell);
  state.status = 'running';
  state.snake = [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ];
  state.direction = { x: 0, y: -1 };
  state.food = { x: 0, y: 0 };
  state.powerUp = { type: 'magnet', x: 1, y: 0, ticksLeft: 20 };

  tick(state, firstCell);

  assert.equal(state.status, 'running');
  assert.deepEqual(state.food, { x: 1, y: 0 });
});

test('spawnPowerUp reports no room rather than overlapping', () => {
  const state = createGame({ cols: 2, rows: 2 }, firstCell);
  state.snake = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ];
  state.food = { x: 1, y: 1 };

  assert.equal(spawnPowerUp(state, firstCell), null);
});
