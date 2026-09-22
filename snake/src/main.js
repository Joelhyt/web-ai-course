// Wires the pure game rules to the canvas, the keyboard and the HUD,
// and owns the animation loop.

import { createGame, tick, queueDirection, effectiveInterval, effectTicks } from './game.js';
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
const effectsEl = document.getElementById('effects');

let highScore = loadHighScore();
let state = createGame({ walls: wallsEl.value });
let lastFrame = performance.now();
let accumulator = 0;

resizeCanvas(canvas, ctx, state.config);

function restart() {
  state = createGame({ walls: wallsEl.value });
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

// Switching wall behaviour mid-round would be ambiguous, so it starts a fresh one.
wallsEl.addEventListener('change', restart);

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
  won: 'Cleared!',
};

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
    const ticks = effectTicks(state, type);
    const { chip, bar } = chips.get(type);
    chip.hidden = ticks <= 0;
    if (ticks > 0) {
      bar.style.width = `${(ticks / POWER_UPS[type].duration) * 100}%`;
    }
  }
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  highScoreEl.textContent = String(highScore);
  statusEl.textContent = STATUS_LABEL[state.status];
  updateEffects();
}

function frame(now) {
  // Clamping stops a stalled or backgrounded tab from accumulating a huge delta
  // and then firing a burst of catch-up ticks the player never sees coming.
  const delta = Math.min(now - lastFrame, 250);
  lastFrame = now;

  if (state.status === 'running') {
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
        saveHighScore(highScore);
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
