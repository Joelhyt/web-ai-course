// Wires the pure game rules to the canvas, the keyboard and the HUD,
// and owns the animation loop.

import {
  createGame,
  tick,
  advanceClock,
  queueDirection,
  effectiveInterval,
  effectMs,
} from './game.js';
import { render, resizeCanvas, viewSize } from './renderer.js';
import { attachKeyboard } from './input.js';
import { loadHighScore, saveHighScore } from './storage.js';
import { POWER_UPS, POWER_UP_TYPES } from './config.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('high-score');
const statusEl = document.getElementById('status');
const wallsEl = document.getElementById('walls');
const modeEl = document.getElementById('mode');
const effectsEl = document.getElementById('effects');
const timeStatEl = document.getElementById('time-stat');
const timeEl = document.getElementById('time');
const depthStatEl = document.getElementById('depth-stat');
const depthEl = document.getElementById('depth');
const shardsStatEl = document.getElementById('shards-stat');
const shardsEl = document.getElementById('shards');
const wallsLabelEl = document.getElementById('walls-label');
const adventureHintEl = document.getElementById('adventure-hint');

// createGame layers the mode's own preset over these. Adventure is not given a
// wall setting at all: its dungeon has its own edges, and an override here
// would beat the preset and wrap the snake through solid rock.
const settings = () => (modeEl.value === 'adventure'
  ? { mode: 'adventure' }
  : { walls: wallsEl.value, mode: modeEl.value });

let highScore = loadHighScore(modeEl.value);
let state = createGame(settings());
let lastFrame = performance.now();
let accumulator = 0;
let camera = { x: 0, y: 0 };

/**
 * Where the window wants to be: centred on the head, clamped so it never runs
 * off the edge of the world. The clamp is why the snake sits dead centre in the
 * middle of a floor but drifts off-centre near its walls — chasing the head
 * past the edge would just scroll rock into view.
 */
function cameraTarget() {
  const view = viewSize(state.config);
  const head = state.snake[0];
  const clamp = (value, max) => Math.min(Math.max(value, 0), Math.max(0, max));
  return {
    x: clamp(head.x + 0.5 - view.cols / 2, state.config.cols - view.cols),
    y: clamp(head.y + 0.5 - view.rows / 2, state.config.rows - view.rows),
  };
}

resizeCanvas(canvas, ctx, state.config);

function restart() {
  state = createGame(settings());
  highScore = loadHighScore(state.config.mode);
  accumulator = 0;
  // Modes do not share a board size, so the canvas is resized on every restart
  // rather than only when the window changes.
  resizeCanvas(canvas, ctx, state.config);
  camera = cameraTarget(); // snap, rather than sweeping in from the last round
  syncModeControls();
}

// Wall behaviour is Adventure's to decide, so its control steps aside there.
function syncModeControls() {
  const adventure = state.config.mode === 'adventure';
  wallsLabelEl.hidden = adventure;
  adventureHintEl.hidden = !adventure;
}

function togglePause() {
  if (state.status === 'ready' || state.status === 'paused') {
    state.status = 'running';
  } else if (state.status === 'running') {
    state.status = 'paused';
  } else {
    restart();
  }
}

attachKeyboard({
  onDirection(direction) {
    if (state.status === 'ready') state.status = 'running';
    if (state.status === 'running') queueDirection(state, direction);
  },
  onTogglePause: togglePause,
  onRestart: restart,
});

camera = cameraTarget();
syncModeControls();

// Switching wall behaviour or mode mid-round would be ambiguous, so either
// starts a fresh one.
wallsEl.addEventListener('change', restart);
modeEl.addEventListener('change', restart);

// Coming back to a dead snake because the tab was in the background is miserable.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.status === 'running') state.status = 'paused';
});

// The device pixel ratio changes when a window moves between monitors.
window.addEventListener('resize', () => resizeCanvas(canvas, ctx, state.config));

const STATUS_LABEL = {
  ready: 'Ready',
  running: 'Playing',
  paused: 'Paused',
  over: 'Game over',
  timeup: "Time's up",
  won: 'Cleared!',
};

// Tenths below ten seconds: whole seconds read as frozen when they are the
// thing the player is racing, and the last stretch is where the tension is.
function formatClock(ms) {
  const seconds = ms / 1000;
  return seconds >= 10 ? `${Math.ceil(seconds)}s` : `${seconds.toFixed(1)}s`;
}

// One chip per power-up, built once and then only shown, hidden and refilled.
// Rebuilding the list every frame would thrash the DOM 60 times a second.
const chips = new Map(POWER_UP_TYPES.map((type) => {
  const meta = POWER_UPS[type];

  const chip = document.createElement('li');
  chip.className = 'effect';
  chip.hidden = true;
  chip.style.setProperty('--effect-color', meta.color);

  const label = document.createElement('span');
  label.className = 'effect-label';
  label.textContent = meta.label;

  const track = document.createElement('span');
  track.className = 'effect-track';
  const bar = document.createElement('span');
  bar.className = 'effect-bar';
  track.append(bar);

  chip.append(label, track);
  effectsEl.append(chip);

  return [type, { chip, bar }];
}));

function updateEffects() {
  for (const type of POWER_UP_TYPES) {
    const ms = effectMs(state, type);
    const { chip, bar } = chips.get(type);
    chip.hidden = ms <= 0;
    if (ms > 0) {
      bar.style.width = `${(ms / POWER_UPS[type].duration) * 100}%`;
    }
  }
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  highScoreEl.textContent = String(highScore);
  statusEl.textContent = STATUS_LABEL[state.status];

  depthStatEl.hidden = state.depth === null;
  shardsStatEl.hidden = state.depth === null;
  if (state.depth !== null) {
    depthEl.textContent = String(state.depth);
    // Counting up to the floor's total reads better than counting down to zero:
    // the target is visible from the first shard.
    const total = state.shards.length + state.shardsTaken;
    shardsEl.textContent = `${state.shardsTaken}/${total}`;
    shardsEl.classList.toggle('urgent', state.portalOpen);
  }

  timeStatEl.hidden = state.timeLeft === null;
  if (state.timeLeft !== null) {
    timeEl.textContent = formatClock(state.timeLeft);
    timeEl.classList.toggle('urgent', state.timeLeft <= 10_000);
  }

  updateEffects();
}

function frame(now) {
  // Clamping stops a stalled or backgrounded tab from accumulating a huge delta
  // and then firing a burst of catch-up ticks the player never sees coming.
  const delta = Math.min(now - lastFrame, 250);
  lastFrame = now;

  if (state.status === 'running') {
    // Effect timers, the collectible's lifetime and the time attack clock all
    // run on this delta rather than on ticks, so none of them is shortened by
    // a fast snake.
    advanceClock(state, delta);
    accumulator += delta;
    // A fixed timestep keeps the snake moving at the same speed regardless of
    // whether the display refreshes at 60Hz, 120Hz or 144Hz. The interval is
    // read inside the loop because Slow can start or end on any of these ticks.
    let interval = effectiveInterval(state);
    while (accumulator >= interval && state.status === 'running') {
      accumulator -= interval;
      tick(state);
      interval = effectiveInterval(state);
    }

    if (state.status !== 'running') {
      accumulator = 0;
      if (state.score > highScore) {
        highScore = state.score;
        saveHighScore(state.config.mode, highScore);
      }
    }
  } else {
    accumulator = 0;
  }

  // Exponential smoothing on the real delta, so the scroll feels the same at
  // 60Hz and 144Hz instead of being however far a fixed fraction gets per frame.
  const target = cameraTarget();
  const follow = 1 - Math.exp(-delta / 70);
  camera = {
    x: camera.x + (target.x - camera.x) * follow,
    y: camera.y + (target.y - camera.y) * follow,
  };

  updateHud();
  render(ctx, state, now, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
