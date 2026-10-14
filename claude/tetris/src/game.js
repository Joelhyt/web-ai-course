// The rules of Tetris as a pure state machine. No DOM, no canvas, no storage
// and no clock of its own: time arrives as an explicit delta in advanceClock,
// and randomness through the rng passed to createGame, so every rule here can
// be exercised from plain Node.

import { DEFAULTS, MODE_PRESETS, SCORING } from './config.js';
import { PIECE_TYPES, SHAPES, pieceCells, kicksFor } from './pieces.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function emptyRow(cols) {
  return new Array(cols).fill(null);
}

/**
 * A new round, waiting on `start`. `settings` overrides the mode preset, which
 * overrides the defaults.
 */
export function createGame(settings = {}, rng = Math.random) {
  const mode = settings.mode ?? DEFAULTS.mode;
  const config = Object.freeze({ ...DEFAULTS, ...MODE_PRESETS[mode], ...settings, mode });

  const state = {
    config,
    rng,
    board: Array.from({ length: config.rows }, () => emptyRow(config.cols)),
    queue: [],
    active: null, // { type, rotation, x, y } — null until the countdown ends
    hold: null,
    holdUsed: false, // one hold per piece, or holding becomes a free reroll
    score: 0,
    lines: 0,
    level: config.startLevel,
    pieces: 0,
    combo: -1, // -1 means no combo running; the first clear makes it 0
    backToBack: false,
    status: 'ready', // ready → countdown → running ⇄ paused → over | won
    countdown: config.countdownMs,
    elapsed: 0, // ms of play, stopped by pause; Sprint's result
    gravityAcc: 0,
    softDropping: false,
    lockTimer: 0,
    lockResets: 0,
    lowestY: 0,
    // T-spin detection needs to know how the piece got where it is.
    lastAction: null, // 'rotate' | 'move' | 'fall'
    lastKick: 0, // index of the kick offset the last rotation used
    lastClear: null, // what the last lock scored, for the HUD and the renderer
  };

  refillQueue(state);
  return state;
}

export function hiddenRows(config) {
  return config.rows - config.visibleRows;
}

// ---------------------------------------------------------------------------
// Randomiser
// ---------------------------------------------------------------------------

/**
 * The 7-bag: every run of seven pieces is one of each, shuffled. It bounds the
 * drought — at most twelve pieces between two I pieces — which is what makes
 * modern Tetris a game of skill rather than of waiting.
 */
function shuffledBag(rng) {
  const bag = [...PIECE_TYPES];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

// A full bag beyond the preview is kept queued, so the preview can never run dry.
function refillQueue(state) {
  while (state.queue.length < state.config.previewCount + PIECE_TYPES.length) {
    state.queue.push(...shuffledBag(state.rng));
  }
}

function takeNext(state) {
  const type = state.queue.shift();
  refillQueue(state);
  return type;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** True if the cell is a wall, the floor or a locked mino. */
export function isBlocked(state, x, y) {
  const { cols, rows } = state.config;
  if (x < 0 || x >= cols || y < 0 || y >= rows) return true;
  return state.board[y][x] !== null;
}

export function fits(state, type, rotation, x, y) {
  return pieceCells(type, rotation).every((cell) => !isBlocked(state, x + cell.x, y + cell.y));
}

/** The active piece's cells on the board. */
export function activeCells(state, piece = state.active) {
  return pieceCells(piece.type, piece.rotation).map((cell) => ({
    x: piece.x + cell.x,
    y: piece.y + cell.y,
  }));
}

function isGrounded(state) {
  const p = state.active;
  return !fits(state, p.type, p.rotation, p.x, p.y + 1);
}

/** Where a hard drop would land: the row the ghost piece is drawn on. */
export function ghostY(state) {
  const p = state.active;
  let y = p.y;
  while (fits(state, p.type, p.rotation, p.x, y + 1)) y += 1;
  return y;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

/**
 * Guideline spawn: centred (rounding left), with every bounding box's top row
 * two rows above the board — so the flat I and the lower row of the others
 * sit in the buffer row just above it — then one row down straight away if
 * there is room, which brings the piece into view. A spawn that overlaps the
 * stack is a block out and ends the game.
 */
function spawn(state, type) {
  const { cols } = state.config;
  const piece = {
    type,
    rotation: 0,
    x: Math.floor((cols - SHAPES[type].size) / 2),
    y: hiddenRows(state.config) - 2,
  };

  state.active = piece;
  state.gravityAcc = 0;
  state.lockTimer = 0;
  state.lockResets = 0;
  state.lastAction = null;
  state.lastKick = 0;

  if (!fits(state, type, 0, piece.x, piece.y)) {
    state.status = 'over';
    return;
  }
  if (fits(state, type, 0, piece.x, piece.y + 1)) piece.y += 1;
  state.lowestY = piece.y;
}

/** Leaves the ready screen. The first piece drops when the countdown ends. */
export function start(state) {
  if (state.status !== 'ready') return;
  state.status = 'countdown';
  if (state.countdown <= 0) begin(state);
}

function begin(state) {
  state.status = 'running';
  state.countdown = 0;
  spawn(state, takeNext(state));
}

export function togglePause(state) {
  if (state.status === 'running') state.status = 'paused';
  else if (state.status === 'paused') state.status = 'running';
}

// ---------------------------------------------------------------------------
// Player actions. Each returns whether it did anything.
// ---------------------------------------------------------------------------

/**
 * Extended placement. Any successful move or rotation of a piece that is on the
 * ground, or lands on it, restarts the lock timer — until the resets run out.
 * After that the timer keeps running however much the piece is wiggled, which
 * is what stops a piece being spun in place forever.
 */
function afterManipulation(state, wasGrounded) {
  if (!(wasGrounded || isGrounded(state))) return;
  if (state.lockResets < state.config.maxLockResets) {
    state.lockResets += 1;
    state.lockTimer = 0;
  }
}

/** Moves the active piece one column left (-1) or right (1). */
export function shift(state, dx) {
  if (state.status !== 'running') return false;
  const p = state.active;
  if (!fits(state, p.type, p.rotation, p.x + dx, p.y)) return false;
  const wasGrounded = isGrounded(state);
  p.x += dx;
  state.lastAction = 'move';
  afterManipulation(state, wasGrounded);
  return true;
}

/**
 * Turns the active piece clockwise (1) or counter-clockwise (-1), trying each
 * SRS kick in order until one fits.
 */
export function rotate(state, direction) {
  if (state.status !== 'running') return false;
  const p = state.active;
  const to = (p.rotation + direction + 4) % 4;
  const kicks = kicksFor(p.type, p.rotation, to);
  const wasGrounded = isGrounded(state);

  for (let i = 0; i < kicks.length; i += 1) {
    const x = p.x + kicks[i].x;
    const y = p.y + kicks[i].y;
    if (fits(state, p.type, to, x, y)) {
      p.rotation = to;
      p.x = x;
      p.y = y;
      state.lastAction = 'rotate';
      state.lastKick = i;
      afterManipulation(state, wasGrounded);
      return true;
    }
  }
  return false;
}

/**
 * One row down, from gravity or a soft drop. A new lowest row gives the piece
 * a fresh lock timer and a fresh set of resets.
 */
function stepDown(state, soft) {
  const p = state.active;
  if (!fits(state, p.type, p.rotation, p.x, p.y + 1)) return false;
  p.y += 1;
  state.lastAction = 'fall';
  if (soft) state.score += SCORING.softDrop;
  if (p.y > state.lowestY) {
    state.lowestY = p.y;
    state.lockResets = 0;
    state.lockTimer = 0;
  }
  return true;
}

/**
 * Soft drop is a held state rather than a one-off action: it speeds gravity
 * up while the key is down. Pressing it also moves the piece one row at once,
 * so a tap is never swallowed by the gap before the next gravity step.
 */
export function setSoftDrop(state, on) {
  const wasOn = state.softDropping;
  state.softDropping = on;
  if (on && !wasOn && state.status === 'running') {
    stepDown(state, true);
    state.gravityAcc = 0;
  }
}

export function hardDrop(state) {
  if (state.status !== 'running') return false;
  const p = state.active;
  const target = ghostY(state);
  const rows = target - p.y;
  if (rows > 0) {
    p.y = target;
    state.lastAction = 'fall';
    state.score += rows * SCORING.hardDrop;
  }
  lockPiece(state);
  return true;
}

/**
 * Swaps the active piece into the hold slot, bringing the held piece (or the
 * next one) in at the top. Allowed once per piece.
 */
export function holdPiece(state) {
  if (state.status !== 'running' || state.holdUsed) return false;
  const current = state.active.type;
  const incoming = state.hold ?? takeNext(state);
  state.hold = current;
  state.holdUsed = true;
  spawn(state, incoming);
  return true;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/**
 * Guideline gravity: seconds per row = (0.8 − (level − 1) × 0.007)^(level − 1).
 * One second at level 1, about a twentieth of that by level 10.
 */
export function gravityInterval(level) {
  return 1000 * (0.8 - (level - 1) * 0.007) ** (level - 1);
}

function currentInterval(state) {
  const base = gravityInterval(state.level);
  return state.softDropping ? base / state.config.softDropFactor : base;
}

/**
 * Advances everything measured in real time: the countdown, gravity, the lock
 * timer and the round clock. Pausing is simply not calling this.
 */
export function advanceClock(state, dt) {
  if (state.status === 'countdown') {
    state.countdown -= dt;
    if (state.countdown <= 0) begin(state);
    return;
  }
  if (state.status !== 'running') return;

  state.elapsed += dt;

  // High levels drop several rows per frame; the loop steps through each one so
  // a fast piece still lands on the first thing below it, not through it.
  state.gravityAcc += dt;
  let interval = currentInterval(state);
  while (state.gravityAcc >= interval) {
    state.gravityAcc -= interval;
    if (!stepDown(state, state.softDropping)) {
      state.gravityAcc = 0;
      break;
    }
    interval = currentInterval(state);
  }

  // The lock timer only runs while the piece rests on something. It is not
  // cleared when a kick lifts the piece off the ground, or a piece could be
  // hopped up and down forever once its resets were spent.
  if (isGrounded(state)) {
    state.lockTimer += dt;
    if (state.lockTimer >= state.config.lockDelay) lockPiece(state);
  }
}

/** How far through its lock delay the active piece is, 0 to 1. */
export function lockProgress(state) {
  if (!state.active || state.status !== 'running' || !isGrounded(state)) return 0;
  return Math.min(1, state.lockTimer / state.config.lockDelay);
}

// ---------------------------------------------------------------------------
// Locking, clearing and scoring
// ---------------------------------------------------------------------------

// Clockwise from top-left, around the centre of the T's 3x3 box.
const T_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
// The two corners either side of the T's point, in each rotation state.
const T_FRONT = [[0, 1], [1, 2], [2, 3], [3, 0]];

/**
 * The guideline's three-corner rule. A T piece whose last move was a rotation,
 * and which has at least three of the four corners around its centre blocked
 * (walls and floor count), is a T-spin. It is a full T-spin if both corners
 * beside its point are blocked, and a mini otherwise — unless the rotation
 * needed the last kick in the table, the one that lets a T-spin triple and the
 * "fin" setups work, which always counts in full.
 */
export function detectTSpin(state) {
  const p = state.active;
  if (p.type !== 'T' || state.lastAction !== 'rotate') return null;
  const cx = p.x + 1;
  const cy = p.y + 1;
  const blocked = T_CORNERS.map(([dx, dy]) => isBlocked(state, cx + dx, cy + dy));
  if (blocked.filter(Boolean).length < 3) return null;
  const front = T_FRONT[p.rotation].every((i) => blocked[i]);
  return front || state.lastKick === 4 ? 'full' : 'mini';
}

/** Removes full rows and returns their indices, as they were before removal. */
function clearLines(state) {
  const { cols } = state.config;
  const cleared = [];
  state.board.forEach((row, y) => {
    if (row.every((cell) => cell !== null)) cleared.push(y);
  });
  if (cleared.length) {
    const kept = state.board.filter((_, y) => !cleared.includes(y));
    state.board = [...cleared.map(() => emptyRow(cols)), ...kept];
  }
  return cleared;
}

function levelFor(state) {
  const { startLevel, linesPerLevel, levelUp } = state.config;
  return levelUp ? startLevel + Math.floor(state.lines / linesPerLevel) : startLevel;
}

function award(state, lines, tspin, rows) {
  const level = state.level;
  let base;
  if (tspin === 'full') base = SCORING.tspin[lines];
  else if (tspin === 'mini') base = SCORING.tspinMini[lines];
  else base = SCORING.lines[lines];

  if (lines === 0) {
    // A T-spin with no lines scores, but it neither extends nor breaks
    // back-to-back, and it does end a combo.
    state.combo = -1;
    if (!tspin) return;
    const points = base * level;
    state.score += points;
    state.lastClear = { lines, tspin, backToBack: false, combo: -1, perfect: false, points, rows, at: state.elapsed };
    return;
  }

  // Tetrises and T-spins that clear lines are "difficult". Chaining them
  // earns half as much again; any easier clear in between breaks the chain.
  const difficult = lines === 4 || tspin !== null;
  const backToBack = difficult && state.backToBack;
  state.backToBack = difficult;

  let points = base * level * (backToBack ? SCORING.backToBack : 1);

  state.combo += 1;
  if (state.combo > 0) points += SCORING.combo * state.combo * level;

  const perfect = state.board.every((row) => row.every((cell) => cell === null));
  if (perfect) {
    const bonus = backToBack && lines === 4
      ? SCORING.perfectClearB2BTetris
      : SCORING.perfectClear[lines];
    points += bonus * level;
  }

  points = Math.floor(points);
  state.score += points;
  state.lastClear = { lines, tspin, backToBack, combo: state.combo, perfect, points, rows, at: state.elapsed };
}

function lockPiece(state) {
  const tspin = detectTSpin(state);
  const cells = activeCells(state);
  for (const { x, y } of cells) state.board[y][x] = state.active.type;
  state.pieces += 1;

  const rows = clearLines(state);

  // Lock out: the whole piece came to rest above the visible board.
  const hidden = hiddenRows(state.config);
  if (rows.length === 0 && cells.every((cell) => cell.y < hidden)) {
    state.combo = -1;
    state.status = 'over';
    return;
  }

  award(state, rows.length, tspin, rows);
  state.lines += rows.length;
  state.level = levelFor(state);

  if (state.lines >= state.config.lineGoal) {
    state.status = 'won';
    state.active = null;
    return;
  }

  state.holdUsed = false;
  spawn(state, takeNext(state));
}

/** What a clear was called, for the popup beside the board. */
export function clearLabel(clear) {
  const NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
  if (clear.tspin) {
    const kind = clear.tspin === 'mini' ? 'T-SPIN MINI' : 'T-SPIN';
    return clear.lines ? `${kind} ${NAMES[clear.lines]}` : kind;
  }
  return NAMES[clear.lines];
}
