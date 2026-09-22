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
  const clutter = [state.powerUp, ...state.bonusFood];
  return pick(freeCells(state, clutter), rng)
    ?? pick(freeCells(state, state.bonusFood), rng)
    ?? pick(freeCells(state), rng);
}

/**
 * One of the extra food items Feast puts out. These are deliberately *not*
 * candidates for the win check: the round is only cleared when the ordinary
 * food has nowhere left to go.
 */
export function spawnBonusFood(state, rng = Math.random) {
  const clutter = [state.powerUp, state.food, ...state.bonusFood];
  const free = freeCells(state, clutter);
  // Bonus food bows out when the board is tight rather than crowding the last
  // squares the player needs to manoeuvre in.
  if (free.length <= state.config.feastMultiplier) return null;
  return pick(free, rng);
}

/** Tops the board back up to `feastMultiplier` items while Feast is running. */
function refillBonusFood(state, rng) {
  const wanted = state.config.feastMultiplier - 1; // the ordinary food is the first
  while (state.bonusFood.length < wanted) {
    const cell = spawnBonusFood(state, rng);
    if (!cell) return;
    state.bonusFood.push(cell);
  }
}

/** A collectible in a free square, away from the food. Null if there is no room. */
export function spawnPowerUp(state, rng = Math.random) {
  const cell = pick(freeCells(state, [state.food, ...state.bonusFood]), rng);
  if (!cell) return null;

  const type = POWER_UP_TYPES[
    Math.min(POWER_UP_TYPES.length - 1, Math.floor(rng() * POWER_UP_TYPES.length))
  ];
  return { type, x: cell.x, y: cell.y, msLeft: state.config.powerUpLifetime };
}

/** Milliseconds remaining on an effect, 0 when it is not running. */
export function effectMs(state, type) {
  return state.effects[type] ?? 0;
}

export function isEffectActive(state, type) {
  return effectMs(state, type) > 0;
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
    // Extra food items, present only while Feast is running. They vanish with it.
    bonusFood: [],
    powerUp: null,
    // Ticks remaining per effect. Absent from the board state means inactive.
    // Milliseconds remaining per effect, counted down by `advanceClock`.
    effects: { slow: 0, ghost: 0, magnet: 0, feast: 0 },
    // Magnet moves the food on every other *move*, so its cadence is the one
    // thing here that is deliberately measured in ticks rather than time.
    magnetPhase: 0,
    // The first collectible waits out a cooldown too, so a round never opens
    // with one already sitting next to the snake.
    powerUpCooldown: config.powerUpCooldown,
    score: 0,
    timeLeft: config.mode === 'time' ? config.timeLimit : null,
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
 * Drags one food item a square toward the head along its longer axis, falling
 * back to the other axis when the direct step is blocked. Returns where it
 * ended up.
 *
 * Two deliberate restrictions keep Magnet fun rather than degenerate: food
 * never moves onto an occupied square, and it never steps while it is already
 * adjacent to the head — otherwise it would retreat ahead of a snake travelling
 * away from it and could never be caught.
 */
function pulled(state, food, taken) {
  const head = state.snake[0];
  const dx = head.x - food.x;
  const dy = head.y - food.y;
  if (Math.abs(dx) + Math.abs(dy) <= 1) return food;

  const horizontal = { x: food.x + Math.sign(dx), y: food.y };
  const vertical = { x: food.x, y: food.y + Math.sign(dy) };
  const candidates = Math.abs(dx) >= Math.abs(dy)
    ? [horizontal, vertical]
    : [vertical, horizontal];

  for (const cell of candidates) {
    if (cellsEqual(cell, food)) continue; // already aligned on that axis
    if (state.snake.some((seg) => cellsEqual(seg, cell))) continue;
    if (state.powerUp && cellsEqual(cell, state.powerUp)) continue;
    if (taken.some((other) => cellsEqual(other, cell))) continue;
    return cell;
  }
  return food;
}

/** Magnet applies to every food item on the board, Feast's extras included. */
function pullFood(state) {
  const hasMain = state.food !== null;
  const items = hasMain ? [state.food, ...state.bonusFood] : state.bonusFood.slice();

  for (let i = 0; i < items.length; i += 1) {
    // Every other item blocks this one, so two crumbs never stack up.
    items[i] = pulled(state, items[i], items.filter((_, j) => j !== i));
  }

  if (hasMain) state.food = items.shift();
  state.bonusFood = items;
}

function collectPowerUp(state, head, rng) {
  const powerUp = state.powerUp;
  if (!powerUp || !cellsEqual(powerUp, head)) return;

  // Re-collecting a running effect refreshes it rather than stacking, so the
  // HUD countdown always means what it says.
  state.effects[powerUp.type] = POWER_UPS[powerUp.type].duration;
  state.powerUp = null;
  state.powerUpCooldown = state.config.powerUpCooldown;

  if (powerUp.type === 'feast') refillBonusFood(state, rng);
}

/** Ages the collectible on the board, and rolls for a new one when there is none. */
function advancePowerUps(state, dt, rng) {
  if (state.powerUp) {
    state.powerUp.msLeft -= dt;
    if (state.powerUp.msLeft <= 0) {
      state.powerUp = null;
      state.powerUpCooldown = state.config.powerUpCooldown;
    }
    return;
  }

  if (state.powerUpCooldown > 0) {
    state.powerUpCooldown -= dt;
    return;
  }

  // Scaling the odds by the elapsed time keeps the spawn rate the same whether
  // the frame took 8ms or 30ms, and independent of how fast the snake is going.
  if (rng() < state.config.powerUpChance * (dt / 1000)) {
    state.powerUp = spawnPowerUp(state, rng);
  }
}

function expireEffects(state, dt) {
  for (const type of POWER_UP_TYPES) {
    if (state.effects[type] > 0) state.effects[type] = Math.max(0, state.effects[type] - dt);
  }

  // Feast's extra food is on loan: whatever was not eaten in time vanishes with
  // the effect. Only the ordinary food carries on between rounds of it.
  if (state.effects.feast === 0 && state.bonusFood.length > 0) state.bonusFood = [];
}

/**
 * Advances everything that runs on the wall clock rather than on moves:
 * effect timers, the collectible's lifetime and spawn roll, and the time attack
 * countdown. Called once per frame with the elapsed milliseconds, so none of it
 * is affected by how fast the snake happens to be moving — which is the whole
 * point: a Ghost collected at score 60 has to last as long as one at score 0.
 *
 * A stopped game does not age, so nothing drains while the player is paused or
 * sitting on the ready screen.
 */
export function advanceClock(state, dt, rng = Math.random) {
  if (state.status !== 'running' || dt <= 0) return state;

  expireEffects(state, dt);
  advancePowerUps(state, dt, rng);

  if (state.timeLeft !== null) {
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    if (state.timeLeft === 0) state.status = 'timeup';
  }

  return state;
}

/** Advances the game by exactly one move. Mutates and returns `state`. */
export function tick(state, rng = Math.random) {
  if (state.status !== 'running') return state;

  // Magnet moves the food before the snake does, on every other move, starting
  // with the first one: the food closes in at half the snake's pace, which
  // keeps it catchable, and the pull is visible immediately.
  if (isEffectActive(state, 'magnet')) {
    state.magnetPhase += 1;
    if (state.magnetPhase % 2 === 1) pullFood(state);
  }

  const dir = state.pending.shift() ?? state.direction;
  state.direction = dir;

  const { x, y, outOfBounds } = nextHead(state, dir);
  if (outOfBounds) {
    state.status = 'over';
    return state;
  }

  const head = { x, y };
  const onFood = state.food !== null && cellsEqual(head, state.food);
  const onBonus = state.bonusFood.some((food) => cellsEqual(food, head));
  const eating = onFood || onBonus;

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
    // Feast's crumbs are worth the same as the ordinary food, and speed the
    // snake up the same way — the power-up trades difficulty for score.
    state.score += 1;
    state.tickInterval = Math.max(
      state.config.minInterval,
      state.config.baseInterval - state.score * state.config.speedStep,
    );

    if (onBonus) {
      state.bonusFood = state.bonusFood.filter((food) => !cellsEqual(food, head));
    }

    if (onFood) {
      state.food = spawnFood(state, rng);
      if (state.food === null) {
        state.status = 'won';
        return state;
      }
    }

    // Keep the board at 4x for as long as the effect has left to run.
    if (isEffectActive(state, 'feast')) refillBonusFood(state, rng);
  } else {
    state.snake.pop();
  }

  collectPowerUp(state, head, rng);

  return state;
}
