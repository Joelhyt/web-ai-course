// All tunables live here so the feel of the game can be adjusted in one place.
// The defaults follow the modern Tetris guideline.

export const DEFAULTS = Object.freeze({
  cols: 10,
  // The guideline playfield is 40 rows tall, of which only the bottom 20 are
  // shown. The rest is buffer: pieces spawn there, and a stack pushed above the
  // visible board is still a stack rather than an instant loss.
  rows: 40,
  visibleRows: 20,
  bufferShown: 2, // buffer rows drawn above the well, so a spawning piece is visible
  cell: 26, // CSS pixels per mino at the largest size; the canvas shrinks to fit the window

  mode: 'marathon', // see MODE_PRESETS below
  previewCount: 5, // pieces shown in the next queue
  countdownMs: 1600, // READY … GO before the first piece drops

  startLevel: 1,
  linesPerLevel: 10,
  levelUp: true,
  lineGoal: 150, // lines that end the round

  // Extended placement lock down: a piece on the ground locks after lockDelay,
  // but every move or rotation restarts that timer — at most maxLockResets
  // times, so a piece cannot be spun forever. Reaching a new lowest row gives
  // the resets back.
  lockDelay: 500,
  maxLockResets: 15,

  softDropFactor: 20, // soft drop is this many times faster than gravity
});

export const MODE_PRESETS = Object.freeze({
  // Fifteen levels of speeding gravity; clearing 150 lines finishes the run.
  marathon: Object.freeze({ lineGoal: 150 }),
  // Forty lines as fast as possible. Gravity stays at level 1 throughout: the
  // clock is the pressure, and a faster drop would only punish good players for
  // clearing lines quickly.
  sprint: Object.freeze({ lineGoal: 40, levelUp: false }),
});

export const MODES = Object.freeze(Object.keys(MODE_PRESETS));

// Delayed auto shift: hold a direction and the piece moves once, waits DAS,
// then repeats every ARR. These are Tetris Effect's defaults (10 and 2 frames).
export const INPUT = Object.freeze({
  das: 167,
  arr: 33,
});

// Guideline scoring. Line clears and T-spins are multiplied by the level; drop
// points are not.
export const SCORING = Object.freeze({
  lines: Object.freeze([0, 100, 300, 500, 800]), // single … tetris
  tspin: Object.freeze([400, 800, 1200, 1600]), // no lines … triple
  tspinMini: Object.freeze([100, 200, 400]), // no lines … double
  perfectClear: Object.freeze([0, 800, 1200, 1800, 2000]),
  perfectClearB2BTetris: 3200,
  backToBack: 1.5, // multiplier on a difficult clear that follows another
  combo: 50, // × combo count × level
  softDrop: 1, // per row
  hardDrop: 2, // per row
});

// The guideline colours, in shades that sit on the same dark board as Snake.
export const COLORS = Object.freeze({
  I: '#22d3ee',
  J: '#60a5fa',
  L: '#fb923c',
  O: '#facc15',
  S: '#4ade80',
  T: '#c084fc',
  Z: '#f87171',
  well: '#10151c',
  wellEdge: '#232c38',
  grid: '#1a2330',
  label: '#94a3b8',
  held: '#475569', // the hold piece while it cannot be swapped back
  flash: '#f8fafc',
  overlay: 'rgba(16, 21, 28, 0.86)',
  title: '#f8fafc',
  subtitle: '#94a3b8',
  accent: '#c084fc',
});
