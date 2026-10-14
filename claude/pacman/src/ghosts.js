// The four ghosts: where each one aims, how it picks a turn, how it leaves the
// house and how its eyes get back in. Pure, like game.js: state in, state out.

import {
  BASE_SPEED,
  EYES_SPEED,
  HOUSE_SPEED,
  TICK_MS,
  levelSpec,
  personalDotLimit,
} from './config.js';
import {
  DIRS,
  DIR_ORDER,
  OPPOSITE,
  HOUSE,
  isOpen,
  isNoUpTile,
  isTunnel,
  stepToCentre,
  tileOf,
} from './maze.js';

export const GHOST_NAMES = Object.freeze(['blinky', 'pinky', 'inky', 'clyde']);

// Where each ghost heads in scatter: just outside a corner of the maze, where
// it can never arrive, so it circles the block nearest that corner.
export const SCATTER_TARGETS = Object.freeze({
  blinky: Object.freeze({ col: 25, row: -3 }),
  pinky: Object.freeze({ col: 2, row: -3 }),
  inky: Object.freeze({ col: 27, row: 31 }),
  clyde: Object.freeze({ col: 0, row: 31 }),
});

// Where eaten ghosts aim for: the tile just above the door.
const EYES_TARGET = Object.freeze({ col: 13, row: HOUSE.exitY });

// Start positions. Blinky starts outside, above the door; the others wait in
// the house, which is also where each of them is revived after being eaten.
// Blinky is revived in the middle of the house.
const STARTS = Object.freeze({
  blinky: Object.freeze({ x: 13.5, y: HOUSE.exitY, dir: 'left', state: 'active' }),
  pinky: Object.freeze({ x: 13.5, y: HOUSE.centreY, dir: 'down', state: 'house' }),
  inky: Object.freeze({ x: 11.5, y: HOUSE.centreY, dir: 'up', state: 'house' }),
  clyde: Object.freeze({ x: 15.5, y: HOUSE.centreY, dir: 'up', state: 'house' }),
});

const HOME_X = Object.freeze({ blinky: 13.5, pinky: 13.5, inky: 11.5, clyde: 15.5 });

// After a lost life the ghosts in the house share one dot counter, and leave as
// it reaches these. Clyde has no number: see updateRelease.
const GLOBAL_RELEASE = Object.freeze({ pinky: 7, inky: 17 });

// Ghost states:
//   house     waiting in the house, bobbing up and down
//   leaving   walking out through the door
//   active    in the maze, scattering, chasing or frightened
//   eyes      eaten, heading back to the door
//   entering  eyes going down through the door to be revived
export function createGhosts() {
  return GHOST_NAMES.map((name) => ({
    name,
    ...STARTS[name],
    frightened: false,
    dots: 0, // personal dot counter for leaving the house
  }));
}

/** Back to the start positions after a lost life. Dot counters carry over. */
export function resetGhosts(state) {
  for (const ghost of state.ghosts) {
    Object.assign(ghost, STARTS[ghost.name], { frightened: false });
  }
}

export function ghostByName(state, name) {
  return state.ghosts.find((g) => g.name === name);
}

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

/**
 * `n` tiles ahead of a tile in a direction. Facing up, the arcade's version is
 * also `n` tiles to the left: an overflow bug in the original code that Pinky
 * and Inky inherit, and that players have long learned to use.
 */
export function tilesAhead(tile, dir, n) {
  const d = DIRS[dir];
  const col = tile.col + d.x * n - (dir === 'up' ? n : 0);
  return { col, row: tile.row + d.y * n };
}

/** 0, or which "Cruise Elroy" stage Blinky is in. */
export function elroyStage(state) {
  if (state.elroySuspended) return 0;
  const spec = levelSpec(state.level);
  if (state.dotsLeft <= spec.elroy2Dots) return 2;
  if (state.dotsLeft <= spec.elroy1Dots) return 1;
  return 0;
}

/** The tile a ghost steers toward right now. */
export function targetTile(state, ghost) {
  if (ghost.state === 'eyes') return EYES_TARGET;
  const pac = tileOf(state.pac);
  // Elroy chases even in scatter.
  const elroy = ghost.name === 'blinky' && elroyStage(state) > 0;
  if (state.mode === 'scatter' && !elroy) return SCATTER_TARGETS[ghost.name];

  switch (ghost.name) {
    case 'blinky':
      return pac;
    case 'pinky':
      return tilesAhead(pac, state.pac.dir, 4);
    case 'inky': {
      // Double the vector from Blinky to the tile two ahead of Pac-Man.
      const pivot = tilesAhead(pac, state.pac.dir, 2);
      const blinky = tileOf(ghostByName(state, 'blinky'));
      return { col: 2 * pivot.col - blinky.col, row: 2 * pivot.row - blinky.row };
    }
    case 'clyde': {
      // Chases from afar, but within eight tiles of Pac-Man loses his nerve
      // and heads for his corner.
      const own = tileOf(ghost);
      const dx = own.col - pac.col;
      const dy = own.row - pac.row;
      return dx * dx + dy * dy > 64 ? pac : SCATTER_TARGETS.clyde;
    }
    default:
      return pac;
  }
}

/**
 * The direction a ghost takes from the tile centre it is on. Ghosts never turn
 * back on their own. Of the other exits they take the one whose next tile is
 * nearest the target in a straight line, ties going up, left, down, right.
 * Frightened ghosts pick at random instead.
 */
export function chooseDirection(state, ghost) {
  const { col, row } = tileOf(ghost);
  const restricted = ghost.state === 'active' && !ghost.frightened && isNoUpTile(col, row);
  const options = DIR_ORDER.filter((dir) => {
    if (dir === OPPOSITE[ghost.dir]) return false;
    if (dir === 'up' && restricted) return false;
    return isOpen(state.maze, col + DIRS[dir].x, row + DIRS[dir].y);
  });
  // The maze has no dead ends, but turning back beats walking into a wall.
  if (!options.length) return OPPOSITE[ghost.dir];

  if (ghost.frightened && ghost.state === 'active') {
    // As in the arcade: a random direction, or if that is not an exit, the
    // next one in the order that is.
    const start = Math.floor(state.rng() * DIR_ORDER.length);
    for (let i = 0; i < DIR_ORDER.length; i += 1) {
      const dir = DIR_ORDER[(start + i) % DIR_ORDER.length];
      if (options.includes(dir)) return dir;
    }
  }

  const target = targetTile(state, ghost);
  let best = options[0];
  let bestDistance = Infinity;
  for (const dir of options) {
    const dx = col + DIRS[dir].x - target.col;
    const dy = row + DIRS[dir].y - target.row;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = dir;
      bestDistance = distance;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Mode changes
// ---------------------------------------------------------------------------

/**
 * Turns every ghost in the maze around. Happens on every switch between
 * scatter and chase and on every energizer; it is the tell that the mode
 * changed.
 */
export function reverseGhosts(state) {
  for (const ghost of state.ghosts) {
    if (ghost.state === 'active') ghost.dir = OPPOSITE[ghost.dir];
  }
}

/** An energizer: all ghosts but eyes reverse, and turn blue if the level allows it. */
export function frightenGhosts(state, frightMs) {
  reverseGhosts(state);
  if (frightMs <= 0) return;
  for (const ghost of state.ghosts) {
    if (ghost.state !== 'eyes' && ghost.state !== 'entering') ghost.frightened = true;
  }
}

export function calmGhosts(state) {
  for (const ghost of state.ghosts) ghost.frightened = false;
}

// ---------------------------------------------------------------------------
// Leaving the house
// ---------------------------------------------------------------------------

function nextInHouse(state) {
  // Pinky, then Inky, then Clyde: only the first one still inside counts.
  return ['pinky', 'inky', 'clyde']
    .map((name) => ghostByName(state, name))
    .find((g) => g?.state === 'house');
}

function release(state, ghost) {
  ghost.state = 'leaving';
  // Blinky's Elroy speed, paused by a lost life, comes back once Clyde is out.
  if (ghost.name === 'clyde') state.elroySuspended = false;
}

/** Call for every dot or energizer Pac-Man eats. */
export function countDot(state) {
  state.dotTimer = 0;
  if (state.globalDots !== null) {
    state.globalDots += 1;
    return;
  }
  const ghost = nextInHouse(state);
  if (ghost) ghost.dots += 1;
}

/**
 * Lets the next ghost out of the house when its dot counter is reached, or
 * when Pac-Man has gone too long without eating. Once per tick.
 */
export function updateRelease(state) {
  const ghost = nextInHouse(state);
  if (!ghost) {
    state.dotTimer = 0;
    return;
  }
  state.dotTimer += TICK_MS;
  if (state.dotTimer >= levelSpec(state.level).dotTimerMs) {
    state.dotTimer = 0;
    release(state, ghost);
    return;
  }

  if (state.globalDots !== null) {
    // The shared counter goes back to the personal ones if it reaches 32 with
    // Clyde still inside. It never lets Clyde out itself.
    const clyde = ghostByName(state, 'clyde');
    if (state.globalDots >= 32 && clyde?.state === 'house') {
      state.globalDots = null;
    } else if (state.globalDots >= (GLOBAL_RELEASE[ghost.name] ?? Infinity)) {
      release(state, ghost);
    }
    return;
  }
  if (ghost.dots >= personalDotLimit(ghost.name, state.level)) release(state, ghost);
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

/** Speed in % of BASE_SPEED. */
export function ghostSpeed(state, ghost) {
  if (ghost.state === 'eyes' || ghost.state === 'entering') return EYES_SPEED;
  if (ghost.state === 'house' || ghost.state === 'leaving') return HOUSE_SPEED;
  const spec = levelSpec(state.level);
  const { col, row } = tileOf(ghost);
  if (isTunnel(col, row)) return spec.tunnel;
  if (ghost.frightened) return spec.ghostFright;
  if (ghost.name === 'blinky') {
    const stage = elroyStage(state);
    if (stage === 2) return spec.elroy2;
    if (stage === 1) return spec.elroy1;
  }
  return spec.ghost;
}

/**
 * Moves one coordinate toward a value, and returns the distance left over.
 * Used for the scripted walks in and out of the house, which ignore tiles.
 */
function walk(ghost, axis, to, dist) {
  const gap = to - ghost[axis];
  if (Math.abs(gap) <= dist) {
    ghost[axis] = to;
    return dist - Math.abs(gap);
  }
  ghost[axis] += Math.sign(gap) * dist;
  if (axis === 'x') ghost.dir = gap > 0 ? 'right' : 'left';
  else ghost.dir = gap > 0 ? 'down' : 'up';
  return 0;
}

function bob(ghost, dist) {
  // Up and down within half a tile of the middle of the house.
  const top = HOUSE.centreY - 0.5;
  const bottom = HOUSE.centreY + 0.5;
  let left = dist;
  while (left > 0) {
    if (ghost.dir === 'up') {
      left = walk(ghost, 'y', top, left);
      if (ghost.y === top) ghost.dir = 'down';
    } else {
      left = walk(ghost, 'y', bottom, left);
      if (ghost.y === bottom) ghost.dir = 'up';
    }
  }
}

function leave(ghost, dist) {
  let left = dist;
  // Back to the middle row, across to the door, then up and out.
  if (ghost.x !== HOUSE.doorX) {
    left = walk(ghost, 'y', HOUSE.centreY, left);
    left = walk(ghost, 'x', HOUSE.doorX, left);
  }
  left = walk(ghost, 'y', HOUSE.exitY, left);
  if (ghost.y === HOUSE.exitY && ghost.x === HOUSE.doorX) {
    ghost.state = 'active';
    ghost.dir = 'left';
  }
  return left;
}

function enter(ghost, dist) {
  let left = dist;
  // Into the door lane and down to the middle of the house, then across to
  // its own place there.
  if (ghost.y !== HOUSE.centreY) {
    left = walk(ghost, 'x', HOUSE.doorX, left);
    left = walk(ghost, 'y', HOUSE.centreY, left);
  }
  left = walk(ghost, 'x', HOME_X[ghost.name], left);
  if (ghost.y === HOUSE.centreY && ghost.x === HOME_X[ghost.name]) {
    // Revived, and straight back out: eaten ghosts do not wait for dots.
    ghost.state = 'leaving';
    ghost.frightened = false;
  }
  return left;
}

/** Moves a ghost for one tick. */
export function moveGhost(state, ghost) {
  let dist = (ghostSpeed(state, ghost) / 100) * BASE_SPEED * (TICK_MS / 1000);
  if (ghost.state === 'house') {
    bob(ghost, dist);
    return;
  }
  if (ghost.state === 'leaving') {
    leave(ghost, dist);
    return;
  }
  if (ghost.state === 'entering') {
    enter(ghost, dist);
    return;
  }

  while (dist > 0) {
    const { used, reached } = stepToCentre(ghost, dist);
    dist -= used;
    if (!reached) return;
    if (ghost.state === 'eyes' && ghost.y === HOUSE.exitY && Math.abs(ghost.x - HOUSE.doorX) < 1) {
      ghost.state = 'entering';
      enter(ghost, dist);
      return;
    }
    ghost.dir = chooseDirection(state, ghost);
  }
}
