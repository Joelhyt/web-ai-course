// The rules of Pac-Man as a pure state machine. No DOM, no canvas, no storage
// and no clock of its own: time arrives as an explicit delta in advanceClock,
// and randomness (only frightened ghosts use any) through the rng passed to
// createGame, so every rule here can be exercised from plain Node.

import {
  BASE_SPEED,
  CORNER_WINDOW,
  DEFAULTS,
  EAT_PAUSE_TICKS,
  FLASH_MS,
  SCORING,
  TICK_MS,
  levelSpec,
} from './config.js';
import {
  DIRS,
  FRUIT_SPOT,
  OPPOSITE,
  PAC_START,
  countDots,
  createMaze,
  isOpen,
  stepToCentre,
  tileOf,
} from './maze.js';
import {
  calmGhosts,
  countDot,
  createGhosts,
  frightenGhosts,
  moveGhost,
  resetGhosts,
  reverseGhosts,
  updateRelease,
} from './ghosts.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function newPac() {
  return {
    x: PAC_START.x,
    y: PAC_START.y,
    dir: 'left', // facing; kept while standing still, since Pinky and Inky aim by it
    want: null, // the last direction asked for, taken at the first chance
    moving: true,
    pause: 0, // ticks left standing still after eating
    travel: 0, // tiles walked this life, which drives the chomping mouth
  };
}

/** A new game, waiting on `start`. */
export function createGame(settings = {}, rng = Math.random) {
  const config = Object.freeze({ ...DEFAULTS, ...settings });
  const state = {
    config,
    rng,
    level: 1,
    score: 0,
    lives: config.lives, // including the one being played
    extraLifeGiven: false,
    status: 'ready', // ready → countdown → running ⇄ paused → dying | cleared → countdown … → over
    timer: 0, // ms into (or, counting down, left of) the current status
    acc: 0, // ms not yet simulated, less than one tick
    freeze: null, // { ms, ghost, points } while an eaten ghost's points show
    popups: [], // fruit points: { x, y, points, ms }
    lastEvent: null, // the latest thing worth announcing: { text }
  };
  startLevel(state);
  return state;
}

function startLevel(state) {
  state.maze = createMaze();
  state.dotsLeft = countDots(state.maze).total;
  state.dotsEaten = 0;
  state.ghosts = createGhosts();
  // The shared house counter is only used after a lost life.
  state.globalDots = null;
  state.elroySuspended = false;
  resetPositions(state);
}

/** Everyone back to the start, as after a lost life. The dots stay as they are. */
function resetPositions(state) {
  state.pac = newPac();
  resetGhosts(state);
  state.mode = 'scatter';
  state.modeIndex = 0;
  state.modeTimer = 0;
  state.frightTimer = 0;
  state.ghostChain = 0;
  state.dotTimer = 0;
  state.fruit = null;
  state.freeze = null;
  state.acc = 0;
}

/** Leaves the ready screen. */
export function start(state) {
  if (state.status !== 'ready') return;
  countdown(state, state.config.startMs);
}

function countdown(state, ms) {
  state.status = 'countdown';
  state.timer = ms;
  if (ms <= 0) state.status = 'running';
}

export function togglePause(state) {
  if (state.status === 'running') state.status = 'paused';
  else if (state.status === 'paused') state.status = 'running';
}

/**
 * Asks Pac-Man to go a direction. He turns as soon as the maze lets him, and
 * keeps the request until then, so a turn can be pressed early.
 */
export function steer(state, dir) {
  if (DIRS[dir]) state.pac.want = dir;
}

// ---------------------------------------------------------------------------
// Pac-Man
// ---------------------------------------------------------------------------

function pacCanGo(state, dir) {
  const { col, row } = tileOf(state.pac);
  return isOpen(state.maze, col + DIRS[dir].x, row + DIRS[dir].y);
}

/** Distance from the centre of Pac-Man's tile along his lane. */
function offCentre(pac) {
  const along = DIRS[pac.dir].x ? pac.x : pac.y;
  return Math.abs(along - Math.round(along));
}

function tryTurn(state) {
  const pac = state.pac;
  const want = pac.want;
  if (!want) return;
  if (want === pac.dir) {
    if (!pac.moving && pacCanGo(state, want)) pac.moving = true;
    return;
  }
  // Turning back is allowed anywhere: the way he came is open.
  if (want === OPPOSITE[pac.dir] && (offCentre(pac) > 0 || pacCanGo(state, want))) {
    pac.dir = want;
    pac.moving = true;
    return;
  }
  // A turn is allowed a little before or after the centre; he then cuts the
  // corner (see stepToCentre).
  if (want !== OPPOSITE[pac.dir] && offCentre(pac) <= CORNER_WINDOW && pacCanGo(state, want)) {
    pac.dir = want;
    pac.moving = true;
  }
}

function speedPerTick(percent) {
  return (percent / 100) * BASE_SPEED * (TICK_MS / 1000);
}

function movePac(state) {
  const pac = state.pac;
  if (pac.pause > 0) {
    pac.pause -= 1;
    return;
  }
  const spec = levelSpec(state.level);
  let dist = speedPerTick(state.frightTimer > 0 ? spec.pacFright : spec.pac);
  tryTurn(state);
  while (dist > 0 && pac.moving) {
    // On a tile centre facing a wall, he stops there.
    if (offCentre(pac) === 0 && !pacCanGo(state, pac.dir)) {
      pac.moving = false;
      break;
    }
    const { used, reached } = stepToCentre(pac, dist);
    dist -= used;
    pac.travel += used;
    eat(state);
    if (reached) tryTurn(state);
  }
}

// ---------------------------------------------------------------------------
// Eating and scoring
// ---------------------------------------------------------------------------

function addScore(state, points) {
  state.score += points;
  if (!state.extraLifeGiven && state.score >= state.config.extraLifeAt) {
    state.extraLifeGiven = true;
    state.lives += 1;
    state.lastEvent = { text: 'Extra life' };
  }
}

function eat(state) {
  const { col, row } = tileOf(state.pac);
  const value = state.maze.dots[row]?.[col];
  if (!value) return;
  state.maze.dots[row][col] = 0;
  state.dotsLeft -= 1;
  state.dotsEaten += 1;
  countDot(state);

  if (value === 2) {
    addScore(state, SCORING.energizer);
    state.pac.pause = EAT_PAUSE_TICKS.energizer;
    energize(state);
  } else {
    addScore(state, SCORING.dot);
    state.pac.pause = EAT_PAUSE_TICKS.dot;
  }

  if (state.config.fruitDots.includes(state.dotsEaten)) {
    state.fruit = { ...levelSpec(state.level).fruit, ms: state.config.fruitMs };
  }
}

function energize(state) {
  const { frightMs } = levelSpec(state.level);
  state.ghostChain = 0;
  frightenGhosts(state, frightMs);
  state.frightTimer = frightMs;
}

function eatFruit(state) {
  const fruit = state.fruit;
  if (!fruit) return;
  const pac = state.pac;
  if (Math.round(pac.y) !== FRUIT_SPOT.y || Math.abs(pac.x - FRUIT_SPOT.x) > 0.75) return;
  addScore(state, fruit.points);
  state.popups.push({ ...FRUIT_SPOT, points: fruit.points, ms: state.config.popupMs });
  state.lastEvent = { text: `${fruit.name}, ${fruit.points} points` };
  state.fruit = null;
}

function eatGhost(state, ghost) {
  const points = SCORING.ghosts[Math.min(state.ghostChain, SCORING.ghosts.length - 1)];
  state.ghostChain += 1;
  addScore(state, points);
  ghost.state = 'eyes';
  ghost.frightened = false;
  state.freeze = { ms: state.config.ghostEatenMs, ghost: ghost.name, points };
}

/**
 * Pac-Man and a ghost meet when they stand on the same tile. Like the arcade,
 * this is checked after Pac-Man moves and again after the ghosts do, which
 * still lets the two occasionally slip past each other.
 */
function checkCollisions(state) {
  const pac = tileOf(state.pac);
  for (const ghost of state.ghosts) {
    if (ghost.state !== 'active') continue;
    const tile = tileOf(ghost);
    if (tile.col !== pac.col || tile.row !== pac.row) continue;
    if (ghost.frightened) {
      // One at a time: a second ghost on the tile is eaten after the pause.
      eatGhost(state, ghost);
    } else {
      die(state);
    }
    return true;
  }
  return false;
}

function die(state) {
  state.status = 'dying';
  state.timer = 0;
  state.fruit = null;
  state.lastEvent = { text: 'Caught' };
}

// ---------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------

function updateMode(state) {
  // The scatter/chase clock stops while the ghosts are frightened.
  if (state.frightTimer > 0) return;
  const schedule = levelSpec(state.level).schedule;
  state.modeTimer += TICK_MS;
  while (state.modeTimer >= schedule[state.modeIndex]) {
    state.modeTimer -= schedule[state.modeIndex];
    state.modeIndex += 1;
    state.mode = state.modeIndex % 2 === 0 ? 'scatter' : 'chase';
    reverseGhosts(state);
  }
}

function updateFright(state) {
  if (state.frightTimer <= 0) return;
  state.frightTimer -= TICK_MS;
  if (state.frightTimer <= 0) {
    state.frightTimer = 0;
    calmGhosts(state);
  }
}

/** Whether frightened ghosts are in their white phase, as the fright runs out. */
export function frightFlashing(state) {
  const { flashes } = levelSpec(state.level);
  if (state.frightTimer <= 0 || state.frightTimer > flashes * FLASH_MS) return false;
  return Math.floor(state.frightTimer / (FLASH_MS / 2)) % 2 === 1;
}

/** One 1/60 s step of play. */
function tick(state) {
  state.popups = state.popups.filter((p) => (p.ms -= TICK_MS) > 0);

  if (state.freeze) {
    state.freeze.ms -= TICK_MS;
    if (state.freeze.ms <= 0) state.freeze = null;
    return;
  }

  updateMode(state);
  updateFright(state);
  if (state.fruit && (state.fruit.ms -= TICK_MS) <= 0) state.fruit = null;

  movePac(state);
  eatFruit(state);
  if (state.dotsLeft === 0) {
    state.status = 'cleared';
    state.timer = 0;
    state.lastEvent = { text: `Level ${state.level} cleared` };
    return;
  }
  if (checkCollisions(state)) return;

  updateRelease(state);
  for (const ghost of state.ghosts) moveGhost(state, ghost);
  checkCollisions(state);
}

/** How long the death sequence takes, from the catch to the next life. */
export function deathMs(config) {
  return config.deathFreezeMs + config.deathAnimMs + config.deathPauseMs;
}

/**
 * Advances everything measured in real time. Play runs in fixed 1/60 s ticks,
 * as the arcade's did; the countdown, death and level-clear sequences run on
 * the raw delta. Pausing is simply not calling this.
 */
export function advanceClock(state, dt) {
  const { config } = state;
  switch (state.status) {
    case 'countdown':
      state.timer -= dt;
      if (state.timer <= 0) {
        state.status = 'running';
        state.timer = 0;
      }
      return;

    case 'dying':
      state.timer += dt;
      if (state.timer < deathMs(config)) return;
      state.lives -= 1;
      if (state.lives <= 0) {
        state.status = 'over';
        state.lastEvent = { text: 'Game over' };
        return;
      }
      resetPositions(state);
      // From now on the house empties by the shared counter, and Blinky's
      // Elroy speed waits until Clyde is out.
      state.globalDots = 0;
      state.elroySuspended = true;
      countdown(state, config.readyMs);
      return;

    case 'cleared':
      state.timer += dt;
      if (state.timer < config.clearMs) return;
      state.level += 1;
      startLevel(state);
      countdown(state, config.readyMs);
      return;

    case 'running':
      state.acc += dt;
      while (state.acc >= TICK_MS && state.status === 'running') {
        state.acc -= TICK_MS;
        tick(state);
      }
      return;

    default:
  }
}
