// All tunables live here so the feel of the game can be adjusted in one place.
// Units are metres, seconds and degrees. y points up: it is altitude.

export const WORLD = Object.freeze({
  width: 400, // the sides wrap around
  height: 300, // a ceiling: the lander cannot climb past it
});

// The simulation runs in fixed 1/60 s steps whatever the display's refresh
// rate, so a landing does not depend on the machine it is flown on.
export const TICK_MS = 1000 / 60;

export const PHYSICS = Object.freeze({
  gravity: 1.62, // the Moon's, m/s²
  thrust: 4.5, // the main engine's acceleration, m/s², along the lander's axis
  rotationSpeed: 120, // °/s
  maxTilt: 90, // ° either side of upright
  fuelBurn: 10, // fuel units per second of thrust
});

export const FUEL = Object.freeze({
  start: 1000,
  crashPenalty: 250, // a crash costs this on top of what was burnt
  landingBonus: 50, // a good landing gives this back
});

// A touchdown is judged on the speeds and tilt at the moment of contact. Speeds
// in m/s, tilt in degrees either side of upright.
export const LIMITS = Object.freeze({
  good: Object.freeze({ vertical: 2, horizontal: 1.5, tilt: 8 }),
  hard: Object.freeze({ vertical: 4, horizontal: 2.5, tilt: 12 }),
});

export const SCORING = Object.freeze({
  good: 50, // × the pad's multiplier
  hard: 15, // × the pad's multiplier
  crash: 5, // for the attempt, as in the arcade
  fuelPerPoint: 10, // a good landing scores a point for every this much fuel left
});

export const ROUND = Object.freeze({
  resultMs: 2600, // how long the outcome shows before the next round
  startAltitude: 230, // high enough to clear any ground, low enough to stay below the readouts
  startInset: 40, // the lander starts this far in from one side…
  startDrift: Object.freeze([8, 12]), // …drifting toward the other at this speed, m/s
});

export const TERRAIN = Object.freeze({
  segments: 128, // a power of two, for midpoint displacement: 3.125 m per segment
  minHeight: 10,
  maxHeight: 170,
  amplitude: 120, // the first, coarsest displacement, m
  roughness: 0.55, // each finer level displaces by this fraction of the one before
  // Pad widths in m on round 1, and the narrowest they shrink to.
  padWidths: Object.freeze({ 2: 40, 3: 26, 5: 15 }),
  minPadWidths: Object.freeze({ 2: 24, 3: 17, 5: 12 }),
  padShrink: 0.94, // per round
  padGap: 24, // at least this much ground between two pads, m
  // Nothing within this distance of a pad's ends stands higher than the pad, so
  // the lander's body clears the ground beside it.
  padClearance: 8,
  padStep: 2, // and stands at least this much lower, so the pad's ends show
});

// The lander's outline in its own frame, origin at its centre of rotation, y up.
// The two feet come first; the rest are body points that must never touch.
export const LANDER_POINTS = Object.freeze([
  Object.freeze({ x: -5, y: -6 }),
  Object.freeze({ x: 5, y: -6 }),
  Object.freeze({ x: -4, y: -1 }),
  Object.freeze({ x: 4, y: -1 }),
  Object.freeze({ x: -3, y: 7 }),
  Object.freeze({ x: 3, y: 7 }),
]);
export const FEET = 2; // how many of LANDER_POINTS are feet

export const COLORS = Object.freeze({
  space: '#0b0f14',
  star: '#475569',
  ground: '#111821',
  terrain: '#94a3b8',
  pad: '#f8fafc',
  padLabel: '#38bdf8',
  lander: '#e2e8f0',
  flame: '#fb923c',
  flameCore: '#fde68a',
  safe: '#4ade80',
  unsafe: '#f8fafc',
  label: '#94a3b8',
  warning: '#f87171',
  overlay: 'rgba(11, 15, 20, 0.86)',
  title: '#f8fafc',
  subtitle: '#94a3b8',
  good: '#4ade80',
  hard: '#facc15',
  crash: '#f87171',
});
