// Run with: node --test snake/src/
// Node's built-in test runner needs no dependencies, and game.js is pure ESM
// with no DOM references, so it imports straight into Node.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame, tick, queueDirection, spawnFood } from './game.js';

// Deterministic stand-in for Math.random: always picks the first free cell.
const firstCell = () => 0;

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
