// Pure game rules. Nothing in this file touches the DOM, the canvas, or storage,
// which is what lets the whole rule set be tested in plain Node.

import { DEFAULTS, MAX_QUEUED } from './config.js';

export function cellsEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

export function isOpposite(a, b) {
  return a.x + b.x === 0 && a.y + b.y === 0;
}

/** Every grid square not currently covered by the snake. */
export function freeCells(state) {
  const { cols, rows } = state.config;
  const occupied = new Set(state.snake.map((seg) => seg.y * cols + seg.x));
  const free = [];
  for (let i = 0; i < cols * rows; i += 1) {
    if (!occupied.has(i)) free.push({ x: i % cols, y: Math.floor(i / cols) });
  }
  return free;
}

/**
 * Picks uniformly from the free cells rather than re-rolling until a free one
 * turns up. Rejection sampling gets arbitrarily slow as the snake fills the
 * board, and this version also tells us when the board is full: null means the
 * player has cleared it.
 */
export function spawnFood(state, rng = Math.random) {
  const free = freeCells(state);
  if (free.length === 0) return null;
  const index = Math.min(free.length - 1, Math.floor(rng() * free.length));
  return free[index];
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

/** Advances the game by exactly one move. Mutates and returns `state`. */
export function tick(state, rng = Math.random) {
  if (state.status !== 'running') return state;

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
  const bodyLength = eating ? state.snake.length : state.snake.length - 1;
  for (let i = 0; i < bodyLength; i += 1) {
    if (cellsEqual(state.snake[i], head)) {
      state.status = 'over';
      return state;
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
    if (state.food === null) state.status = 'won';
  } else {
    state.snake.pop();
  }

  return state;
}
