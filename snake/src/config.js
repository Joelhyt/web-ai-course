// All tunables live here so the feel of the game can be adjusted in one place.

export const DEFAULTS = Object.freeze({
  cols: 20,
  rows: 20,
  cell: 24, // CSS pixels per grid square

  baseInterval: 120, // ms between moves at score 0
  minInterval: 60, // fastest the game is allowed to get
  speedStep: 1, // ms shaved off the interval per food eaten

  walls: 'solid', // 'solid' ends the round on contact, 'wrap' teleports to the far side
  mode: 'classic', // 'classic' plays until you crash, 'time' is a 60 second sprint
  timeLimit: 60_000, // ms on the clock in time attack

  // Power-ups. Every duration is in milliseconds and is spent against the wall
  // clock, not against ticks: a power-up collected by a long, fast snake has to
  // last exactly as long as one collected in the opening seconds of a round.
  slowFactor: 1.9, // tick interval multiplier while Slow is active
  powerUpChance: 0.5, // odds per second of one appearing when the board has none
  powerUpLifetime: 8000, // ms a collectible stays on the board before fading
  powerUpCooldown: 4000, // ms before another may appear (also the head start)
  feastMultiplier: 6, // food items on the board while Feast is running
});

// At most two inputs are buffered. Any more and turns start feeling delayed
// because the player is queueing moves several ticks ahead of what they see.
export const MAX_QUEUED = 2;

/**
 * The four collectibles. `duration` is in milliseconds; `color` and `label` are
 * what the renderer and the HUD use, so a new power-up only needs an entry here
 * plus its effect in `tick`.
 */
export const POWER_UPS = Object.freeze({
  slow: Object.freeze({
    label: 'Slow',
    duration: 6000,
    color: '#38bdf8',
    detail: 'the snake moves at a crawl',
  }),
  ghost: Object.freeze({
    label: 'Ghost',
    duration: 5000,
    color: '#c084fc',
    detail: 'pass straight through your own body',
  }),
  magnet: Object.freeze({
    label: 'Magnet',
    duration: 6000,
    color: '#fbbf24',
    detail: 'food is dragged toward the head',
  }),
  feast: Object.freeze({
    label: 'Feast',
    duration: 6500,
    color: '#f472b6',
    detail: 'four times the food, while it lasts',
  }),
});

export const POWER_UP_TYPES = Object.freeze(Object.keys(POWER_UPS));

export const COLORS = Object.freeze({
  background: '#10151c',
  grid: '#212c3b',
  snake: '#4ade80',
  snakeHead: '#bbf7d0',
  food: '#f87171',
  bonusFood: '#f472b6', // the extra, temporary food Feast puts out
  overlay: 'rgba(16, 21, 28, 0.82)',
  title: '#f8fafc',
  subtitle: '#94a3b8',
});
