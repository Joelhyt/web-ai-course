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
  spawnBonusFood,
  effectiveInterval,
  advanceClock,
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

// Effect timers, collectible lifetimes and the time attack clock are all
// milliseconds spent by advanceClock, never by tick: how fast the snake is
// moving must not change how long a power-up lasts. The tests below drive that
// clock explicitly, which is also why the ones above can tick freely without
// ever tripping over a spawn.
test('a fresh round starts with no collectible and a cooldown', () => {
  const state = runningGame();

  assert.equal(state.powerUp, null);
  assert.equal(state.powerUpCooldown, state.config.powerUpCooldown);
  assert.deepEqual(state.effects, { slow: 0, ghost: 0, magnet: 0, feast: 0 });
  assert.deepEqual(state.bonusFood, []);
});

test('a collectible appears once the cooldown lapses, and never on the food', () => {
  const state = runningGame({ powerUpCooldown: 100, powerUpChance: 1000 });
  state.food = { x: 0, y: 0 };

  advanceClock(state, 100, firstCell); // burns the last of the cooldown
  assert.equal(state.powerUp, null);

  advanceClock(state, 100, firstCell);
  assert.ok(state.powerUp);
  assert.ok(!cellsAt(state.powerUp, state.food));
  assert.ok(!state.snake.some((seg) => cellsAt(seg, state.powerUp)));
});

test('a collectible expires on its own and starts the cooldown again', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.food = { x: 9, y: 9 };
  state.powerUp = { type: 'slow', x: 0, y: 0, msLeft: 200 };

  advanceClock(state, 100, firstCell);
  assert.equal(state.powerUp.msLeft, 100);

  advanceClock(state, 100, firstCell);
  assert.equal(state.powerUp, null);
  assert.equal(state.powerUpCooldown, state.config.powerUpCooldown);
});

test('a stopped game does not age', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.food = { x: 9, y: 9 };
  state.powerUp = { type: 'slow', x: 0, y: 0, msLeft: 5000 };
  state.effects.ghost = 5000;
  state.status = 'paused';

  advanceClock(state, 2000, firstCell);

  assert.equal(state.powerUp.msLeft, 5000, 'the collectible waits out the pause');
  assert.equal(state.effects.ghost, 5000, 'and so does the effect');
});

test('driving over a collectible activates its effect', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.food = { x: 9, y: 9 };
  state.powerUp = { type: 'ghost', x: 6, y: 5, msLeft: 5000 };

  tick(state, firstCell);

  assert.equal(state.powerUp, null);
  assert.equal(state.effects.ghost, POWER_UPS.ghost.duration);
});

test('an effect lasts the same wall time however fast the snake is', () => {
  // Wrapping walls so the laps below cannot end either round early.
  const slowSnake = runningGame({ powerUpChance: 0, baseInterval: 200, walls: 'wrap' });
  const fastSnake = runningGame({ powerUpChance: 0, baseInterval: 60, walls: 'wrap' });

  for (const state of [slowSnake, fastSnake]) {
    state.food = { x: 9, y: 9 };
    state.effects.ghost = 1000;
    // The fast snake fits more than three times as many moves into the second.
    const moves = Math.round(1000 / state.tickInterval);
    for (let i = 0; i < moves; i += 1) tick(state, firstCell);
    advanceClock(state, 1000, firstCell);
  }

  assert.equal(slowSnake.effects.ghost, 0);
  assert.equal(fastSnake.effects.ghost, 0, 'ticking must not spend an effect');
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
  state.effects.ghost = 500;

  // Ghost carries the snake up and out of its own coil, and then runs out.
  tick(state, firstCell);
  assert.equal(state.status, 'running');
  advanceClock(state, 500, firstCell);
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
  state.effects.magnet = 5000;

  tick(state, firstCell);
  assert.deepEqual(state.food, { x: 7, y: 2 }, 'pulled on the first move');

  tick(state, firstCell);
  assert.deepEqual(state.food, { x: 7, y: 2 }, 'and held on the next one');
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
  state.effects.magnet = 5000;

  tick(state, firstCell);

  assert.ok(
    !state.snake.some((seg) => cellsAt(seg, state.food)),
    `food landed on the snake at ${state.food.x},${state.food.y}`,
  );
});

test('effects count down and stop on their own', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.food = { x: 9, y: 9 };
  state.effects.slow = 200;

  advanceClock(state, 100, firstCell);
  assert.equal(state.effects.slow, 100);
  advanceClock(state, 100, firstCell);
  assert.equal(state.effects.slow, 0);
  advanceClock(state, 500, firstCell);
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
  state.powerUp = { type: 'magnet', x: 1, y: 0, msLeft: 5000 };

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

test('feast puts four food items on the board at once', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.food = { x: 9, y: 9 };
  state.powerUp = { type: 'feast', x: 6, y: 5, msLeft: 5000 };

  tick(state, firstCell);

  assert.equal(state.effects.feast, POWER_UPS.feast.duration);
  assert.equal(state.bonusFood.length, state.config.feastMultiplier - 1);

  const cells = [state.food, ...state.bonusFood];
  const unique = new Set(cells.map((c) => `${c.x},${c.y}`));
  assert.equal(unique.size, cells.length, 'food items stacked on one square');
  for (const cell of state.bonusFood) {
    assert.ok(!state.snake.some((seg) => cellsAt(seg, cell)));
  }
});

test('eating a bonus crumb scores and is topped straight back up', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.food = { x: 9, y: 9 };
  state.effects.feast = 5000;
  state.bonusFood = [{ x: 6, y: 5 }, { x: 0, y: 8 }, { x: 1, y: 8 }];
  const length = state.snake.length;

  tick(state, firstCell);

  assert.equal(state.score, 1);
  assert.equal(state.snake.length, length + 1, 'a crumb grows the snake too');
  assert.deepEqual(state.food, { x: 9, y: 9 }, 'the ordinary food is untouched');
  assert.equal(state.bonusFood.length, state.config.feastMultiplier - 1);
  assert.ok(!state.bonusFood.some((food) => cellsAt(food, { x: 6, y: 5 })));
});

test('bonus crumbs vanish when the effect ends', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.food = { x: 9, y: 9 };
  state.effects.feast = 200;
  state.bonusFood = [{ x: 0, y: 8 }, { x: 1, y: 8 }, { x: 2, y: 8 }];

  advanceClock(state, 100, firstCell);
  assert.equal(state.bonusFood.length, 3, 'still out while the effect runs');

  advanceClock(state, 100, firstCell);
  assert.equal(state.effects.feast, 0);
  assert.deepEqual(state.bonusFood, [], 'and gone the moment it ends');
  assert.deepEqual(state.food, { x: 9, y: 9 }, 'the ordinary food stays');
});

test('bonus crumbs are not topped up once the effect has ended', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.food = { x: 6, y: 5 };
  state.effects.feast = 0;

  tick(state, firstCell); // eats the ordinary food

  assert.equal(state.score, 1);
  assert.deepEqual(state.bonusFood, []);
});

test('bonus crumbs never spawn onto the food, the snake or a collectible', () => {
  const state = runningGame({ powerUpChance: 0, feastMultiplier: 6 });
  state.food = { x: 9, y: 9 };
  state.powerUp = { type: 'feast', x: 6, y: 5, msLeft: 5000 };

  tick(state, Math.random);

  for (const crumb of state.bonusFood) {
    assert.ok(!cellsAt(crumb, state.food), 'landed on the food');
    assert.ok(!state.snake.some((seg) => cellsAt(seg, crumb)), 'landed on the snake');
  }
});

test('bonus food gives up rather than crowding a nearly full board', () => {
  const state = createGame({ cols: 3, rows: 3, powerUpChance: 0 }, firstCell);
  state.status = 'running';
  state.snake = [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
    { x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 },
  ];
  state.food = { x: 0, y: 2 };
  state.effects.feast = 5000;

  assert.equal(spawnBonusFood(state, firstCell), null);
});

test('magnet drags the bonus crumbs too', () => {
  const state = runningGame({ powerUpChance: 0 });
  state.snake = [{ x: 2, y: 2 }];
  state.direction = { x: 0, y: -1 };
  state.food = { x: 8, y: 2 };
  state.bonusFood = [{ x: 2, y: 8 }];
  state.effects.magnet = 5000;
  state.effects.feast = 5000;

  tick(state, firstCell);

  assert.deepEqual(state.food, { x: 7, y: 2 });
  assert.deepEqual(state.bonusFood[0], { x: 2, y: 7 });
});

// --- Time attack ------------------------------------------------------------

test('classic mode has no clock', () => {
  const state = runningGame();

  assert.equal(state.timeLeft, null);

  advanceClock(state, 120_000, firstCell);

  assert.equal(state.status, 'running', 'a classic round never times out');
});

test('time attack starts on the configured limit and drains in real time', () => {
  const state = runningGame({ mode: 'time', timeLimit: 60_000, powerUpChance: 0 });

  assert.equal(state.timeLeft, 60_000);

  advanceClock(state, 16, firstCell);
  assert.equal(state.timeLeft, 59_984);

  // Moves cost nothing: only elapsed time does.
  for (let i = 0; i < 5; i += 1) tick(state, firstCell);
  assert.equal(state.timeLeft, 59_984);
});

test('time attack ends the round when the clock runs out', () => {
  const state = runningGame({ mode: 'time', timeLimit: 1000, powerUpChance: 0 });
  state.food = { x: 6, y: 5 };

  tick(state, firstCell);
  assert.equal(state.score, 1);

  advanceClock(state, 900, firstCell);
  assert.equal(state.status, 'running');

  advanceClock(state, 200, firstCell);
  assert.equal(state.status, 'timeup');
  assert.equal(state.timeLeft, 0, 'the clock never goes negative');
  assert.equal(state.score, 1, 'and the score is kept');
});

test('a timed out round stops moving', () => {
  const state = runningGame({ mode: 'time', timeLimit: 100, powerUpChance: 0 });
  advanceClock(state, 100, firstCell);

  const head = { ...state.snake[0] };
  tick(state, firstCell);

  assert.deepEqual(state.snake[0], head);
});

test('the clock is paused with the game', () => {
  const state = runningGame({ mode: 'time', timeLimit: 60_000, powerUpChance: 0 });
  state.status = 'paused';

  advanceClock(state, 5000, firstCell);

  assert.equal(state.timeLeft, 60_000);
});

// --- Adventure --------------------------------------------------------------

// A hand-built floor, so the rules can be tested without depending on whatever
// the generator happens to produce: a 7x5 room with a rock pillar at 3,2.
function dungeon(overrides = {}) {
  const state = createGame({
    cols: 7, rows: 5, mode: 'adventure', powerUpChance: 0, ...overrides,
  }, firstCell);

  const blocked = new Set();
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 7; x += 1) {
      const edge = x === 0 || y === 0 || x === 6 || y === 4;
      if (edge || (x === 3 && y === 2)) blocked.add(y * 7 + x);
    }
  }

  state.blocked = blocked;
  state.snake = [{ x: 2, y: 1 }, { x: 1, y: 1 }];
  state.direction = { x: 1, y: 0 };
  state.shards = [{ x: 5, y: 1 }];
  state.shardsTaken = 0;
  state.portal = { x: 1, y: 3 };
  state.portalOpen = false;
  state.growth = 0;
  state.status = 'running';
  return state;
}

test('adventure starts on a generated floor with no loose food', () => {
  const state = createGame({ mode: 'adventure' });

  assert.equal(state.depth, 1);
  assert.equal(state.food, null, 'shards replace the food entirely');
  assert.ok(state.shards.length >= 3);
  assert.ok(state.blocked.size > 0);
  assert.equal(state.portalOpen, false);
});

test('running into rock ends the run', () => {
  const state = dungeon();
  state.snake = [{ x: 2, y: 2 }, { x: 1, y: 2 }];
  state.direction = { x: 1, y: 0 }; // straight into the pillar at 3,2

  tick(state, firstCell);

  assert.equal(state.status, 'over');
});

test('ghost does not carry the snake through rock', () => {
  const state = dungeon();
  state.snake = [{ x: 2, y: 2 }, { x: 1, y: 2 }];
  state.direction = { x: 1, y: 0 };
  state.effects.ghost = 5000;

  tick(state, firstCell);

  assert.equal(state.status, 'over', 'the dungeon has to stay solid');
});

test('a shard scores, grows the snake and unlocks the portal', () => {
  const state = dungeon();
  state.snake = [{ x: 4, y: 1 }, { x: 3, y: 1 }];
  const length = state.snake.length;

  tick(state, firstCell); // onto the shard at 5,1

  assert.equal(state.score, 1);
  assert.equal(state.shardsTaken, 1);
  assert.equal(state.shards.length, 0);
  assert.equal(state.portalOpen, true);

  // Growth is paid out over the moves that follow rather than all at once.
  assert.equal(state.snake.length, length + 1);
  state.pending = [{ x: 0, y: 1 }];
  tick(state, firstCell);
  assert.equal(state.snake.length, length + state.config.shardGrowth);
});

test('the portal stays shut until the last shard is taken', () => {
  const state = dungeon();
  state.snake = [{ x: 2, y: 3 }, { x: 2, y: 2 }];
  state.direction = { x: -1, y: 0 };
  const depth = state.depth;

  tick(state, firstCell); // onto the locked portal at 1,3

  assert.equal(state.status, 'running');
  assert.equal(state.depth, depth, 'a locked portal is just floor');
  assert.deepEqual(state.snake[0], { x: 1, y: 3 });
});

test('an open portal descends to a fresh floor', () => {
  const state = dungeon();
  state.snake = [{ x: 2, y: 3 }, { x: 2, y: 2 }];
  state.direction = { x: -1, y: 0 };
  state.shards = [];
  state.portalOpen = true;
  state.score = 4;

  tick(state, firstCell);

  assert.equal(state.depth, 2);
  assert.equal(state.score, 4 + state.config.depthBonus);
  assert.equal(state.status, 'running');
  assert.ok(state.shards.length >= 3, 'the new floor has its own shards');
  assert.equal(state.portalOpen, false, 'and its own locked portal');
  assert.equal(state.shardsTaken, 0);
  // The snake squeezes through: the next floor starts it fresh.
  assert.equal(state.snake.length, 3);
});

test('effects survive the descent but the floor furniture does not', () => {
  const state = dungeon();
  state.snake = [{ x: 2, y: 3 }, { x: 2, y: 2 }];
  state.direction = { x: -1, y: 0 };
  state.shards = [];
  state.portalOpen = true;
  state.effects.ghost = 4000;
  state.powerUp = { type: 'slow', x: 5, y: 3, msLeft: 5000 };
  state.bonusFood = [{ x: 4, y: 3 }];

  tick(state, firstCell);

  assert.equal(state.effects.ghost, 4000, 'diving mid-Ghost keeps the Ghost');
  assert.equal(state.powerUp, null);
  assert.deepEqual(state.bonusFood, []);
});

test('adventure speed follows the depth, not the score', () => {
  const state = dungeon();
  const opening = state.tickInterval;

  state.score = 50;
  state.shards = [];
  state.portalOpen = true;
  state.snake = [{ x: 2, y: 3 }, { x: 2, y: 2 }];
  state.direction = { x: -1, y: 0 };
  tick(state, firstCell);

  assert.equal(state.tickInterval, opening - state.config.depthStep);
});

test('nothing spawns inside rock', () => {
  const state = dungeon({ powerUpChance: 1000, powerUpCooldown: 0 });

  for (let i = 0; i < 40; i += 1) {
    advanceClock(state, 100, Math.random);
    if (state.powerUp) {
      assert.ok(
        !state.blocked.has(state.powerUp.y * 7 + state.powerUp.x),
        'a collectible turned up inside a wall',
      );
      state.powerUp = null;
      state.powerUpCooldown = 0;
    }
  }
});

test('magnet cannot drag a shard through rock', () => {
  const state = dungeon();
  // Head and shard on opposite sides of the pillar at 3,2, aligned on the row.
  state.snake = [{ x: 2, y: 2 }, { x: 1, y: 2 }];
  state.direction = { x: 0, y: -1 };
  state.shards = [{ x: 5, y: 2 }];
  state.effects.magnet = 5000;

  tick(state, firstCell);

  assert.deepEqual(state.shards[0], { x: 4, y: 2 }, 'it closes to the pillar');

  state.direction = { x: 0, y: 1 };
  state.snake = [{ x: 2, y: 2 }, { x: 1, y: 2 }];
  state.magnetPhase = 0;
  tick(state, firstCell);

  assert.deepEqual(state.shards[0], { x: 4, y: 2 }, 'and then stops at it');
});

test('collectibles spawn within sight of the snake on a scrolling world', () => {
  const state = createGame({ mode: 'adventure' });
  state.status = 'running';
  const { viewCols, viewRows } = state.config;

  for (let i = 0; i < 60; i += 1) {
    const spot = spawnPowerUp(state, Math.random);
    assert.ok(spot, 'expected somewhere to put it');
    const head = state.snake[0];
    assert.ok(
      Math.abs(spot.x - head.x) <= viewCols / 2 && Math.abs(spot.y - head.y) <= viewRows / 2,
      `spawned off screen at ${spot.x},${spot.y} with the head at ${head.x},${head.y}`,
    );
  }
});

test('a single-screen board is unaffected by the on-screen rule', () => {
  const state = runningGame();
  const seen = new Set();

  for (let i = 0; i < 400; i += 1) {
    const spot = spawnPowerUp(state, Math.random);
    seen.add(`${spot.x},${spot.y}`);
  }

  // Far more distinct cells than a window around the head could account for.
  assert.ok(seen.size > 60, `only ${seen.size} distinct spawn cells`);
});
