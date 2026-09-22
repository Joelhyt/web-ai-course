// Pure game rules. Nothing in this file touches the DOM, the canvas, or storage,
// which is what lets the whole rule set be tested in plain Node.

import { DEFAULTS, MAX_QUEUED, POWER_UPS, POWER_UP_TYPES } from './config.js';

export function cellsEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

export function isOpposite(a, b) {
  return a.x + b.x === 0 && a.y + b.y === 0;
}

/**
 * Every grid square not currently covered by the snake, minus any extra cells
 * the caller wants kept clear (the food, the power-up on the board).
 */
export function freeCells(state, extras = []) {
  const { cols, rows } = state.config;
  const occupied = new Set(state.snake.map((seg) => seg.y * cols + seg.x));
  for (const cell of extras) {
    if (cell) occupied.add(cell.y * cols + cell.x);
  }

  const free = [];
  for (let i = 0; i < cols * rows; i += 1) {
    if (!occupied.has(i)) free.push({ x: i % cols, y: Math.floor(i / cols) });
  }
  return free;
}

function pick(free, rng) {
  if (free.length === 0) return null;
  return free[Math.min(free.length - 1, Math.floor(rng() * free.length))];
}

/**
 * Picks uniformly from the free cells rather than re-rolling until a free one
 * turns up. Rejection sampling gets arbitrarily slow as the snake fills the
 * board, and this version also tells us when the board is full: null means the
 * player has cleared it.
 *
 * A power-up sitting on the board is avoided when there is room to avoid it,
 * but never at the cost of reporting a full board that is not full — otherwise
 * a collectible in the last free square would fake a win.
 */
export function spawnFood(state, rng = Math.random) {
  const powerUp = state.powerUp;
  return pick(freeCells(state, [powerUp]), rng) ?? pick(freeCells(state), rng);
}

/** A collectible in a free square, away from the food. Null if there is no room. */
export function spawnPowerUp(state, rng = Math.random) {
  const cell = pick(freeCells(state, [state.food]), rng);
  if (!cell) return null;

  const type = POWER_UP_TYPES[
    Math.min(POWER_UP_TYPES.length - 1, Math.floor(rng() * POWER_UP_TYPES.length))
  ];
  return { type, x: cell.x, y: cell.y, ticksLeft: state.config.powerUpLifetime };
}

/** Ticks remaining on an effect, 0 when it is not running. */
export function effectTicks(state, type) {
  return state.effects[type] ?? 0;
}

export function isEffectActive(state, type) {
  return effectTicks(state, type) > 0;
}

/**
 * The interval the loop should actually wait between moves. Slow multiplies the
 * score-derived interval rather than replacing it, so the power-up is worth the
 * same relief late in a round as it is early on.
 */
export function effectiveInterval(state) {
  return isEffectActive(state, 'slow')
    ? state.tickInterval * state.config.slowFactor
    : state.tickInterval;
}

export function createGame(overrides = {}, rng = Math.random) {
  const config = { ...DEFAULTS, ...overrides };
  const cx = Math.floor(config.cols / 2);
  const cy = Math.floor(config.rows / 2);

  const state = {
    status: 'ready',
    snake: [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ],
    direction: { x: 1, y: 0 },
    pending: [],
    food: null,
    powerUp: null,
    // Ticks remaining per effect. Absent from the board state means inactive.
    effects: { slow: 0, ghost: 0, magnet: 0 },
    // The first collectible waits out a cooldown too, so a round never opens
    // with one already sitting next to the snake.
    powerUpCooldown: config.powerUpCooldown,
    score: 0,
    tickInterval: config.baseInterval,
    config,
  };

  state.food = spawnFood(state, rng);
  return state;
}

/**
 * Buffers a turn. Each candidate is checked against the direction that will be
 * in effect when it lands — the tail of the queue, or the current direction if
 * the queue is empty. Checking against the *current* direction instead is the
 * classic Snake bug: pressing Up then Left inside a single tick would let the
 * player reverse straight into their own neck.
 */
export function queueDirection(state, dir) {
  if (!dir) return false;
  if (state.pending.length >= MAX_QUEUED) return false;

  const previous = state.pending.length > 0
    ? state.pending[state.pending.length - 1]
    : state.direction;

  if (cellsEqual(dir, previous)) return false;
  if (isOpposite(dir, previous)) return false;

  state.pending.push(dir);
  return true;
}

function nextHead(state, dir) {
  const { cols, rows, walls } = state.config;
  const head = state.snake[0];
  let x = head.x + dir.x;
  let y = head.y + dir.y;

  if (walls === 'wrap') {
    x = (x + cols) % cols;
    y = (y + rows) % rows;
    return { x, y, outOfBounds: false };
  }

  return { x, y, outOfBounds: x < 0 || y < 0 || x >= cols || y >= rows };
}

/**
 * Drags the food one square toward the head along its longer axis, falling back
 * to the other axis when the direct step is blocked by the snake.
 *
 * Two deliberate restrictions keep Magnet fun rather than degenerate: the food
 * never moves onto a square the snake occupies, and it never steps while it is
 * already adjacent to the head — otherwise it would retreat ahead of a snake
 * travelling away from it and could never be caught.
 */
function pullFood(state) {
  const head = state.snake[0];
  const food = state.food;
  const dx = head.x - food.x;
  const dy = head.y - food.y;
  if (Math.abs(dx) + Math.abs(dy) <= 1) return;

  const horizontal = { x: food.x + Math.sign(dx), y: food.y };
  const vertical = { x: food.x, y: food.y + Math.sign(dy) };
  const candidates = Math.abs(dx) >= Math.abs(dy)
    ? [horizontal, vertical]
    : [vertical, horizontal];

  for (const cell of candidates) {
    if (cellsEqual(cell, food)) continue; // already aligned on that axis
    if (state.snake.some((seg) => cellsEqual(seg, cell))) continue;
    if (state.powerUp && cellsEqual(cell, state.powerUp)) continue;
    state.food = cell;
    return;
  }
}

function collectPowerUp(state, head) {
  const powerUp = state.powerUp;
  if (!powerUp || !cellsEqual(powerUp, head)) return;

  // Re-collecting a running effect refreshes it rather than stacking, so the
  // HUD countdown always means what it says.
  state.effects[powerUp.type] = POWER_UPS[powerUp.type].duration;
  state.powerUp = null;
  state.powerUpCooldown = state.config.powerUpCooldown;
}

/** Ages the collectible on the board, and rolls for a new one when there is none. */
function advancePowerUps(state, rng) {
  if (state.powerUp) {
    state.powerUp.ticksLeft -= 1;
    if (state.powerUp.ticksLeft <= 0) {
      state.powerUp = null;
      state.powerUpCooldown = state.config.powerUpCooldown;
    }
    return;
  }

  if (state.powerUpCooldown > 0) {
    state.powerUpCooldown -= 1;
    return;
  }

  if (rng() < state.config.powerUpChance) {
    state.powerUp = spawnPowerUp(state, rng);
  }
}

function expireEffects(state) {
  for (const type of POWER_UP_TYPES) {
    if (state.effects[type] > 0) state.effects[type] -= 1;
  }
}

/** Advances the game by exactly one move. Mutates and returns `state`. */
export function tick(state, rng = Math.random) {
  if (state.status !== 'running') return state;

  // Magnet moves the food before the snake does, on every other tick, so the
  // food closes in at half the snake's pace and stays catchable.
  if (state.food && isEffectActive(state, 'magnet') && state.effects.magnet % 2 === 0) {
    pullFood(state);
  }

  const dir = state.pending.shift() ?? state.direction;
  state.direction = dir;

  const { x, y, outOfBounds } = nextHead(state, dir);
  if (outOfBounds) {
    state.status = 'over';
    return state;
  }

  const head = { x, y };
  const eating = state.food !== null && cellsEqual(head, state.food);

  // Unless the snake is growing, the tail vacates its square on this same tick,
  // so moving into it is legal and must not count as a self-collision.
  if (!isEffectActive(state, 'ghost')) {
    const bodyLength = eating ? state.snake.length : state.snake.length - 1;
    for (let i = 0; i < bodyLength; i += 1) {
      if (cellsEqual(state.snake[i], head)) {
        state.status = 'over';
        return state;
      }
    }
  }

  state.snake.unshift(head);

  if (eating) {
    state.score += 1;
    state.tickInterval = Math.max(
      state.config.minInterval,
      state.config.baseInterval - state.score * state.config.speedStep,
    );
    state.food = spawnFood(state, rng);
    if (state.food === null) {
      state.status = 'won';
      return state;
    }
  } else {
    state.snake.pop();
  }

  collectPowerUp(state, head);
  advancePowerUps(state, rng);
  expireEffects(state);

  return state;
}
