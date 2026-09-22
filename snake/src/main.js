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
import { render, resizeCanvas } from './renderer.js';
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

const settings = () => ({ walls: wallsEl.value, mode: modeEl.value });

let highScore = loadHighScore(modeEl.value);
let state = createGame(settings());
let lastFrame = performance.now();
let accumulator = 0;

resizeCanvas(canvas, ctx, state.config);

function restart() {
  state = createGame(settings());
  highScore = loadHighScore(state.config.mode);
  accumulator = 0;
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

  updateHud();
  render(ctx, state, now);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
