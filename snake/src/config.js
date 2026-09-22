// All tunables live here so the feel of the game can be adjusted in one place.

export const DEFAULTS = Object.freeze({
  cols: 20,
  rows: 20,
  cell: 24, // CSS pixels per grid square

  // How much of the grid the canvas shows. Null means "all of it" — only
  // Adventure plays on a world bigger than its window, scrolled by the camera.
  viewCols: null,
  viewRows: null,

  baseInterval: 120, // ms between moves at score 0
  minInterval: 60, // fastest the game is allowed to get
  speedStep: 1, // ms shaved off the interval per food eaten

  walls: 'solid', // 'solid' ends the round on contact, 'wrap' teleports to the far side
  mode: 'classic', // see MODE_PRESETS below
  timeLimit: 60_000, // ms on the clock in time attack

  // Adventure. The snake's speed comes from the depth rather than the score,
  // because a floor hands out points in lumps and a score-driven snake would
  // lurch faster every time you picked a shard up.
  shardGrowth: 2, // segments gained per shard
  depthBonus: 10, // points for clearing a floor
  depthStep: 4, // ms shaved off the interval per floor descended

  // Arriving on a floor. You cannot see what is around you the instant you
  // land, so the snake crawls for a moment and winds back up to pace. Without
  // it, descending at depth 12 means dying to a wall you never had time to read.
  graceMs: 2200,
  graceFactor: 3.6, // interval multiplier at the moment of arrival

  // Enemies. Every number here exists to keep them fair: they are always slower
  // than the snake, they announce themselves before they move, and they expire.
  enemyFromDepth: 3, // the first floor that can hunt you
  enemySpeedFactor: 1.55, // multiples of the snake's *current* interval
  enemyLifetime: 16_000, // ms a crawler hunts before it fades out
  enemyFadeMs: 2500, // ms of visible fading before it is gone
  enemyWakeMs: 1200, // ms a crawler spends surfacing, motionless, on arrival
  enemyChance: 0.32, // odds per second of one surfacing
  enemyCooldown: 6000, // ms between arrivals
  enemySpawnDistance: 14, // minimum tiles away it may surface
  enemyLength: 5,
  sleeperWakeRadius: 6, // how close you have to get to wake one
  sleeperWakeMs: 800,
  sleeperHuntMs: 11_000,

  // Power-ups. Every duration is in milliseconds and is spent against the wall
  // clock, not against ticks: a power-up collected by a long, fast snake has to
  // last exactly as long as one collected in the opening seconds of a round.
  slowFactor: 1.9, // tick interval multiplier while Slow is active
  powerUpChance: 0.5, // odds per second of one appearing when the board has none
  powerUpLifetime: 8000, // ms a collectible stays on the board before fading
  powerUpCooldown: 4000, // ms before another may appear (also the head start)
  feastMultiplier: 6, // food items on the board while Feast is running
});

/**
 * What each mode changes about the board. Adventure's 24x24 window at 20px
 * keeps the canvas exactly as wide as the other two modes' 20x24px.
 */
export const MODE_PRESETS = Object.freeze({
  classic: Object.freeze({}),
  time: Object.freeze({}),
  // Adventure's world is far larger than the canvas: the camera follows the
  // snake and scrolls the dungeon behind it, which is what lets a floor be a
  // place to explore rather than a single screen to survive.
  adventure: Object.freeze({
    cols: 60,
    rows: 45,
    viewCols: 24,
    viewRows: 24,
    cell: 20,
    walls: 'solid',
    baseInterval: 135,
  }),
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

  // Adventure
  rock: '#090d13', // dungeon wall fill: darker than the board, so rooms read as carved out
  rockEdge: '#31445c', // the lit face a wall shows to the room above it
  rockDeep: '#05080c', // the darker tiles in the rubble texture
  floor: '#18212e', // open dungeon floor
  floorAlt: '#1b2533', // its flagstone variation
  floorGrid: '#222e3e',
  shard: '#67e8f9',
  crawler: '#fb7185', // the hunter that surfaces and comes for you
  crawlerHead: '#ffe4e6',
  sleeper: '#fb923c', // the coiled one, once it wakes
  sleeperDormant: '#6b5a3f', // and while it is still asleep
  portalLocked: '#7c8ba1',
  portalOpen: '#34d399',
  title: '#f8fafc',
  subtitle: '#94a3b8',
});
