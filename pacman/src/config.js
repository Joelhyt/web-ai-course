// All tunables live here so the feel of the game can be adjusted in one place.
// The per-level numbers follow the arcade original as documented in Jamey
// Pittman's "The Pac-Man Dossier".

export const DEFAULTS = Object.freeze({
  cell: 20, // CSS pixels per tile at the largest size; the canvas shrinks to fit the window
  lives: 3,
  extraLifeAt: 10000, // one bonus life, once per game
  startMs: 2200, // READY! before the first life of a game
  readyMs: 1600, // READY! after a lost life or a cleared level
  ghostEatenMs: 1000, // everything stops while an eaten ghost's points show
  deathFreezeMs: 1000, // the moment of the catch, before Pac-Man shrivels
  deathAnimMs: 1500,
  deathPauseMs: 600, // the empty maze before the next life
  clearMs: 2400, // a cleared maze stands, then flashes, before the next level
  fruitMs: 9500, // how long a bonus fruit stays (the arcade picks 9⅓ to 10 s)
  fruitDots: Object.freeze([70, 170]), // dots eaten when a fruit appears
  popupMs: 2000, // how long fruit points show
});

// The arcade runs at 60 frames a second and so does the simulation, whatever
// the display's refresh rate: advanceClock steps it in fixed ticks.
export const TICK_MS = 1000 / 60;

// "100%" speed in the Dossier is 75.76 pixels a second, on 8-pixel tiles.
export const BASE_SPEED = 75.75757625 / 8; // tiles per second

export const EYES_SPEED = 150; // % — eaten ghosts hurry home
export const HOUSE_SPEED = 50; // % — bobbing in the house and walking out of it

// How far from a tile's centre, in tiles, Pac-Man may already (or still) take
// a turn. He then moves diagonally until he is back on the new lane, which is
// the arcade's cornering advantage over the ghosts.
export const CORNER_WINDOW = 0.4;

// Eating stops Pac-Man for a frame per dot and three per energizer. This is
// why he is slower than a ghost of the same speed through a lane of dots.
export const EAT_PAUSE_TICKS = Object.freeze({ dot: 1, energizer: 3 });

export const SCORING = Object.freeze({
  dot: 10,
  energizer: 50,
  ghosts: Object.freeze([200, 400, 800, 1600]), // per energizer, in the order eaten
});

export const FRUITS = Object.freeze([
  Object.freeze({ name: 'cherries', points: 100 }),
  Object.freeze({ name: 'strawberry', points: 300 }),
  Object.freeze({ name: 'orange', points: 500 }),
  Object.freeze({ name: 'apple', points: 700 }),
  Object.freeze({ name: 'melon', points: 1000 }),
  Object.freeze({ name: 'galaxian', points: 2000 }),
  Object.freeze({ name: 'bell', points: 3000 }),
  Object.freeze({ name: 'key', points: 5000 }),
]);

/** Index into FRUITS for a level: 1, 2, 3–4, 5–6, 7–8, 9–10, 11–12, then keys. */
function fruitIndex(level) {
  if (level <= 2) return level - 1;
  return Math.min(7, Math.floor((level - 3) / 2) + 2);
}

// Scatter, chase, scatter, chase … in ms. The ghosts start in scatter and the
// last chase never ends. From level 2 the third chase lasts over 17 minutes and
// the last scatter a single frame, which in practice is endless chase with one
// extra reversal.
const SCHEDULES = Object.freeze({
  first: Object.freeze([7000, 20000, 7000, 20000, 5000, 20000, 5000, Infinity]),
  early: Object.freeze([7000, 20000, 7000, 20000, 5000, 1033000, 1000 / 60, Infinity]),
  late: Object.freeze([5000, 20000, 5000, 20000, 5000, 1037000, 1000 / 60, Infinity]),
});

// Fright time in seconds and the number of flashes before it ends, levels 1–18.
// From level 19 the ghosts no longer turn blue at all; they only reverse.
const FRIGHT = Object.freeze([
  [6, 5], [5, 5], [4, 5], [3, 5], [2, 5], [5, 5], [2, 5], [2, 5], [1, 3],
  [5, 5], [2, 5], [1, 3], [1, 3], [3, 5], [1, 3], [1, 3], [0, 0], [1, 3],
]);

// Dots left when Blinky turns into "Cruise Elroy" (faster, and chasing even in
// scatter). The second, faster stage starts at half as many.
function elroyDots(level) {
  if (level === 1) return 20;
  if (level === 2) return 30;
  if (level <= 5) return 40;
  if (level <= 8) return 50;
  if (level <= 11) return 60;
  if (level <= 14) return 80;
  if (level <= 18) return 100;
  return 120;
}

// Speeds as % of BASE_SPEED.
function speeds(level) {
  if (level === 1) {
    return { pac: 80, pacFright: 90, ghost: 75, ghostFright: 50, tunnel: 40, elroy1: 80, elroy2: 85 };
  }
  if (level <= 4) {
    return { pac: 90, pacFright: 95, ghost: 85, ghostFright: 55, tunnel: 45, elroy1: 90, elroy2: 95 };
  }
  if (level <= 20) {
    return { pac: 100, pacFright: 100, ghost: 95, ghostFright: 60, tunnel: 50, elroy1: 100, elroy2: 105 };
  }
  return { pac: 90, pacFright: 90, ghost: 95, ghostFright: 60, tunnel: 50, elroy1: 100, elroy2: 105 };
}

// A flash is one white and one blue phase.
export const FLASH_MS = 400;

/** Everything that changes from level to level. */
export function levelSpec(level) {
  const [frightSeconds, flashes] = FRIGHT[Math.min(level, FRIGHT.length + 1) - 1] ?? [0, 0];
  let schedule = SCHEDULES.late;
  if (level === 1) schedule = SCHEDULES.first;
  else if (level <= 4) schedule = SCHEDULES.early;
  const elroy1Dots = elroyDots(level);
  return {
    ...speeds(level),
    frightMs: frightSeconds * 1000,
    flashes,
    schedule,
    elroy1Dots,
    elroy2Dots: elroy1Dots / 2,
    fruit: FRUITS[fruitIndex(level)],
    // With no dot eaten for this long, the next ghost leaves the house anyway.
    dotTimerMs: level <= 4 ? 4000 : 3000,
  };
}

// Dots each ghost waits for in the house at the start of a level, before the
// first life is lost. After that a shared counter takes over (see ghosts.js).
export function personalDotLimit(name, level) {
  if (name === 'inky') return level === 1 ? 30 : 0;
  if (name === 'clyde') {
    if (level === 1) return 60;
    if (level === 2) return 50;
  }
  return 0;
}

export const COLORS = Object.freeze({
  maze: '#0b0f14',
  wall: '#3b82f6',
  wallFlash: '#f8fafc',
  door: '#f9a8d4',
  dot: '#fcd9b6',
  pac: '#facc15',
  blinky: '#ef4444',
  pinky: '#f9a8d4',
  inky: '#22d3ee',
  clyde: '#fb923c',
  frightened: '#2563eb',
  frightenedFace: '#fde68a',
  flash: '#f8fafc',
  flashFace: '#ef4444',
  eyeWhite: '#f8fafc',
  pupil: '#1e3a8a',
  ghostPoints: '#22d3ee',
  fruitPoints: '#f9a8d4',
  ready: '#facc15',
  overlay: 'rgba(11, 15, 20, 0.86)',
  title: '#f8fafc',
  subtitle: '#94a3b8',
  gameOver: '#ef4444',
});
