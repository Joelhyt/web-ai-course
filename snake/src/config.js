// All tunables live here so the feel of the game can be adjusted in one place.

export const DEFAULTS = Object.freeze({
  cols: 20,
  rows: 20,
  cell: 24, // CSS pixels per grid square

  baseInterval: 140, // ms between moves at score 0
  minInterval: 60, // fastest the game is allowed to get
  speedStep: 4, // ms shaved off the interval per food eaten

  walls: 'solid', // 'solid' ends the round on contact, 'wrap' teleports to the far side

  // Power-ups. Every duration and lifetime is counted in ticks rather than
  // milliseconds: the rules never read a clock, and a slowed snake still gets
  // the same number of moves out of an effect as a fast one.
  slowFactor: 1.9, // tick interval multiplier while Slow is active
  powerUpChance: 0.03, // per-tick odds of one appearing when the board has none
  powerUpLifetime: 60, // ticks a collectible stays on the board before fading
  powerUpCooldown: 40, // ticks before another may appear (also the head start)
});

// At most two inputs are buffered. Any more and turns start feeling delayed
// because the player is queueing moves several ticks ahead of what they see.
export const MAX_QUEUED = 2;

/**
 * The three collectibles. `duration` is in ticks; `color` and `glyph` are what
 * the renderer and the HUD use, so a new power-up only needs an entry here plus
 * its effect in `tick`.
 */
export const POWER_UPS = Object.freeze({
  slow: Object.freeze({
    label: 'Slow',
    duration: 55,
    color: '#38bdf8',
    detail: 'the snake moves at a crawl',
  }),
  ghost: Object.freeze({
    label: 'Ghost',
    duration: 45,
    color: '#c084fc',
    detail: 'pass straight through your own body',
  }),
  magnet: Object.freeze({
    label: 'Magnet',
    duration: 55,
    color: '#fbbf24',
    detail: 'food is dragged toward the head',
  }),
});

export const POWER_UP_TYPES = Object.freeze(Object.keys(POWER_UPS));

export const COLORS = Object.freeze({
  background: '#10151c',
  grid: '#212c3b',
  snake: '#4ade80',
  snakeHead: '#bbf7d0',
  food: '#f87171',
  overlay: 'rgba(16, 21, 28, 0.82)',
  title: '#f8fafc',
  subtitle: '#94a3b8',
});
