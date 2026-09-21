// All tunables live here so the feel of the game can be adjusted in one place.

export const DEFAULTS = Object.freeze({
  cols: 20,
  rows: 20,
  cell: 24, // CSS pixels per grid square

  baseInterval: 140, // ms between moves at score 0
  minInterval: 60, // fastest the game is allowed to get
  speedStep: 4, // ms shaved off the interval per food eaten

  walls: 'solid', // 'solid' ends the round on contact, 'wrap' teleports to the far side
});

// At most two inputs are buffered. Any more and turns start feeling delayed
// because the player is queueing moves several ticks ahead of what they see.
export const MAX_QUEUED = 2;

export const COLORS = Object.freeze({
  background: '#10151c',
  grid: '#1a222d',
  snake: '#4ade80',
  snakeHead: '#bbf7d0',
  food: '#f87171',
  overlay: 'rgba(16, 21, 28, 0.82)',
  title: '#f8fafc',
  subtitle: '#94a3b8',
});
